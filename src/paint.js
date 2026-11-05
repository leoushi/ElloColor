import * as THREE from 'three';
import { PaintRunoff } from './runoff.js';
import { applySurface, projectSurface, surfaceAppearance, surfaceUniforms } from './surfaces.js?v=surface-motion-1';

const SAMPLE_W = 32;
const SAMPLE_H = 24;
const SAMPLE_COUNT = SAMPLE_W * SAMPLE_H;
const COVERAGE_OPACITY = 0.30;
const AUTO_FILL_COVERAGE = 0.35;
const HISTORY_LIMIT = 20;
const HISTORY_TEXTURE_LIMIT = 64;
const SURFACE_DURATION = 480;
const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
blank.needsUpdate = true;

const fullscreen = `
void main() { gl_Position = vec4(position.xy, 0., 1.); }
`;
const blendInk = `
vec4 mergeInk(vec4 oldPaint, vec3 ink, float coat) {
  // History stores premultiplied pigment so thin edges survive a round change.
  if (coat <= 0.) return oldPaint;
  vec3 previous = oldPaint.rgb / max(oldPaint.a, .00001);
  vec3 subtractive = previous * ink;
  vec3 transition = mix(previous, subtractive, smoothstep(0., .42, coat));
  transition = mix(transition, ink, smoothstep(.42, .96, coat));
  float exposed = (1. - oldPaint.a) * coat;
  return vec4(transition * oldPaint.a + ink * exposed, oldPaint.a + exposed);
}
`;

const paintFinish = THREE.ShaderChunk.lights_physical_fragment
  .replace('material.clearcoat = clearcoat;', `
    float substrateSheen = clearcoat * (1.0 - smoothstep(.48, .86, roughnessFactor));
    material.clearcoat = mix(substrateSheen, .38, pigment.a);`)
  .replace('material.clearcoatRoughness = clearcoatRoughness;',
    'material.clearcoatRoughness = mix(clearcoatRoughness, .13, max(moisture, pigment.a * .65));');

function setNextSurfaceMaps(part, surface) {
  part.uniforms.uNextSurfaceMap.value = surface.map;
  part.uniforms.uNextSurfaceDetail.value = surface.detail;
  part.uniforms.uNextBumpScale.value = surface.bump;
  part.uniforms.uNextSurfaceScale.value = surface.scale;
}

function settleSubstrate(part, surface) {
  applySurface(part.material, surface, part.uniforms);
  part.surface = surface;
  part.surfaceFlight = null;
  part.uniforms.uSurfaceMix.value = 0;
  setNextSurfaceMaps(part, surface);
}

function startSubstrateTransition(part, to, now) {
  setNextSurfaceMaps(part, to);
  part.surfaceFlight = { to, started: now };
}

export function setSubstrate(part, id, now = null) {
  const surface = surfaceAppearance(id);
  part.substrate = surface.id;
  part.surfaceGoal = surface;
  if (now === null) settleSubstrate(part, surface);
  else if (!part.surfaceFlight && part.surface !== surface) startSubstrateTransition(part, surface, now);
}

export function updateSubstrate(part, now) {
  if (!part.surfaceFlight) return;
  const { to, started } = part.surfaceFlight;
  const progress = THREE.MathUtils.clamp((now - started) / SURFACE_DURATION, 0, 1);
  if (progress === 1) {
    settleSubstrate(part, to);
    // Keep the latest selection when the user switches again mid-transition.
    if (part.surfaceGoal !== to) startSubstrateTransition(part, part.surfaceGoal, now);
    return;
  }
  const mix = progress * progress * (3 - 2 * progress);
  const from = part.surface;
  part.uniforms.uSurfaceMix.value = mix;
  part.material.roughness = THREE.MathUtils.lerp(from.roughness, to.roughness, mix);
  part.material.metalness = THREE.MathUtils.lerp(from.metalness, to.metalness, mix);
  part.material.envMapIntensity = THREE.MathUtils.lerp(from.env, to.env, mix);
}

function noise(x, y) {
  const value = Math.sin(x * 38.17 + y * 73.17) * 17233.7123;
  return value - Math.floor(value);
}

