import * as THREE from 'three';

export class SprayParticles {
  constructor(scene, low) {
    this.limit = 4800;
    this.cursor = 0;
    this.low = low;
    const fields = { position: 3, destination: 3, ink: 3, birth: 1, lifetime: 1, diameter: 1 };
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setDrawRange(0, 0);
    this.attributes = {};
    for (const [name, size] of Object.entries(fields)) {
      const attribute = new THREE.BufferAttribute(new Float32Array(this.limit * size), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attribute);
      this.attributes[name] = attribute;
    }
    this.uniforms = { time: { value: 0 }, dpr: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute vec3 destination, ink;
        attribute float birth, lifetime, diameter;
        uniform float time, dpr;
        varying vec4 pigment;
        void main() {
          float t = (time - birth) / max(lifetime, .001);
          if (lifetime < .001 || t < 0. || t >= 1.) { gl_Position = vec4(3.,3.,3.,1.); gl_PointSize = 0.; return; }
          vec3 axis = normalize(destination - position);
          vec3 drift = vec3(sin(birth * 347. + diameter), cos(birth * 299.), sin(birth * 179.));
          drift -= axis * dot(drift, axis);
          vec3 p = mix(position, destination, t) + drift * sin(t * 3.14159) * .017 * t;
          vec4 view = modelViewMatrix * vec4(p, 1.);
          float fade = smoothstep(0.,.15,t) * (1. - smoothstep(.53,1.,t));
          pigment = vec4(ink, fade * mix(.55, .15, smoothstep(1.2, 3.4, diameter)));
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(diameter * 6. * dpr / -view.z, 1., 6. * dpr);
        }
      `,
      fragmentShader: `
        varying vec4 pigment;
        void main() {
          float radial = length(gl_PointCoord - .5) * 2.;
          if (radial > 1.) discard;
          float mist = exp(-4.8 * radial * radial) * (1. - smoothstep(.55, 1., radial));
          gl_FragColor = vec4(pigment.rgb, pigment.a * mist);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(origin, point, normal, radius, color, flow, time, flight, grain) {
    const { position, destination, ink, birth, lifetime, diameter } = this.attributes;
    const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, .01)).normalize();
    if (tangent.lengthSq() < .01) tangent.set(1, 0, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    const pigment = new THREE.Color(color);
    const target = new THREE.Vector3();
    const diameterScale = THREE.MathUtils.lerp(.43, 1, grain);
    const countScale = THREE.MathUtils.lerp(this.low ? 2.3 : 2.65, 1, grain);
    const n = Math.round((this.low ? 55 : 120) * (.42 + flow) * countScale);
    const start = this.cursor % this.limit;
    for (let i = 0; i < n; i++) {
      const index = this.cursor++ % this.limit;
      const angle = Math.random() * 2 * Math.PI;
      const outer = i % 5 === 0;
      const radial = Math.random() ** (outer ? .45 : .86) * radius * (outer ? 1.15 : .82);
      target.copy(point).addScaledVector(tangent, Math.cos(angle) * radial)
        .addScaledVector(bitangent, Math.sin(angle) * radial).addScaledVector(normal, .015);
      position.setXYZ(index, origin.x, origin.y, origin.z);
      destination.setXYZ(index, target.x, target.y, target.z);
      ink.setXYZ(index, pigment.r, pigment.g, pigment.b);
      birth.setX(index, time + Math.random() * .028);
      lifetime.setX(index, flight * (.67 + Math.random() * .36));
      diameter.setX(index, (outer ? 2.4 + Math.random() * 1.3 : .8 + Math.random() * 1.15) * diameterScale);
    }
    const span = Math.min(n, this.limit - start);
    for (const attribute of Object.values(this.attributes)) {
      attribute.addUpdateRange(start * attribute.itemSize, span * attribute.itemSize);
      if (span < n) attribute.addUpdateRange(0, (n - span) * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, Math.min(this.cursor, this.limit));
  }

  tick(now, dpr) {
    this.uniforms.time.value = now;
    this.uniforms.dpr.value = dpr;
  }

  clear() {
    this.cursor = 0;
    this.geometry.setDrawRange(0, 0);
    for (const attribute of Object.values(this.attributes)) attribute.clearUpdateRanges();
  }
}
