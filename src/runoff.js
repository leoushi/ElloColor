import * as THREE from 'three';

const maxPerPart = 4;
const down = new THREE.Vector3(0, -1, 0);
const segmentBlend = {
  side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, toneMapped: false
};

export class PaintRunoff {
  constructor(renderer, camera, lowQuality) {
    this.renderer = renderer;
    this.camera = camera;
    this.maxDrops = lowQuality ? 6 : 12;
    this.drops = [];
    this.wet = new Map();
    this.ray = new THREE.Raycaster();
    this.lastStep = 0;
    this.scene = new THREE.Scene();
    this.trail = new THREE.ShaderMaterial({
      ...segmentBlend,
      uniforms: {
        starts: { value: Array.from({ length: maxPerPart }, () => new THREE.Vector4()) },
        ends: { value: Array.from({ length: maxPerPart }, () => new THREE.Vector4()) },
        normals: { value: Array.from({ length: maxPerPart }, () => new THREE.Vector3()) },
        count: { value: 0 }
      },
      vertexShader: `
        attribute vec2 paintUv;
        varying vec3 surfacePoint, surfaceNormal;
        void main() {
          surfacePoint = position;
          surfaceNormal = normal;
          gl_Position = vec4(paintUv * 2. - 1., 0., 1.);
        }
      `,
      fragmentShader: `
        uniform vec4 starts[${maxPerPart}], ends[${maxPerPart}];
        uniform vec3 normals[${maxPerPart}];
        uniform int count;
        varying vec3 surfacePoint, surfaceNormal;
        void main() {
          float coverage = 0., moisture = 0.;
          for (int i = 0; i < ${maxPerPart}; i++) {
            if (i >= count) break;
            if (dot(normalize(surfaceNormal), normals[i]) < .55) continue;
            vec3 segment = ends[i].xyz - starts[i].xyz;
            float t = clamp(dot(surfacePoint - starts[i].xyz, segment) / max(dot(segment, segment), .000001), 0., 1.);
            float radius = starts[i].w * mix(.64, 1.0, t);
            float distance = length(surfacePoint - starts[i].xyz - t * segment);
            float film = (1. - smoothstep(.22 * radius, radius, distance)) * ends[i].w;
            coverage = max(coverage, film);
            moisture = max(moisture, film * mix(.65, 1.0, t));
          }
          if (coverage <= 0.) discard;
          gl_FragColor = vec4(coverage, moisture, 0., coverage);
        }
      `
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.trail);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.dryScene = new THREE.Scene();
    this.dry = new THREE.ShaderMaterial({
      ...segmentBlend,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { retained: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform vec2 retained; void main() { gl_FragColor = vec4(retained, 1., 1.); }'
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dry);
    quad.frustumCulled = false;
    this.dryScene.add(quad);
  }

  wetSurface(part, now) {
    const surface = this.wet.get(part);
    if (surface) surface.lastWet = now;
    else this.wet.set(part, { lastWet: now, lastDry: now });
  }

  land({ part, point, normal, radius, dose, wetness, at }) {
    this.wetSurface(part, at);
    if (wetness < .32 || this.drops.length >= this.maxDrops) return;
    const local = part.mesh.worldToLocal(point.clone());
    let pool = part.runoffPool;
    if (!pool || at - pool.at > 270 || pool.point.distanceToSquared(local) > radius ** 2 * .28) {
      pool = part.runoffPool = { point: local, amount: 0, at, lastDrip: pool?.lastDrip ?? -Infinity, lane: pool?.lane ?? 0 };
    }
    pool.at = at;
    pool.amount += dose * wetness ** 1.6;
    if (pool.amount < .66 || at - pool.lastDrip < 215 ||
        this.drops.filter(drop => drop.part === part).length >= maxPerPart) return;
    if (Math.abs(down.dot(normal)) > .97) return;

    const side = new THREE.Vector3().crossVectors(down, normal).normalize();
    const lane = ((pool.lane++ * .618) % 1 - .5) * radius * .83;
    const start = this.onSurface(part.mesh, point.clone().addScaledVector(side, lane), normal);
    const inverse = part.mesh.matrixWorld.clone().invert();
    const surfaceNormal = (start?.normal ?? normal).clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(inverse));
    this.drops.push({
      part, point: (start?.point ?? point).clone().applyMatrix4(inverse), normal: surfaceNormal,
      width: THREE.MathUtils.clamp(radius * (.08 + wetness * .065), .012, .042),
      speed: .07 + wetness * .05, wetness, until: at + 850 + wetness * 1320
    });
    pool.amount = 0;
    pool.lastDrip = at;
  }

  onSurface(mesh, candidate, normal) {
    this.ray.set(candidate.clone().addScaledVector(normal, .095), normal.clone().negate());
    this.ray.far = .195;
    const hit = this.ray.intersectObject(mesh, false)[0];
    if (!hit?.face) return null;
    const surfaceNormal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
    if (surfaceNormal.dot(normal) < .38) return null;
    return { point: hit.point, normal: surfaceNormal };
  }

  step(now, dirty, onPaint) {
    const elapsed = now - this.lastStep;
    if (elapsed < 24 || (!this.wet.size && !this.drops.length)) return;
    this.lastStep = now;
    const dt = Math.min(.044, elapsed / 1000);
    const batches = new Map();
    this.drops = this.drops.filter(drop => {
      const { part, wetness } = drop;
      if (!part.current || now >= drop.until) return false;
      const mesh = part.mesh;
      const world = mesh.localToWorld(drop.point.clone());
      const normal = drop.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
      const tangent = down.clone().addScaledVector(normal, -down.dot(normal));
      const slope = tangent.length();
      if (slope < .19) return false;
      drop.speed = Math.min(.63, drop.speed + dt * (.22 + wetness * .78) * slope);
      const next = this.onSurface(mesh, world.clone().addScaledVector(tangent, drop.speed * dt / slope), normal);
      if (!next || next.point.y > world.y + .002 || next.point.distanceToSquared(world) > .013) return false;

      const inverse = mesh.matrixWorld.clone().invert();
      const start = drop.point;
      drop.point = next.point.applyMatrix4(inverse);
      drop.normal = next.normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(inverse));
      const strength = Math.min(1, (drop.until - now) / 350);
      const segments = batches.get(part) ?? [];
      segments.push({ start, end: drop.point, normal: drop.normal, width: drop.width * (.55 + strength * .45), opacity: (.21 + wetness * .24) * strength });
      batches.set(part, segments);
      return true;
    });

    for (const [part, segments] of batches) {
      const { starts, ends, normals, count } = this.trail.uniforms;
      count.value = segments.length;
      segments.forEach(({ start, end, normal, width, opacity }, i) => {
        starts.value[i].set(start.x, start.y, start.z, width);
        ends.value[i].set(end.x, end.y, end.z, opacity);
        normals.value[i].copy(normal);
      });
      this.mesh.geometry = part.mesh.geometry;
      this.renderer.setRenderTarget(part.current);
      this.renderer.render(this.scene, this.camera);
      this.wetSurface(part, now);
      dirty.add(part);
      onPaint(part);
    }

    for (const [part, surface] of this.wet) {
      if (now - surface.lastDry < 115) continue;
      const done = now - surface.lastWet >= 5600;
      this.dry.uniforms.retained.value.set(1, done ? 0 : Math.exp(-(now - surface.lastDry) / 1450));
      this.renderer.setRenderTarget(part.current);
      this.renderer.render(this.dryScene, this.camera);
      surface.lastDry = now;
      if (done) this.wet.delete(part);
    }
  }

  stopDrops(part) {
    part.runoffPool = null;
    this.drops = this.drops.filter(drop => drop.part !== part);
  }

  finishCoat(part) {
    this.stopDrops(part);
    if (!this.wet.has(part)) return false;
    this.dry.uniforms.retained.value.set(0, 1);
    this.renderer.setRenderTarget(part.current);
    this.renderer.render(this.dryScene, this.camera);
    return true;
  }

  snapshot(part) {
    const pool = part.runoffPool;
    const wet = this.wet.get(part);
    return {
      pool: pool && { ...pool, point: pool.point.clone() },
      wet: wet && { ...wet },
      drops: this.drops.filter(drop => drop.part === part)
        .map(drop => ({ ...drop, point: drop.point.clone(), normal: drop.normal.clone() }))
    };
  }

  restore(part, { pool, wet, drops }, elapsed) {
    this.clear(part);
    if (pool) part.runoffPool = { ...pool, at: pool.at + elapsed, lastDrip: pool.lastDrip + elapsed };
    if (wet) this.wet.set(part, { lastWet: wet.lastWet + elapsed, lastDry: wet.lastDry + elapsed });
    for (const drop of drops) this.drops.push({ ...drop, until: drop.until + elapsed });
  }

  clear(part) {
    this.stopDrops(part);
    this.wet.delete(part);
  }
}