export function createPaintPart(mesh, definition, restFrame) {
  const geometry = mesh.geometry;
  geometry.setAttribute('paintUv', geometry.getAttribute('uv1') ?? geometry.getAttribute('uv'));
  const uniforms = {
    ...surfaceUniforms(restFrame),
    uOldPaint: { value: blank }, uRoundPaint: { value: blank },
    uInk: { value: new THREE.Color(0xffffff) }, uFill: { value: 0 }, uCoatOpacity: { value: 1 }
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: geometry.hasAttribute('color'), clearcoat: .14, clearcoatRoughness: .42
  });
  material.onBeforeCompile = shader => {
    projectSurface(shader, uniforms);
    shader.vertexShader = 'attribute vec2 paintUv; varying vec2 vPaintUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaintUv = paintUv;');
    shader.fragmentShader = `varying vec2 vPaintUv;
      uniform sampler2D uOldPaint, uRoundPaint;
      uniform vec3 uInk;
      uniform float uFill, uCoatOpacity;
      ${blendInk}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      vec2 coatSample = texture2D(uRoundPaint, vPaintUv).rg;
      float coat = mix(coatSample.r, 1., uFill) * uCoatOpacity;
      float moisture = smoothstep(.025, .50, coatSample.g);
      vec4 pigment = mergeInk(texture2D(uOldPaint, vPaintUv), uInk, coat);
      vec3 surfaceDetail = mix(vec3(.95), diffuseColor.rgb, .16);
      diffuseColor.rgb = diffuseColor.rgb * (1. - pigment.a) + pigment.rgb * surfaceDetail;
      diffuseColor.rgb *= 1. - moisture * .09;
      #include <color_fragment>
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
      roughnessFactor = mix(roughnessFactor, min(roughnessFactor, .36), pigment.a * .72);
      roughnessFactor = mix(roughnessFactor, min(roughnessFactor, .16), moisture);
      #include <metalnessmap_fragment>
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', paintFinish);
  };
  mesh.material = material;
  const part = {
    ...definition, mesh, group: mesh.parent, material, uniforms,
    current: null, history: null, sampleMap: null,
    ink: null, epoch: 0, coverage: 0, fillStart: null, filled: false,
    hidden: false
  };
  setSubstrate(part, 'matte');
  return part;
}

function areaSamples(geometry) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('paintUv');
  const indices = geometry.index;
  const length = indices?.count ?? position.count;
  const areas = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  const index = i => indices ? indices.getX(i) : i;
  for (let i = 0; i < length; i += 3) {
    a.fromBufferAttribute(position, index(i));
    b.fromBufferAttribute(position, index(i + 1)).sub(a);
    c.fromBufferAttribute(position, index(i + 2)).sub(a);
    total += b.cross(c).length() * .5;
    areas.push(total);
  }
  const samples = new Float32Array(SAMPLE_COUNT * 4);
  let triangle = 0;
  for (let j = 0; j < SAMPLE_COUNT; j++) {
    const area = ((j + noise(j, 10)) / SAMPLE_COUNT) * total;
    while (triangle + 1 < areas.length && areas[triangle] < area) triangle++;
    const i = triangle * 3;
    const ia = index(i), ib = index(i + 1), ic = index(i + 2);
    const r = Math.sqrt(noise(j, 7)), s = noise(j, 29);
    const wa = 1 - r, wb = r * (1 - s), wc = r * s;
    samples[j * 4] = uv.getX(ia) * wa + uv.getX(ib) * wb + uv.getX(ic) * wc;
    samples[j * 4 + 1] = uv.getY(ia) * wa + uv.getY(ib) * wb + uv.getY(ic) * wc;
  }
  const texture = new THREE.DataTexture(samples, SAMPLE_W, SAMPLE_H, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

export class PaintEngine {
  constructor(renderer, { lowQuality, onCoverage, onHistory, onPaint, autoFill, threshold = () => AUTO_FILL_COVERAGE }) {
    this.renderer = renderer;
    this.gl = renderer.getContext();
    this.resolution = lowQuality ? 256 : 512;
    this.onCoverage = onCoverage;
    this.onHistory = onHistory;
    this.onPaint = onPaint;
    this.autoFill = autoFill;
    this.threshold = threshold;
    this.queue = [];
    this.undoStack = [];
    this.redoStack = [];
    this.queueLimit = lowQuality ? 108 : 180;
    this.stampsPerFrame = lowQuality ? 5 : 9;
    this.dirty = new Set();
    this.filling = new Set();
    this.lastRead = 0;
    this.occluders = [];
    this.depthCamera = new THREE.PerspectiveCamera();
    this.depthScene = new THREE.Scene();
    this.depthMaterial = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    const depthSize = lowQuality ? 192 : 256;
    this.depthTarget = new THREE.WebGLRenderTarget(depthSize, depthSize, { depthBuffer: true, depthTexture: new THREE.DepthTexture(depthSize, depthSize, THREE.UnsignedIntType) });
    this.coverageTarget = new THREE.WebGLRenderTarget(SAMPLE_W, SAMPLE_H, { depthBuffer: false });
    this.passCamera = new THREE.Camera();
    this.runoff = new PaintRunoff(renderer, this.passCamera, lowQuality);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.uvScene = new THREE.Scene();
    this.copyPass = new THREE.ShaderMaterial({
      uniforms: { source: { value: null }, size: { value: this.resolution } },
      vertexShader: fullscreen,
      fragmentShader: `
        uniform sampler2D source;
        uniform float size;
        void main() { gl_FragColor = texture2D(source, gl_FragCoord.xy / size); }
      `,
      depthTest: false, depthWrite: false, toneMapped: false
    });

    this.uvMaterial = new THREE.ShaderMaterial({
      uniforms: {
        depthMap: { value: this.depthTarget.depthTexture },
        nozzleMatrix: { value: new THREE.Matrix4() },
        worldMatrix: { value: new THREE.Matrix4() },
        worldNormal: { value: new THREE.Matrix3() },
        nozzle: { value: new THREE.Vector3() }, dose: { value: 0 }, seed: { value: 0 }, wetness: { value: 0 }, grain: { value: 1 }
      },
      vertexShader: `
        attribute vec2 paintUv;
        uniform mat4 worldMatrix, nozzleMatrix;
        uniform mat3 worldNormal;
        varying vec3 vWorld, vNormal;
        varying vec4 vProjection;
        void main() {
          vec4 world = worldMatrix * vec4(position, 1.);
          vWorld = world.xyz;
          vNormal = worldNormal * normal;
          vProjection = nozzleMatrix * world;
          gl_Position = vec4(paintUv * 2. - 1., 0., 1.);
        }
      `,
      fragmentShader: `
        uniform sampler2D depthMap;
        uniform vec3 nozzle;
        uniform float dose, seed, wetness, grain;
        varying vec3 vWorld, vNormal;
        varying vec4 vProjection;
        void main() {
          if (vProjection.w <= 0.) discard;
          vec3 p = vProjection.xyz / vProjection.w;
          float radial = length(p.xy);
          float facing = dot(normalize(vNormal), normalize(nozzle - vWorld));
          if (radial > 1. || abs(p.z) > 1. || facing <= .015) discard;
          vec2 uv = p.xy * .5 + .5;
          float depth = p.z * .5 + .5;
          float depthBias = mix(.00165, .00075, smoothstep(.02, .50, facing));
          if (depth > texture2D(depthMap, uv).r + depthBias) discard;
          float frequency = mix(610., 230., grain);
          float noise = fract(sin(dot(floor(vWorld * frequency) + seed, vec3(14.91, 73.7, 21.32))) * 43758.5453);
          float pigment = .735 + (noise - .5) * mix(.14, .53, grain);
          float edge = 1. - smoothstep(.12, 1., radial);
          float adhesion = smoothstep(.015, .48, facing);
          float alpha = clamp(dose * (1. - wetness * .26) * edge * pigment * adhesion, 0., .8);
          gl_FragColor = vec4(alpha, alpha * wetness, 0., alpha);
        }
      `,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      transparent: true, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false
    });
    this.uvMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.uvMaterial);
    this.uvMesh.frustumCulled = false;
    this.uvScene.add(this.uvMesh);

    this.flatten = new THREE.ShaderMaterial({
      uniforms: { oldPaint: { value: blank }, roundPaint: { value: blank }, ink: { value: new THREE.Color() }, fill: { value: 0 }, opacity: { value: 1 }, size: { value: this.resolution } },
      vertexShader: fullscreen,
      fragmentShader: `
        uniform sampler2D oldPaint, roundPaint;
        uniform vec3 ink;
        uniform float fill, opacity, size;
        ${blendInk}
        void main() {
          vec2 uv = gl_FragCoord.xy / size;
          float coat = mix(texture2D(roundPaint, uv).r, 1., fill) * opacity;
          gl_FragColor = mergeInk(texture2D(oldPaint, uv), ink, coat);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false
    });
    this.coveragePass = new THREE.ShaderMaterial({
      uniforms: { coords: { value: blank }, paint: { value: blank }, opacityThreshold: { value: COVERAGE_OPACITY } },
      vertexShader: fullscreen,
      fragmentShader: `
        uniform sampler2D coords, paint;
        uniform float opacityThreshold;
        void main() {
          vec2 uv = texture2D(coords, gl_FragCoord.xy / vec2(${SAMPLE_W}., ${SAMPLE_H}.)).xy;
          gl_FragColor = vec4(vec3(step(opacityThreshold, texture2D(paint, uv).r)), 1.);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false
    });
  }

  setOccluders(meshes) {
    this.depthScene.clear();
    this.occluders = meshes.map(source => {
      const proxy = new THREE.Mesh(source.geometry, this.depthMaterial);
      proxy.matrixAutoUpdate = false;
      this.depthScene.add(proxy);
      return { source, proxy };
    });
  }

  target() {
    return new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
      depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
  }

  clear(target) {
    const renderer = this.renderer;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(clearColor, clearAlpha);
  }

  copyTarget(source) {
    if (!source) return null;
    const target = this.target();
    this.copyPass.uniforms.source.value = source.texture;
    this.quad.material = this.copyPass;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.passCamera);
    this.copyPass.uniforms.source.value = null;
    return target;
  }

  savePart(part) {
    if (!part.ink && part.substrate === 'matte') return null;
    const readLayer = target => {
      if (!target) return null;
      const size = target.width;
      const bytes = new Uint8Array(size * size * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, size, size, bytes);
      const pixels = new Uint32Array(bytes.buffer);
      if (pixels.every(pixel => pixel === pixels[0])) return { size: 1, bytes: bytes.slice(0, 4) };
      return { size, bytes };
    };
    const filled = part.filled || part.fillStart !== null;
    const opacity = part.uniforms.uCoatOpacity.value;
    return {
      substrate: part.substrate, ink: part.ink, opacity, filled, coverage: filled ? 1 : part.coverage,
      current: filled ? null : readLayer(part.current), history: filled && opacity === 1 ? null : readLayer(part.history)
    };
  }

  loadPart(part, coat) {
    setSubstrate(part, coat.substrate);
    if (!coat.ink) return;
    const previous = this.renderer.getRenderTarget();
    const loadLayer = (layer, dry = false) => {
      const target = this.target();
      if (!layer) {
        this.clear(target);
        return target;
      }
      const { bytes, size } = layer;
      if (dry) for (let i = 1; i < bytes.length; i += 4) bytes[i] = 0;
      const texture = new THREE.DataTexture(bytes, size, size);
      texture.magFilter = texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.copyPass.uniforms.source.value = texture;
      this.quad.material = this.copyPass;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.passCamera);
      this.copyPass.uniforms.source.value = null;
      texture.dispose();
      return target;
    };
    try {
      part.sampleMap ??= areaSamples(part.mesh.geometry);
      this.restore(part, {
        current: loadLayer(coat.current, true), history: coat.history ? loadLayer(coat.history) : null,
        ink: coat.ink, opacity: coat.opacity, coverage: coat.coverage, filled: coat.filled, fill: Number(coat.filled), fillStart: null,
        runoff: { pool: null, wet: null, drops: [] }, time: performance.now()
      }, performance.now());
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  snapshot(part, copy, now) {
    return {
      current: copy ? this.copyTarget(part.current) : part.current,
      history: copy ? this.copyTarget(part.history) : part.history,
      ink: part.ink, opacity: part.uniforms.uCoatOpacity.value, coverage: part.coverage, filled: part.filled,
      fill: part.uniforms.uFill.value, fillStart: part.fillStart,
      runoff: this.runoff.snapshot(part), time: now
    };
  }

  restore(part, state, now) {
    const { current, history, ink, opacity = 1, coverage, filled, fill, fillStart, runoff, time } = state;
    const elapsed = now - time;
    Object.assign(part, { current, history, ink, coverage, filled, fillStart: fillStart === null ? null : fillStart + elapsed });
    part.epoch++;
    part.uniforms.uOldPaint.value = history?.texture ?? blank;
    part.uniforms.uRoundPaint.value = current?.texture ?? blank;
    part.uniforms.uInk.value.set(ink ?? 0xffffff);
    part.uniforms.uFill.value = fill;
    part.uniforms.uCoatOpacity.value = opacity;
    this.runoff.restore(part, runoff, elapsed);
    this.filling.delete(part);
    this.dirty.delete(part);
    if (part.fillStart !== null) this.filling.add(part);
    else if (current && !filled) this.dirty.add(part);
    this.onCoverage(part);
  }

  disposeSnapshot(state) {
    state.current?.dispose();
    state.history?.dispose();
  }

  clearStack(stack, model) {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].model === model) this.disposeEntry(stack.splice(i, 1)[0]);
    }
  }

  disposeEntry(entry) {
    for (const state of entry.states.values()) this.disposeSnapshot(state);
  }

  trimHistory() {
    const textureCount = entry => {
      let count = 0;
      for (const state of entry.states.values()) count += Number(!!state.current) + Number(!!state.history);
      return count;
    };
    let entries = this.undoStack.length + this.redoStack.length;
    let textures = [...this.undoStack, ...this.redoStack].reduce((count, entry) => count + textureCount(entry), 0);
    while (entries > HISTORY_LIMIT || (entries > 1 && textures > HISTORY_TEXTURE_LIMIT)) {
      const oldestUndo = this.undoStack[0], oldestRedo = this.redoStack[0];
      const stack = !oldestUndo || (oldestRedo && oldestRedo.time < oldestUndo.time) ? this.redoStack : this.undoStack;
      const entry = stack.shift();
      textures -= textureCount(entry);
      entries--;
      this.disposeEntry(entry);
    }
  }

  recordStroke(gesture, part, now) {
    if (gesture.entry?.states.has(part)) return;
    if (!gesture.entry) {
      this.clearStack(this.redoStack, gesture.model);
      gesture.entry = { model: gesture.model, states: new Map(), time: now };
      this.undoStack.push(gesture.entry);
    }
    gesture.entry.states.set(part, this.snapshot(part, true, now));
    this.trimHistory();
    this.onHistory();
  }

  canUndo(model) {
    return this.undoStack.some(entry => entry.model === model) || this.queue.some(stamp => stamp.gesture.model === model);
  }

  canRedo(model) {
    return this.redoStack.some(entry => entry.model === model) && !this.queue.some(stamp => stamp.gesture.model === model);
  }

  changeHistory(model, redo) {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    const now = performance.now();
    const target = this.renderer.getRenderTarget();
    // A command just after release includes all dabs from that press, even those still in flight.
    this.flushPending(now);
    const index = from.findLastIndex(entry => entry.model === model);
    if (index !== -1) {
      const [entry] = from.splice(index, 1);
      const states = new Map();
      for (const [part, state] of entry.states) {
        states.set(part, this.snapshot(part, false, now));
        this.restore(part, state, now);
        this.onPaint(part);
      }
      to.push({ model, states, time: now });
      this.trimHistory();
    }
    this.renderer.setRenderTarget(target);
    this.onHistory();
  }

  paintSolid(parts, ink, model, opacity) {
    if (opacity === 0) return;
    const now = performance.now();
    const target = this.renderer.getRenderTarget();
    this.flushPending(now);
    const gesture = { model };
    for (const part of parts) {
      const sameCoat = part.ink === ink && part.uniforms.uCoatOpacity.value === opacity;
      if (sameCoat && part.filled && !this.runoff.wet.has(part)) continue;
      this.recordStroke(gesture, part, now);
      if (!sameCoat) this.startRound(part, ink, opacity);
      this.runoff.clear(part);
      this.clear(part.current);
      this.filling.delete(part);
      this.dirty.delete(part);
      part.epoch++;
      part.coverage = 1;
      part.filled = true;
      part.fillStart = null;
      part.uniforms.uFill.value = 1;
      this.onCoverage(part);
      this.onPaint(part);
    }
    this.renderer.setRenderTarget(target);
    this.onHistory();
  }

  startRound(part, ink, opacity) {
    if (!part.current) {
      part.current = this.target();
      part.sampleMap ??= areaSamples(part.mesh.geometry);
    } else if (part.ink) {
      const previous = part.history;
      const target = this.scratch ?? this.target();
      const u = this.flatten.uniforms;
      u.oldPaint.value = previous?.texture ?? blank;
      u.roundPaint.value = part.current.texture;
      u.ink.value.set(part.ink);
      u.fill.value = part.uniforms.uFill.value;
      u.opacity.value = part.uniforms.uCoatOpacity.value;
      this.quad.material = this.flatten;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.passCamera);
      part.history = target;
      this.scratch = previous;
    }
    if (!this.runoff.finishCoat(part)) this.clear(part.current);
    part.ink = ink;
    part.epoch++;
    part.coverage = 0;
    part.filled = false;
    part.fillStart = null;
    this.filling.delete(part);
    part.uniforms.uOldPaint.value = part.history?.texture ?? blank;
    part.uniforms.uRoundPaint.value = part.current.texture;
    part.uniforms.uInk.value.set(ink);
    part.uniforms.uFill.value = 0;
    part.uniforms.uCoatOpacity.value = opacity;
    this.onCoverage(part);
  }

  enqueue(stamp) {
    if (this.queue.length >= this.queueLimit) {
      // Combine nearby, overlapping dabs before the queue fills up on a fast drag.
      let kept = 0;
      for (let i = 0; i < this.queue.length; i++) {
        const a = this.queue[i], b = this.queue[i + 1];
        const mergeDistance = b ? Math.min(a.radius, b.radius) * .24 : 0;
        if (b && a.gesture === b.gesture && a.part === b.part &&
            a.point.distanceToSquared(b.point) <= mergeDistance ** 2) {
          b.dose = Math.min(1.2, b.dose + a.dose * .72);
          this.queue[kept++] = b;
          i++;
        } else this.queue[kept++] = a;
      }
      this.queue.length = kept;
      if (kept >= this.queueLimit) this.flushPending(performance.now(), 1);
    }
    this.queue.push(stamp);
  }

  cancelPending() {
    this.queue.length = 0;
  }

  flushPending(now = performance.now(), count = this.queue.length) {
    if (!this.queue.length) return;
    const target = this.renderer.getRenderTarget();
    for (const stamp of this.queue.splice(0, count)) this.deposit(stamp, now);
    this.renderer.setRenderTarget(target);
  }

  deposit(stamp, now) {
    const { part, origin, point, radius, ink, opacity, grain, dose, at, wetness, gesture } = stamp;
    const sameCoat = part.ink === ink && part.uniforms.uCoatOpacity.value === opacity;
    if (opacity === 0 || (sameCoat && !wetness && (part.filled || part.fillStart !== null))) return;
    this.recordStroke(gesture, part, now);
    if (!sameCoat) this.startRound(part, ink, opacity);

    const camera = this.depthCamera;
    const distance = origin.distanceTo(point);
    camera.position.copy(origin);
    camera.up.set(0, 1, 0);
    camera.near = Math.max(.018, distance * .045);
    camera.far = distance + radius * 2.4;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(radius / distance));
    camera.lookAt(point);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    for (const { source, proxy } of this.occluders) {
      proxy.visible = true;
      for (let parent = source; parent; parent = parent.parent) {
        if (!parent.visible || parent.userData.paintInactive) { proxy.visible = false; break; }
      }
      if (!proxy.visible) continue;
      proxy.matrix.copy(source.matrixWorld);
      proxy.matrixWorldNeedsUpdate = true;
    }
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.depthScene, camera);

    const u = this.uvMaterial.uniforms;
    u.nozzleMatrix.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.worldMatrix.value.copy(part.mesh.matrixWorld);
    u.worldNormal.value.getNormalMatrix(part.mesh.matrixWorld);
    u.nozzle.value.copy(origin);
    u.dose.value = dose;
    u.seed.value = at % 709;
    u.wetness.value = wetness;
    u.grain.value = grain;
    this.uvMesh.geometry = part.mesh.geometry;
    this.renderer.setRenderTarget(part.current);
    this.renderer.render(this.uvScene, this.passCamera);
    if (wetness) this.runoff.land(stamp);
    this.dirty.add(part);
    this.onPaint(part);
  }

  requestCoverage(part) {
    const gl = this.gl;
    const u = this.coveragePass.uniforms;
    u.coords.value = part.sampleMap;
    u.paint.value = part.current.texture;
    this.quad.material = this.coveragePass;
    this.renderer.setRenderTarget(this.coverageTarget);
    this.renderer.render(this.quadScene, this.passCamera);

    this.readBuffer ??= gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.readBuffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, SAMPLE_COUNT * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, SAMPLE_W, SAMPLE_H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.flush();
    this.read = { part, epoch: part.epoch, fence };
  }

  pollCoverage(now) {
    if (!this.read) return;
    const gl = this.gl;
    const { part, epoch, fence } = this.read;
    const result = gl.clientWaitSync(fence, 0, 0);
    if (result === gl.TIMEOUT_EXPIRED) return;
    gl.deleteSync(fence);
    this.read = null;
    if (result === gl.WAIT_FAILED || epoch !== part.epoch || !part.current) return;
    this.readBytes ??= new Uint8Array(SAMPLE_COUNT * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.readBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.readBytes);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    let covered = 0;
    for (let i = 0; i < this.readBytes.length; i += 4) covered += this.readBytes[i] > 127 ? 1 : 0;
    part.coverage = covered / SAMPLE_COUNT;
    this.maybeFill(part, now);
    this.onCoverage(part);
  }

  maybeFill(part, now) {
    if (part.current && !part.filled && part.fillStart === null && this.autoFill() && part.coverage >= this.threshold()) {
      part.fillStart = now;
      this.filling.add(part);
    }
  }

  tick(now) {
    this.pollCoverage(now);
    for (const part of this.filling) {
      const progress = Math.min(1, (now - part.fillStart) / 250);
      part.uniforms.uFill.value = 1 - (1 - progress) ** 3;
      if (progress === 1) {
        part.fillStart = null;
        part.coverage = 1;
        part.filled = true;
        this.filling.delete(part);
        this.onCoverage(part);
        this.onPaint(part);
      }
    }
    const previous = this.renderer.getRenderTarget();
    const hadStamps = this.queue.length > 0;
    // Bound the work per frame when a backgrounded tab resumes.
    for (let i = 0; i < this.stampsPerFrame && this.queue[0]?.at <= now; i++) this.deposit(this.queue.shift(), now);
    if (hadStamps && !this.queue.length) this.onHistory();
    this.runoff.step(now, this.dirty, this.onPaint);
    if (!this.read && this.dirty.size && now - this.lastRead >= 125) {
      const part = this.dirty.values().next().value;
      this.dirty.delete(part);
      if (part.current && !part.filled && part.fillStart === null) this.requestCoverage(part);
      this.lastRead = now;
    }
    this.renderer.setRenderTarget(previous);
  }

  reset(model) {
    this.cancelPending();
    this.clearStack(this.undoStack, model);
    this.clearStack(this.redoStack, model);
    for (const part of model.parts) {
      this.runoff.clear(part);
      this.dirty.delete(part);
      this.filling.delete(part);
      part.current?.dispose();
      part.history?.dispose();
      part.current = part.history = part.ink = part.fillStart = null;
      part.coverage = 0;
      part.filled = false;
      part.epoch++;
      part.uniforms.uOldPaint.value = blank;
      part.uniforms.uRoundPaint.value = blank;
      part.uniforms.uFill.value = 0;
      part.uniforms.uCoatOpacity.value = 1;
      this.onCoverage(part);
    }
    this.onHistory();
  }
}
