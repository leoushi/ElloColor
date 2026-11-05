import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { createPaintPart, updateSubstrate } from './paint.js?v=compact-studio-3';
import { defaultLighting, galleryLighting, lightingPresets } from './lighting.js?v=workbench-20261104r3';
import { makeWorkbench, workSurfaceY } from './workbench.js?v=workbench-20261104r3';
import { SurfacePreviews } from './surface-previews.js?v=surface-motion-1';
import { makeGalleryScene } from './gallery-scenes.js?v=compact-studio-3';
import { readStudioModel } from './resources.js';
import { planExplosion } from './exploded-layout.js';
import { readGeometry } from './model-store.js';

const departureMs = 390;
const arrivalMs = 780;
const orbitLimit = Math.PI / 2 - .015;
const outdoorOrbitMin = -.12;
const lightFrontDot = .48;
const lightFrontSide = Math.sqrt(1 - lightFrontDot * lightFrontDot);

function addProbeLights(room, profile) {
  room.add(new THREE.HemisphereLight(...profile.ambient));
  for (const [color, intensity, x, y, z] of [profile.key, profile.rim, profile.fill]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    room.add(light);
  }
}

function captureEnvironment(renderer, room, blur) {
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, blur);
  generator.dispose();
  return environment;
}

function studioEnvironment(renderer, preset, bench) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(preset.sky);
  const cloud = preset.id === 'cloud';
  const night = preset.id === 'night';
  const [width, height, power] = preset.source;
  const panels = [
    [cloud ? 12 : 7, cloud ? 10 : 2.4, [0, 6, 1], night ? .42 : cloud ? .75 : 2.1, preset.ambient[0]],
    [5, cloud ? 5 : 2.7, [-5, 4, -3], preset.ambient[2] * .8, preset.ambient[0]],
    [1.5, 4, preset.fill.slice(2), preset.fill[1] * 2.1, preset.fill[0]],
    [5, 2.4, preset.rim.slice(2), preset.rim[1], preset.rim[0]],
    [width, height, preset.key.slice(2), power, preset.key[0]]
  ];
  for (const [width, height, position, power, color] of panels) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    light.position.set(...position);
    light.lookAt(0, 0, 0);
    room.add(light);
  }
  const reflectedBench = bench.clone(true);
  reflectedBench.visible = true;
  reflectedBench.position.y -= 1.45;
  room.add(reflectedBench);
  addProbeLights(room, preset);
  const environment = captureEnvironment(renderer, room, cloud ? .027 : .008);
  reflectedBench.removeFromParent();
  room.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  return environment;
}

