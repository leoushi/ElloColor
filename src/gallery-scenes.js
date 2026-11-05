import * as THREE from 'three';
import { makeOcean } from './ocean.js';

export const galleryScenes = [
  { id: 'bench', name: '工作台' },
  { id: 'sky', name: '天空' },
  { id: 'ocean', name: '海洋' },
  { id: 'desert', name: '沙漠' },
  { id: 'space', name: '宇宙' }
];

const palettes = {
  sky: [0x256199, 0xcadcea, 0x879fbc],
  ocean: [0x245b86, 0x9dbacb, 0x2b5b72],
  desert: [0x527c9a, 0xe8ca9d, 0xb49067],
  space: [0x070c24, 0x141b3b, 0x040510]
};

function dome(id, sun) {
  const [zenith, horizon, lower] = palettes[id].map(hex => new THREE.Color(hex));
  const mode = id === 'space' ? 3 : id === 'desert' ? 2 : id === 'ocean' ? 1 : 0;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zenith: { value: zenith }, horizon: { value: horizon }, lower: { value: lower },
      sun: { value: sun }, mode: { value: mode }, time: { value: 0 } },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform vec3 zenith, horizon, lower, sun;
      uniform float mode, time;
      varying vec3 direction;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(cell), hash(cell + vec2(1,0)), f.x),
                   mix(hash(cell + vec2(0,1)), hash(cell + vec2(1,1)), f.x), f.y);
      }
      float clouds(vec2 p) {
        return .54 * noise(p) + .27 * noise(p * 2.15 + 4.) +
               .13 * noise(p * 4.55 - 3.) + .06 * noise(p * 9.2);
      }
      void main() {
        vec3 ray = normalize(direction);
        vec3 color = mix(horizon, zenith, pow(max(0., ray.y), .53));
        color = mix(color, lower, smoothstep(0., .76, -ray.y));
        if (mode > 2.5) {
          vec2 sky = vec2(atan(ray.z, ray.x), asin(ray.y));
          float nebula = clouds(sky * vec2(2.4, 5.) + vec2(3., -1.));
          float belt = exp(-abs(ray.y + ray.x * .27) * 3.5);
          color = mix(lower, zenith + vec3(.035,.017,.062) * nebula, belt);
          vec2 stars = sky * 180.;
          vec2 cell = floor(stars);
          float size = hash(cell + 17.);
          vec2 center = vec2(hash(cell), hash(cell - 11.)) * .55 + .225;
          float star = 1. - smoothstep(.019, .096 + size * .07, length(fract(stars) - center));
          color += star * step(.982, size) * vec3(.68,.78,1.) * (.36 + .9 * hash(cell + 9.));
          float lit = max(0., dot(normalize(sun), ray));
          color += vec3(.62,.76,1.) * (.10 * pow(lit, 46.) + 3.2 * pow(lit, 1700.));
        } else {
          float height = mode < .5 ? ray.y + .18 : ray.y + .07;
          vec2 plane = ray.xz / max(.08, height);
          float vapor = clouds(plane * .9 + vec2(time * .009, .27));
          float coverage = mode < .5 ? .44 : mode < 1.5 ? .52 : .67;
          float cloud = smoothstep(coverage, coverage + .20, vapor) * smoothstep(-.11, .18, height);
          bool oceanSky = mode > .5 && mode < 1.5;
          if (oceanSky) cloud *= smoothstep(.012, .16, ray.y);
          vec3 cloudLight = oceanSky ? vec3(.65,.76,.84) : vec3(.93,.96,1.);
          color = mix(color, mix(horizon, cloudLight, smoothstep(.43,.79,vapor)), cloud);
          float lit = max(0., dot(normalize(sun), ray));
          color += vec3(1., .68, .34) * (.16 * pow(lit, 14.) + .8 * pow(lit, 480.));
        }
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(67, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

function sand() {
  const geometry = new THREE.PlaneGeometry(108, 108, 108, 108);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const light = new THREE.Color(0xd3ad7d), shadow = new THREE.Color(0xb6875b);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const ridge = Math.sin(z * .29 + Math.sin(x * .14) * .9);
    const dunes = ridge * .7 + Math.sin(x * .43 + z * .16) * .44;
    const border = THREE.MathUtils.smoothstep(Math.hypot(x, z), 2.8, 21);
    positions.setY(i, .032 + border * (dunes + .14));
    shadow.clone().lerp(light, .52 + .22 * ridge + .06 * Math.sin(x * 3.1 + z)).toArray(colors, i * 3);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 }));
  mesh.receiveShadow = true;
  return mesh;
}

export function makeGalleryScene(id, sun, waterline) {
  const group = new THREE.Group();
  const sky = dome(id, sun);
  group.add(sky);
  const sea = id === 'ocean' ? makeOcean(sun, waterline) : null;
  if (sea) group.add(sea.mesh);
  if (id === 'desert') group.add(sand());
  return {
    group,
    sea,
    sky,
    update(camera, time) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = time;
      sea?.update(time);
    }
  };
}