export class Stage {
  constructor(canvas, low) {
    this.canvas = canvas;
    const context = canvas.getContext('webgl2', { alpha: true, antialias: !low, powerPreference: 'high-performance' });
    if (!context) throw new Error('此设备需要支持 WebGL 2 才能打开三维工作台。');
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: !low });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.shadowDirty = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x211d19);
    this.ambient = new THREE.HemisphereLight();
    this.lights = [new THREE.DirectionalLight(), new THREE.DirectionalLight(), new THREE.DirectionalLight()];
    this.lightOffsets = this.lights.map(() => new THREE.Vector3());
    this.lightView = new THREE.Vector3();
    this.lightPosition = new THREE.Vector3();
    this.environments = new Map();
    const key = this.lights[0];
    key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .12, far: 24 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.normalBias = .018;
    key.shadow.bias = -.00013;
    key.shadow.radius = 2.25;
    const { bench, tabletop } = makeWorkbench(this.renderer);
    this.bench = bench;
    this.tabletop = tabletop;
    this.tableMaterials = new Set();
    tabletop.traverse(node => {
      if (!node.isMesh) return;
      for (const material of [].concat(node.material)) this.tableMaterials.add(material);
    });
    this.tableOpacity = 1;
    this.scene.add(this.ambient, ...this.lights, this.bench);
    this.galleryBackdrops = new Map();
    this.gallerySun = new THREE.Vector3();
    this.setLighting(defaultLighting);
    this.camera = new THREE.PerspectiveCamera(32, 1, .09, 80);
    this.center = new THREE.Vector3(0, 1.86, 0);
    this.frameCenter = this.center.clone();
    this.cameraTarget = this.center.clone();
    this.cameraBounds = new THREE.Box3();
    this.panAmount = this.panGoal = 0;
    this.panRange = 1;
    this.orbit = { yaw: .43, elevation: .185, distance: 7.3 };
    this.orbitGoal = { ...this.orbit };
    this.preferredYaw = 0;
    this.cameraFlight = null;
    this.focusedPart = null;
    this.exploded = false;
    this.explodeAmount = 0;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.sprayCursor = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xe7f0f8, side: THREE.DoubleSide,
        transparent: true, opacity: .9, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.sprayCursor.visible = false;
    this.sprayCursor.renderOrder = 10;
    this.sprayCursorRotation = new THREE.Quaternion();
    this.sprayCursorAxis = new THREE.Vector3(0, 0, 1);
    this.sprayCursorDepth = new THREE.Vector3();
    this.scene.add(this.sprayCursor);
    this.loader = new GLTFLoader();
    this.models = new Map();
    this.meshes = [];
    this.setQuality(low);
    new ResizeObserver(() => { if (this.resize() && this.current) this.draw(); }).observe(canvas);
    this.resize();
  }

  setQuality(low) {
    this.low = low;
    this.renderer.setPixelRatio(low ? .82 : Math.min(devicePixelRatio, 1.5));
    const shadow = this.lights[0].shadow;
    const size = low ? 768 : 1536;
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.setScalar(size);
      shadow.map?.dispose();
      shadow.map = null;
      this.shadowDirty = true;
    }
    this.resize();
  }

  surfacePreview(id) {
    if (!this.surfacePreviews) {
      const environment = this.environments.get(defaultLighting);
      this.surfacePreviews = new SurfacePreviews(this.renderer, environment.texture);
    }
    return this.surfacePreviews.get(id);
  }

  setGallery(active) {
    this.gallery = active;
    if (active) {
      this.galleryPauseUntil = performance.now() + 450;
      this.gallerySpinSpeed = 0;
    } else {
      this.setGalleryScene('bench');
    }
  }

  holdView() {
    this.cameraFlight = null;
    if (this.cameraAtFloor) {
      // Carry the actual view back from a scene that keeps the camera above its surface.
      const offset = this.camera.position.clone().sub(this.cameraTarget);
      this.orbit.elevation = Math.atan2(offset.y, Math.hypot(offset.x, offset.z));
      this.orbit.distance = offset.length();
      this.cameraAtFloor = false;
    }
    this.orbitGoal = { ...this.orbit };
    this.panGoal = this.panAmount;
  }

  setGalleryScene(id) {
    if (id === this.gallerySceneId) return;
    this.galleryBackdrop?.group.removeFromParent();
    this.galleryBackdrop = null;
    this.gallerySceneId = id;
    this.bench.visible = id === 'bench';
    if (id !== 'bench') {
      this.orbit.elevation = Math.max(outdoorOrbitMin, this.orbit.elevation);
      this.orbitGoal.elevation = Math.max(outdoorOrbitMin, this.orbitGoal.elevation);
      if (!this.galleryBackdrops.has(id)) this.galleryBackdrops.set(id, makeGalleryScene(id, this.gallerySun, workSurfaceY));
      this.galleryBackdrop = this.galleryBackdrops.get(id);
      if (this.galleryBackdrop.sea) this.galleryBackdrop.sea.mesh.position.y = workSurfaceY + this.current.lift;
      this.scene.add(this.galleryBackdrop.group);
    }
    this.setLighting(this.lightingId);
    this.shadowDirty = true;
  }

  galleryEnvironment(profile) {
    const key = 'gallery-' + this.gallerySceneId;
    if (!this.environments.has(key)) {
      const room = new THREE.Scene();
      const backdrop = this.galleryBackdrop.group.clone(true);
      backdrop.position.y -= 1.45;
      room.add(backdrop);
      addProbeLights(room, profile);
      const previous = this.gallerySun.clone();
      this.gallerySun.fromArray(profile.key, 2).normalize();
      try {
        this.environments.set(key, captureEnvironment(this.renderer, room, .014));
      } finally {
        this.gallerySun.copy(previous);
      }
    }
    return this.environments.get(key);
  }

  setLighting(id) {
    const preset = lightingPresets.find(option => option.id === id);
    const sceneId = this.gallerySceneId ?? 'bench';
    const signature = `${sceneId}:${id}`;
    if (!preset || this.lightSignature === signature) return;
    const profile = galleryLighting[sceneId];
    if (!profile && !this.environments.has(id)) {
      const opacity = this.tableOpacity;
      this.setTableOpacity(1);
      try {
        this.environments.set(id, studioEnvironment(this.renderer, preset, this.bench));
      } finally {
        this.setTableOpacity(opacity);
      }
    }
    const environment = profile ? this.galleryEnvironment(profile) : this.environments.get(id);
    const lighting = ['key', 'rim', 'fill'].map(key => {
      const [color, intensity, x, y, z] = preset[key];
      const target = { color: new THREE.Color(color), intensity, position: new THREE.Vector3(x, y, z) };
      if (profile) {
        const [tint, level, px, py, pz] = profile[key];
        target.color.lerp(new THREE.Color(tint), .72);
        target.intensity = THREE.MathUtils.lerp(intensity, level, .72);
        target.position.lerp(new THREE.Vector3(px, py, pz), .72);
      }
      return target;
    });
    const ambient = { color: new THREE.Color(preset.ambient[0]), ground: new THREE.Color(preset.ambient[1]), intensity: preset.ambient[2] };
    let exposure = preset.exposure;
    if (profile) {
      ambient.color.lerp(new THREE.Color(profile.ambient[0]), .72);
      ambient.ground.lerp(new THREE.Color(profile.ambient[1]), .72);
      ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, profile.ambient[2], .72);
      exposure = THREE.MathUtils.lerp(exposure, profile.exposure, .72);
    }
    this.keyPreset = lighting[0].position.clone();
    this.keyTarget = null;
    this.shadowDirty = true;
    if (!this.lightingId || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [i, light] of this.lights.entries()) {
        light.color.copy(lighting[i].color);
        light.intensity = lighting[i].intensity;
        this.lightOffsets[i].copy(lighting[i].position);
      }
      this.ambient.color.copy(ambient.color);
      this.ambient.groundColor.copy(ambient.ground);
      this.ambient.intensity = ambient.intensity;
      this.renderer.toneMappingExposure = exposure;
      this.scene.environment = environment.texture;
      this.lightFlight = null;
    } else {
      const blend = this.lightBlend ??= this.createEnvironmentBlend(environment);
      const output = blend.targets.find(target => target.texture !== this.scene.environment);
      this.lightFlight = {
        start: performance.now(), fromMap: this.scene.environment, toMap: environment.texture, output,
        fromLights: this.lights.map((light, i) => ({ color: light.color.clone(), intensity: light.intensity, position: this.lightOffsets[i].clone() })),
        toLights: lighting, fromAmbient: { color: this.ambient.color.clone(), ground: this.ambient.groundColor.clone(), intensity: this.ambient.intensity },
        toAmbient: ambient, fromExposure: this.renderer.toneMappingExposure, toExposure: exposure
      };
    }
    this.lightingId = id;
    this.lightSignature = signature;
  }

  keyDirection() {
    const { x, y, z } = this.keyTarget ?? this.keyPreset;
    return { azimuth: Math.atan2(x, z), elevation: Math.atan2(y, Math.hypot(x, z)) };
  }

  get hasCustomKey() { return this.keyTarget && !this.keyTarget.equals(this.keyPreset); }

  setKeyDirection(azimuth, elevation) {
    const length = this.keyPreset.length();
    const horizontal = Math.cos(elevation) * length;
    this.keyTarget = new THREE.Vector3(Math.sin(azimuth) * horizontal, Math.sin(elevation) * length, Math.cos(azimuth) * horizontal);
  }

  resetKeyDirection() {
    this.keyTarget = this.keyPreset.clone();
  }

  updateKeyDirection(dt) {
    if (!this.keyTarget) return;
    const position = this.lightOffsets[0];
    if (position.equals(this.keyTarget)) return;
    if (position.distanceToSquared(this.keyTarget) < .00004 || matchMedia('(prefers-reduced-motion: reduce)').matches) position.copy(this.keyTarget);
    else position.lerp(this.keyTarget, 1 - Math.exp(-24 * dt));
  }

  aimViewLights() {
    const view = this.lightView.subVectors(this.camera.position, this.cameraTarget).normalize();
    const cos = Math.cos(this.orbit.yaw), sin = Math.sin(this.orbit.yaw);
    for (const [i, light] of this.lights.entries()) {
      const offset = this.lightOffsets[i];
      const position = this.lightPosition.copy(offset);
      if (i !== 1) {
        // The model lights follow the viewing side; the rim stays in the environment.
        position.set(offset.x * cos + offset.z * sin, offset.y, offset.z * cos - offset.x * sin);
        if (i !== 0 || !this.hasCustomKey) {
          const length = position.length();
          const facing = position.dot(view) / length;
          // Bring the light down with the camera for views of the model's underside.
          if (facing < lightFrontDot) {
            position.addScaledVector(view, -length * facing).normalize().multiplyScalar(lightFrontSide)
              .addScaledVector(view, lightFrontDot).multiplyScalar(length);
          }
        }
      }
      if (!light.position.equals(position)) {
        light.position.copy(position);
        if (light.castShadow) this.shadowDirty = true;
      }
    }
  }

  createEnvironmentBlend(environment) {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
      uniforms: { fromMap: { value: null }, toMap: { value: null }, amount: { value: 0 } },
      vertexShader: 'varying vec2 uvSample; void main(){ uvSample=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: 'varying vec2 uvSample; uniform sampler2D fromMap,toMap; uniform float amount; void main(){ gl_FragColor=mix(texture2D(fromMap,uvSample),texture2D(toMap,uvSample),amount); }',
      depthTest: false, depthWrite: false, toneMapped: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    return { scene, camera: new THREE.Camera(), uniforms: material.uniforms, targets: [environment.clone(), environment.clone()] };
  }

  updateLighting(now) {
    const flight = this.lightFlight;
    if (!flight) return;
    const time = Math.min(1, (now - flight.start) / 720);
    const amount = time * time * (3 - 2 * time);
    const lerp = THREE.MathUtils.lerp;
    for (const [i, light] of this.lights.entries()) {
      const from = flight.fromLights[i], to = flight.toLights[i];
      light.color.lerpColors(from.color, to.color, amount);
      light.intensity = lerp(from.intensity, to.intensity, amount);
      if (i || !this.keyTarget) this.lightOffsets[i].lerpVectors(from.position, to.position, amount);
    }
    this.shadowDirty = true;
    const from = flight.fromAmbient, to = flight.toAmbient;
    this.ambient.color.lerpColors(from.color, to.color, amount);
    this.ambient.groundColor.lerpColors(from.ground, to.ground, amount);
    this.ambient.intensity = lerp(from.intensity, to.intensity, amount);
    this.renderer.toneMappingExposure = lerp(flight.fromExposure, flight.toExposure, amount);
    if (time === 1) {
      this.scene.environment = flight.toMap;
      this.lightFlight = null;
      return;
    }
    const blend = this.lightBlend;
    blend.uniforms.fromMap.value = flight.fromMap;
    blend.uniforms.toMap.value = flight.toMap;
    blend.uniforms.amount.value = amount;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(flight.output);
    this.renderer.render(blend.scene, blend.camera);
    this.renderer.setRenderTarget(previous);
    this.scene.environment = flight.output.texture;
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    const resized = width !== this.viewportWidth || height !== this.viewportHeight;
    if (resized) this.renderer.setSize(width, height, false);
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.frameViewport();
    return resized;
  }

  setDeckInset(pixels) {
    if (Math.abs((this.deckInset ?? 0) - pixels) < .25) return;
    this.deckInset = pixels;
    this.frameViewport();
  }

  frameViewport() {
    const width = this.viewportWidth, height = this.viewportHeight;
    const frame = this.galleryFrame;
    const frameWidth = frame?.width ?? width;
    this.framingHeight = frame?.height ?? Math.max(1, height - (this.deckInset ?? 0));
    const offset = frame?.offset ?? (width > 1000 ? -width * .026 : width > 700 ? -width * .032 : 0);
    this.camera.setViewOffset(frameWidth, this.framingHeight, offset, 0, width, height);
  }

  lockGalleryFrame() {
    const { fullWidth, fullHeight, offsetX } = this.camera.view;
    this.galleryFrame = { width: fullWidth, height: fullHeight, offset: offsetX };
  }

  unlockGalleryFrame() {
    this.galleryFrame = null;
    this.resize();
  }

  async model(definition) {
    if (this.models.has(definition.id)) return this.models.get(definition.id);
    let scene, packed;
    if (definition.white) {
      const { loadWhiteModel, prepareWhiteModel, packWhiteModel, unpackWhiteModel } = await import('./white-model.js?v=mecha-studio-1');
      let prepared;
      if (definition.file) {
        const source = await loadWhiteModel(await definition.file.arrayBuffer(), definition.format, this.loader);
        prepared = await prepareWhiteModel(source, definition);
        packed = packWhiteModel(prepared);
      } else {
        prepared = unpackWhiteModel((await readGeometry(definition.id)).geometry);
      }
      scene = prepared.scene;
      definition = { ...definition, parts: prepared.parts, height: prepared.height, center: prepared.center, anchor: prepared.anchor };
    } else {
      const source = definition.storedGLB
        ? (await readGeometry(definition.id)).geometry.glb
        : await readStudioModel(definition.file);
      ({ scene } = await this.loader.parseAsync(source, ''));
    }
    scene.updateMatrixWorld(true);
    const modelFrame = scene.matrixWorld.clone().invert();
    const parts = definition.parts.map(info => {
      const mesh = scene.getObjectByName(info.mesh);
      if (!mesh?.isMesh || !mesh.geometry.getAttribute('uv1')) {
        throw new Error('模型缺少独立喷涂 UV：' + info.name);
      }
      if (!definition.white) {
        const group = new THREE.Group();
        mesh.parent.add(group);
        group.add(mesh);
      }
      const part = createPaintPart(mesh, info, modelFrame.clone().multiply(mesh.matrixWorld));
      part.home = part.group.position.clone();
      part.offset = new THREE.Vector3(...info.explode);
      part.restBounds = new THREE.Box3().setFromObject(part.group, true);
      part.restBottom = part.restBounds.min.y;
      part.parentUp = new THREE.Vector3(0, 1, 0)
        .applyMatrix3(new THREE.Matrix3().setFromMatrix4(part.group.parent.matrixWorld).invert());
      part.materials = [];
      part.shadowMeshes = [];
      part.castsShadow = true;
      part.group.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = node.receiveShadow = true;
        part.shadowMeshes.push(node);
        if (node !== mesh) node.material = Array.isArray(node.material) ? node.material.map(item => item.clone()) : node.material.clone();
        part.materials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
      });
      part.opacity = part.opacityTarget = part.drawOpacity = 1;
      mesh.userData.paintPart = part;
      return part;
    });
    const meshes = [];
    scene.traverse(node => { if (node.isMesh) meshes.push(node); });
    const position = new THREE.Vector3().fromArray(definition.anchor).negate();
    const lift = definition.category === 'spacecraft' ? .80 : 0;
    position.y = workSurfaceY + lift - new THREE.Box3().setFromObject(scene, true).min.y;
    const model = { definition, scene, parts, meshes, position, packed, lift };
    for (const part of parts) part.model = model;
    this.models.set(definition.id, model);
    return model;
  }

  frameModel(model) {
    const { center, front = [0, 0, 1], height } = model.definition;
    this.focusedPart = null;
    this.focusReturn = null;
    this.focusFit = null;
    this.frameCenter.fromArray(center).add(model.position);
    this.panGoal = 0;
    this.panRange = Math.max(.34, height * .46);
    this.preferredYaw = Math.atan2(front[0], front[2]) + model.scene.rotation.y;
    // Leave enough room around smaller objects to show the work surface.
    const frameHeight = Math.max(3.68, height);
    this.fit = frameHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.32;
  }

  departFor(model) {
    this.frameModel(model);
    this.view('hero', true, departureMs + arrivalMs);
    return this.transitionModel(false);
  }

  show(model, isolated, preserveCamera = false) {
    const firstShow = this.current !== model;
    if (firstShow) {
      this.current?.scene.removeFromParent();
      this.current = model;
      model.scene.position.copy(model.position);
      this.scene.add(model.scene);
      if (!preserveCamera) {
        this.frameModel(model);
        this.center.copy(this.frameCenter);
        this.orbit.distance = this.fit;
        this.orbitGoal.distance = this.fit;
      }
      this.explodeAmount = 0;
      this.appliedExplodeAmount = null;
    }
    for (const part of model.parts) {
      const present = !part.hidden;
      const ghost = present && isolated && isolated !== part.id;
      part.opacityTarget = present ? ghost ? .085 : 1 : 0;
      part.group.userData.paintInactive = !present || Boolean(ghost);
      if (firstShow) {
        part.opacity = part.opacityTarget;
        this.setOpacity(part, part.opacity);
      }
    }
    model.scene.updateMatrixWorld(true);
    this.refreshCameraBounds();
    this.shadowDirty = true;
    this.meshes = model.meshes.filter(mesh => {
      for (let node = mesh; node; node = node.parent) if (node.userData.paintInactive) return false;
      return true;
    });
    this.updateCamera();
  }

  setOpacity(part, opacity) {
    if (part.drawOpacity === opacity) return;
    part.drawOpacity = opacity;
    part.group.visible = opacity > .002;
    const castsShadow = opacity >= .68;
    if (castsShadow !== part.castsShadow) {
      part.castsShadow = castsShadow;
      for (const mesh of part.shadowMeshes) mesh.castShadow = castsShadow;
      this.shadowDirty = true;
    }
    const transparent = opacity < .999;
    for (const material of part.materials) {
      material.opacity = opacity;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = !transparent;
    }
  }

  setExploded(open) {
    this.exploded = open;
    if (open) {
      const yaw = this.orbit.yaw, elevation = .16;
      const layout = planExplosion(this.current, yaw, elevation, workSurfaceY + .30);
      this.current.explosionOffsets = layout.offsets;
      const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const widthFraction = this.viewportWidth > 720 ? .70 : .92;
      const fit = layout.depth / 2 + Math.max(layout.height / (.82 * 2 * tangent),
        layout.width / (widthFraction * 2 * tangent * this.camera.aspect));
      this.explosionReturn = this.focusReturn ?? { center: this.frameCenter.clone(), distance: this.orbitGoal.distance, pan: this.panGoal };
      this.assembledFit = this.fit;
      this.fit = fit;
      if (this.focusedPart) this.focusReturn = { center: layout.center, distance: fit, pan: 0 };
      else {
        this.frameCenter.copy(layout.center);
        this.panGoal = 0;
        this.moveCamera({ yaw, elevation, distance: fit }, true, 420);
      }
    } else if (this.explosionReturn) {
      const previous = this.explosionReturn;
      this.explosionReturn = null;
      this.fit = this.assembledFit;
      if (this.focusedPart) this.focusReturn = previous;
      else {
        this.frameCenter.copy(previous.center);
        this.panGoal = previous.pan;
        this.moveCamera({ ...this.orbitGoal, distance: previous.distance }, true, 420);
      }
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.explodeAmount = Number(open);
  }

  focusPart(part) {
    if (part === this.focusedPart) return;
    this.focusedPart = part;
    if (part) {
      this.focusReturn ??= { center: this.frameCenter.clone(), distance: this.orbitGoal.distance, pan: this.panGoal };
      this.panGoal = 0;
      const bounds = new THREE.Box3().setFromObject(part.group, true);
      const size = bounds.getSize(new THREE.Vector3());
      bounds.getCenter(this.frameCenter);
      this.focusAnchor = part.group.worldToLocal(this.frameCenter.clone());
      this.focusFit = Math.max(1.30, Math.max(size.x, size.y, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.65);
    } else {
      this.frameCenter.copy(this.focusReturn.center);
      this.panGoal = this.focusReturn.pan;
      this.focusFit = null;
    }
    const distance = part ? this.focusFit : this.focusReturn.distance;
    if (!part) this.focusReturn = null;
    this.moveCamera({ ...this.orbitGoal, distance }, true, 360);
  }

  transitionModel(incoming) {
    if (!this.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const sideways = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const upward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2);
    const h = this.orbit.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const paths = this.current.parts.map((part, i) => {
      const angle = i * 2.39996 + .38;
      return sideways.clone().multiplyScalar(Math.cos(angle) * h * (this.camera.aspect * .85 + .18))
        .addScaledVector(upward, Math.sin(angle) * h * 1.65)
        .addScaledVector(forward, ((i % 5) - 2) * .46);
    });
    return new Promise(resolve => {
      this.swap = { incoming, paths, start: performance.now(), duration: incoming ? arrivalMs : departureMs, resolve };
      this.updateParts(performance.now(), 0);
    });
  }

  refreshCameraBounds() {
    if (this.current) this.cameraBounds.setFromObject(this.current.scene).expandByScalar(.16);
  }

  minimumCameraDistance(target, yaw, elevation) {
    if (this.cameraBounds.isEmpty()) return 0;
    const horizontal = Math.cos(elevation);
    const direction = [Math.sin(yaw) * horizontal, Math.sin(elevation), Math.cos(yaw) * horizontal];
    let entry = 0, exit = Infinity;
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const from = target[axis], low = this.cameraBounds.min[axis], high = this.cameraBounds.max[axis];
      const step = direction[i];
      if (Math.abs(step) < 1e-8) {
        if (from < low || from > high) return 0;
        continue;
      }
      const a = (low - from) / step, b = (high - from) / step;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (exit < entry) return 0;
    }
    return exit;
  }

  updateCamera() {
    const { yaw, elevation } = this.orbit;
    const target = this.cameraTarget.copy(this.center);
    target.y += this.panAmount * this.panRange;
    const distance = Math.max(this.orbit.distance, this.minimumCameraDistance(target, yaw, elevation));
    const horizontal = Math.cos(elevation) * distance;
    const height = target.y + Math.sin(elevation) * distance;
    const floor = workSurfaceY + (this.current?.lift ?? 0) + .12;
    this.cameraAtFloor = Boolean(this.galleryBackdrop) && height < floor;
    this.camera.position.set(
      target.x + Math.sin(yaw) * horizontal,
      this.cameraAtFloor ? floor : height,
      target.z + Math.cos(yaw) * horizontal
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
  }

  setTableOpacity(opacity) {
    if (this.tableOpacity === opacity) return;
    const visible = opacity > 0;
    if (this.tabletop.visible !== visible) {
      this.tabletop.visible = visible;
      this.shadowDirty = true;
    }
    this.tableOpacity = opacity;
    const transparent = opacity < 1;
    for (const material of this.tableMaterials) {
      material.opacity = opacity;
      if (material.transparent === transparent) continue;
      material.transparent = transparent;
      material.depthWrite = !transparent;
      material.needsUpdate = true;
    }
  }

  view(name, smooth = true, duration = 280, snap = false) {
    const offsets = { front: [0, .04], left: [-Math.PI / 2, .09], right: [Math.PI / 2, .09], back: [Math.PI, .09], top: [0, orbitLimit], bottom: [0, -orbitLimit], hero: [.43, .29] };
    const [yaw, elevation] = offsets[name];
    const currentYaw = this.orbit.yaw;
    const delta = THREE.MathUtils.euclideanModulo(yaw + this.preferredYaw - currentYaw + Math.PI, Math.PI * 2) - Math.PI;
    if (name === 'hero') {
      this.panGoal = 0;
      if (!smooth || matchMedia('(prefers-reduced-motion: reduce)').matches) this.panAmount = 0;
    }
    this.moveCamera({
      yaw: currentYaw + delta, elevation: snap && Math.abs(elevation) < .1 ? 0 : elevation,
      distance: name === 'hero' ? (this.focusFit ?? this.fit) : this.orbitGoal.distance
    }, smooth, duration);
  }

  moveCamera(end, smooth, duration) {
    const start = { ...this.orbit };
    this.orbitGoal = end;
    if (!smooth || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.orbit = { ...end };
      this.center.copy(this.frameCenter);
      this.cameraFlight = null;
      this.updateCamera();
      return;
    }
    this.cameraFlight = {
      start, end, time: performance.now(), duration,
      fromCenter: this.center.clone(), toCenter: this.frameCenter.clone()
    };
  }

  rotate(dx, dy) {
    this.interruptView();
    this.orbitGoal.yaw -= dx * .007;
    const minimum = this.galleryBackdrop ? outdoorOrbitMin : -orbitLimit;
    this.orbitGoal.elevation = THREE.MathUtils.clamp(this.orbitGoal.elevation + dy * .006, minimum, orbitLimit);
  }

  zoom(factor) {
    this.interruptView();
    const fit = this.focusFit ?? this.fit;
    this.setZoom(fit / (this.orbitGoal.distance * factor));
  }

  get zoomScale() {
    const { yaw, elevation, distance } = this.orbitGoal;
    return (this.focusFit ?? this.fit) / Math.max(distance, this.minimumCameraDistance(this.cameraTarget, yaw, elevation));
  }

  setZoom(scale) {
    this.interruptView();
    const fit = this.focusFit ?? this.fit;
    this.orbitGoal.distance = THREE.MathUtils.clamp(fit / scale, fit / 4.5, fit * 2.1);
  }

  setPan(amount) {
    this.panGoal = THREE.MathUtils.clamp(amount, -1, 1);
  }

  panByPixels(deltaY, height) {
    const distance = this.camera.position.distanceTo(this.cameraTarget);
    const worldPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / (this.framingHeight ?? height);
    this.setPan(this.panGoal + deltaY * worldPerPixel / this.panRange);
  }

  interruptView() {
    if (!this.cameraFlight) return;
    this.cameraFlight = null;
    this.orbitGoal = { ...this.orbit };
  }

  pick(x, y, rect) {
    this.ndc.set((x / rect.width) * 2 - 1, 1 - (y / rect.height) * 2);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit?.object.userData.paintPart) return null;
    const part = hit.object.userData.paintPart;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    const surfaceNormal = hit.normal?.clone().applyMatrix3(normalMatrix).normalize() ?? normal;
    return { part, point: hit.point, normal, surfaceNormal };
  }

  showSprayCursor(hit, width, viewportHeight) {
    const ring = this.sprayCursor;
    if (!hit) { ring.visible = false; return; }
    const depth = -this.sprayCursorDepth.copy(hit.point).applyMatrix4(this.camera.matrixWorldInverse).z;
    const radius = width * depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / (this.framingHeight ?? viewportHeight);
    ring.position.copy(hit.point).addScaledVector(hit.normal, Math.max(.0015, radius * .025));
    ring.scale.setScalar(radius);
    this.sprayCursorRotation.setFromUnitVectors(this.sprayCursorAxis, hit.surfaceNormal);
    if (!ring.visible) ring.quaternion.copy(this.sprayCursorRotation);
    ring.visible = true;
  }

  tintSprayCursor(color) {
    this.sprayCursor.material.color.set(color);
  }

  pointAtDepth(screen, rect, distance) {
    const projected = new THREE.Vector3(0, 0, -distance).applyMatrix4(this.camera.projectionMatrix);
    return new THREE.Vector3(screen.x / rect.width * 2 - 1, 1 - screen.y / rect.height * 2, projected.z).unproject(this.camera);
  }

  update(now, dt) {
    this.updateLighting(now);
    this.updateKeyDirection(dt);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const panMoving = this.panAmount !== this.panGoal;
    if (panMoving) {
      const gain = reduced ? 1 : 1 - Math.exp(-21 * dt);
      this.panAmount = Math.abs(this.panGoal - this.panAmount) < .0006
        ? this.panGoal : THREE.MathUtils.lerp(this.panAmount, this.panGoal, gain);
    }
    if (this.cameraFlight) {
      const { start, end, time, duration, fromCenter, toCenter } = this.cameraFlight;
      const t = THREE.MathUtils.clamp((now - time) / duration, 0, 1);
      const amount = t * t * (3 - 2 * t);
      for (const key of ['yaw', 'elevation', 'distance']) this.orbit[key] = THREE.MathUtils.lerp(start[key], end[key], amount);
      this.center.lerpVectors(fromCenter, toCenter, amount);
      this.updateCamera();
      if (t === 1) this.cameraFlight = null;
    } else if (this.orbitMoving || panMoving) {
      const gain = reduced ? 1 : 1 - Math.exp(-21 * dt);
      for (const key of ['yaw', 'elevation', 'distance']) {
        const end = this.orbitGoal[key];
        const current = this.orbit[key];
        this.orbit[key] = Math.abs(end - current) < .0006 ? end : THREE.MathUtils.lerp(current, end, gain);
      }
      this.updateCamera();
    }
    this.updateParts(now, dt);
    if (this.sprayCursor.visible) {
      this.sprayCursor.quaternion.slerp(this.sprayCursorRotation, 1 - Math.exp(-36 * dt));
    }
    if (this.gallery) {
      if (!reduced && now > this.galleryPauseUntil) {
        this.gallerySpinSpeed = THREE.MathUtils.lerp(this.gallerySpinSpeed, .32, 1 - Math.exp(-4 * dt));
        const turn = dt * this.gallerySpinSpeed;
        this.current.scene.rotation.y += turn;
        this.preferredYaw += turn;
        this.current.scene.updateMatrixWorld(true);
        this.refreshCameraBounds();
        this.updateCamera();
        this.shadowDirty = true;
      } else this.gallerySpinSpeed = 0;
      this.gallerySun.copy(this.lightOffsets[0]).normalize();
      this.galleryBackdrop?.update(this.camera, reduced ? 0 : now / 1000);
    }
  }

  updateParts(now, dt) {
    if (!this.current) return;
    const target = this.exploded ? 1 : 0;
    const amount = THREE.MathUtils.lerp(this.explodeAmount, target, 1 - Math.exp(-13 * dt));
    this.explodeAmount = Math.abs(amount - target) < .002 ? target : amount;
    const { swap } = this;
    const progress = swap ? THREE.MathUtils.clamp((now - swap.start) / swap.duration, 0, 1) : 1;
    const moved = swap || this.appliedExplodeAmount !== this.explodeAmount;
    this.appliedExplodeAmount = this.explodeAmount;
    const fade = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-15 * dt);
    for (const [i, part] of this.current.parts.entries()) {
      updateSubstrate(part, now);
      let travel = 0, alpha = 1;
      if (swap?.incoming) {
        const t = THREE.MathUtils.clamp((progress - (i % 6) * .027) / .865, 0, 1);
        travel = (1 - t) ** 3;
        alpha = Math.min(1, t * 3);
      } else if (swap) {
        travel = progress ** 2;
        alpha = 1 - progress ** 1.3;
      }
      if (moved) {
        const offset = this.current.explosionOffsets?.get(part.id) ?? part.offset;
        part.group.position.copy(part.home).addScaledVector(offset, this.explodeAmount);
        if (swap) part.group.position.addScaledVector(swap.paths[i], travel);
        const position = part.group.position;
        const parent = part.group.parent.matrixWorld.elements;
        const displacementY = parent[1] * (position.x - part.home.x) +
          parent[5] * (position.y - part.home.y) + parent[9] * (position.z - part.home.z);
        const floor = workSurfaceY + .29 * Math.max(this.explodeAmount, travel);
        const lift = floor - (part.restBottom + this.current.position.y + displacementY);
        if (lift > 0) position.addScaledVector(part.parentUp, lift);
      }
      part.opacity = Math.abs(part.opacity - part.opacityTarget) < .003
        ? part.opacityTarget : THREE.MathUtils.lerp(part.opacity, part.opacityTarget, fade);
      this.setOpacity(part, part.opacity * alpha);
    }
    if (moved) {
      this.current.scene.updateMatrixWorld(true);
      if (!swap) this.refreshCameraBounds();
      this.shadowDirty = true;
      if (this.focusedPart && !swap) {
        const center = this.focusedPart.group.localToWorld(this.focusAnchor.clone());
        if (this.cameraFlight) this.cameraFlight.toCenter.copy(center);
        else {
          this.center.add(center.clone().sub(this.frameCenter));
          this.updateCamera();
        }
        this.frameCenter.copy(center);
      } else if (!swap) this.updateCamera();
    }
    if (swap && progress === 1) {
      this.swap = null;
      swap.resolve();
    }
  }

  get orbitMoving() {
    return this.orbit.yaw !== this.orbitGoal.yaw || this.orbit.elevation !== this.orbitGoal.elevation || this.orbit.distance !== this.orbitGoal.distance;
  }

  get moving() { return this.swap || this.cameraFlight || this.orbitMoving || this.panAmount !== this.panGoal || this.explodeAmount !== (this.exploded ? 1 : 0); }

  draw() {
    this.renderer.setRenderTarget(null);
    this.aimViewLights();
    if (this.bench.visible) {
      // Clear the model's line of sight before the camera crosses the work surface.
      this.setTableOpacity(THREE.MathUtils.smoothstep(this.camera.position.y - workSurfaceY, .06, .76));
    }
    const backdrop = this.galleryBackdrop;
    backdrop?.sea?.reflect(this.renderer, this.scene, this.camera, backdrop.sky, this.low);
    this.renderer.state.buffers.depth.setMask(true);
    this.renderer.clear(true, true, false);
    this.renderer.shadowMap.needsUpdate = this.shadowDirty;
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      backdrop?.sea?.finish();
    }
    this.shadowDirty = false;
  }
}
