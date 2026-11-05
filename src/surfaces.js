import * as THREE from 'three';

function hash(x, y) {
  let value = Math.imul(x + 1, 1597334677) ^ Math.imul(y + 1, 3812015801);
  value = Math.imul(value ^ (value >>> 16), 2246822519);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967295;
}

// Smooth periodic noise keeps the texture continuous at the UV repeat.
function grain(u, v, columns, rows = columns) {
  const x = u * columns, y = v * rows;
  const i = Math.floor(x), j = Math.floor(y);
  const dx = x - i, dy = y - j;
  const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
  const right = (i + 1) % columns, bottom = (j + 1) % rows;
  const topValue = THREE.MathUtils.lerp(hash(i, j), hash(right, j), sx);
  const bottomValue = THREE.MathUtils.lerp(hash(i, bottom), hash(right, bottom), sx);
  return THREE.MathUtils.lerp(topValue, bottomValue, sy) * 2 - 1;
}

const brushed = (u, v) => grain(u, v, 5, 120) * .78 + grain(u, v, 85) * .22;
const powder = (u, v) => grain(u, v, 86) * .68 + grain(u, v, 34) * .32;
const pores = (u, v) => grain(u, v, 25) * .55 + grain(u, v, 94) * .45;
const oak = (u, v) => {
  const fibers = v * 31 + .32 * Math.sin(2 * Math.PI * u) + .62 * grain(u, v, 3, 7);
  return Math.sin(2 * Math.PI * fibers) * .28 + grain(u, v, 5, 51) * .51 + grain(u, v, 11, 92) * .21;
};
const walnut = (u, v) => {
  const fibers = v * 21 + .68 * Math.sin(2 * Math.PI * u) + .74 * grain(u, v, 3, 6);
  return Math.sin(2 * Math.PI * fibers) * .26 + grain(u, v, 4, 37) * .54 + grain(u, v, 8, 80) * .20;
};
const concrete = (u, v) => grain(u, v, 6) * .55 + grain(u, v, 26) * .22 + grain(u, v, 74) * .23;
const granite = (u, v) => {
  const flecks = grain(u, v, 70);
  return Math.sign(flecks) * Math.abs(flecks) ** .65 * .68 + grain(u, v, 21) * .23 + grain(u, v, 8) * .09;
};
const leather = (u, v) => {
  const cells = grain(u, v, 38);
  return .68 * (Math.abs(cells) ** .37 * 2 - 1) + .32 * grain(u, v, 110);
};
const weave = (u, v) => {
  const x = 2 * Math.PI * 32 * u, y = 2 * Math.PI * 32 * v;
  return .64 * Math.cos(x) * Math.cos(y) + .36 * Math.sin(x - y);
};

export const surfaces = [
  { id: 'matte', name: '哑光白模', color: '#e0e4e6', roughness: .55, metalness: .02, env: 1.06 },
  { id: 'mirror-steel', name: '镜面不锈钢', color: '#e3e7eb', roughness: .035, metalness: 1, env: 1.46 },
  { id: 'steel', name: '抛光不锈钢', color: '#bfc7ce', roughness: .14, metalness: 1, env: 1.24 },
  { id: 'metal', name: '拉丝不锈钢', color: '#b4c2cd', roughness: .32, metalness: .96, env: 1.20, pattern: brushed, contrast: .12, bump: .014 },
  { id: 'aluminum', name: '喷砂铝', color: '#a6b3bf', roughness: .47, metalness: .87, env: 1.16, pattern: powder, contrast: .12, bump: .024 },
  { id: 'brass', name: '黄铜', color: '#d8ab5c', roughness: .26, metalness: .96, env: 1.14, pattern: brushed, contrast: .055, bump: .008 },
  { id: 'ceramic', name: '釉面陶瓷', color: '#f1e9dc', roughness: .16, metalness: 0 },
  { id: 'terracotta', name: '素烧陶土', color: '#b96643', roughness: .87, metalness: 0, pattern: pores, contrast: .20, bump: .042 },
  { id: 'plastic', name: '磨砂塑料', color: '#a7b4c3', roughness: .65, metalness: 0, pattern: powder, contrast: .095, bump: .021 },
  { id: 'abs', name: '亮面 ABS', color: '#b9d0d0', roughness: .22, metalness: 0 },
  { id: 'rubber', name: '哑光橡胶', color: '#393b3e', roughness: .94, metalness: 0, pattern: powder, contrast: .14, bump: .020 },
  { id: 'wood', name: '浅色橡木', color: '#cfaa7a', roughness: .54, metalness: 0, pattern: oak, contrast: .18, bump: .011, scale: .64 },
  { id: 'walnut', name: '深色胡桃木', color: '#78503b', roughness: .46, metalness: 0, pattern: walnut, contrast: .23, bump: .012, scale: .61 },
  { id: 'concrete', name: '清水混凝土', color: '#a19f97', roughness: .85, metalness: 0, pattern: concrete, contrast: .18, bump: .021, scale: .54 },
  { id: 'granite', name: '花岗岩', color: '#8f9196', roughness: .53, metalness: 0, pattern: granite, contrast: .36, bump: .015, scale: .68 },
  { id: 'leather', name: '粒面皮革', color: '#7a5141', roughness: .55, metalness: 0, pattern: leather, contrast: .22, bump: .022, scale: .70 },
  { id: 'fabric', name: '编织布料', color: '#748394', roughness: .92, metalness: 0, pattern: weave, contrast: .27, bump: .018, scale: .76 }
];
const textures = new Map();

function surfaceTexture(pixels, size) {
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = size > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = size > 1;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function makeMaps(surface) {
  const size = surface.pattern ? 256 : 1;
  const colorData = new Uint8Array(size * size * 4);
  const detailData = new Uint8Array(colorData.length);
  const base = new THREE.Color(surface.color).getRGB({}, THREE.SRGBColorSpace);
  const rgb = [base.r, base.g, base.b];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (x + y * size) * 4;
      const height = surface.pattern?.(x / size, y / size) ?? 0;
      const value = 1 + height * (surface.contrast ?? 0);
      for (let channel = 0; channel < 3; channel++) {
        colorData[index + channel] = Math.round(255 * Math.min(1, rgb[channel] * value));
      }
      colorData[index + 3] = detailData[index + 3] = 255;
      detailData[index] = Math.round(255 * (.5 + height * .5));
      // Three.js samples red for bump height and green for roughness.
      detailData[index + 1] = surface.pattern ? Math.round(255 * (.92 - height * .08)) : 255;
    }
  }
  const map = surfaceTexture(colorData, size);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, detail: surfaceTexture(detailData, size) };
}

export function surfaceAppearance(id) {
  const surface = surfaces.find(item => item.id === id) ?? surfaces[0];
  if (!textures.has(surface.id)) {
    textures.set(surface.id, {
      ...surface, ...makeMaps(surface), bump: surface.bump ?? 0, env: surface.env ?? .82,
      scale: surface.scale ?? (surface.pattern ? .76 : 0)
    });
  }
  return textures.get(surface.id);
}

export function applySurface(material, surface, uniforms) {
  material.map = surface.map;
  material.bumpMap = material.roughnessMap = surface.detail;
  material.bumpScale = surface.bump;
  material.roughness = surface.roughness;
  material.metalness = surface.metalness;
  material.envMapIntensity = surface.env;
  uniforms.uSurfaceScale.value = surface.scale;
}

export function surfaceUniforms(restFrame = new THREE.Matrix4()) {
  return {
    uSurfaceFrame: { value: restFrame },
    uSurfaceNormalFrame: { value: new THREE.Matrix3().getNormalMatrix(restFrame) },
    uSurfaceScale: { value: 0 }, uNextSurfaceScale: { value: 0 },
    uNextSurfaceMap: { value: null }, uNextSurfaceDetail: { value: null },
    uNextBumpScale: { value: 0 }, uSurfaceMix: { value: 0 }
  };
}

// Project the material in the assembled model's coordinates. Paint keeps its own UVs.
export function projectSurface(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = `
    uniform mat4 uSurfaceFrame;
    uniform mat3 uSurfaceNormalFrame;
    varying vec3 vSurfacePosition, vSurfaceNormal;
  ` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vSurfacePosition = (uSurfaceFrame * vec4(position, 1.)).xyz;
    vSurfaceNormal = uSurfaceNormalFrame * normal;
  `);
  shader.fragmentShader = `
    varying vec3 vSurfacePosition, vSurfaceNormal;
    uniform sampler2D uNextSurfaceMap, uNextSurfaceDetail;
    uniform float uSurfaceScale, uNextSurfaceScale, uNextBumpScale, uSurfaceMix;
    vec4 projectedSurface(sampler2D tex, float scale) {
      if (scale <= 0.) return texture2D(tex, vec2(.5));
      vec3 p = vSurfacePosition * scale;
      vec3 w = abs(normalize(vSurfaceNormal));
      w *= w;
      w *= w;
      w /= max(dot(w, vec3(1.)), .00001);
      return texture2D(tex, p.yz) * w.x + texture2D(tex, p.xz) * w.y + texture2D(tex, p.yx) * w.z;
    }
  ` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
    #ifdef USE_MAP
      vec4 substrateColor = projectedSurface(map, uSurfaceScale);
      if (uSurfaceMix > 0.) substrateColor = mix(substrateColor, projectedSurface(uNextSurfaceMap, uNextSurfaceScale), uSurfaceMix);
      diffuseColor *= substrateColor;
    #endif
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    float roughnessFactor = roughness;
    #ifdef USE_ROUGHNESSMAP
      float detail = projectedSurface(roughnessMap, uSurfaceScale).g;
      if (uSurfaceMix > 0.) detail = mix(detail, projectedSurface(uNextSurfaceDetail, uNextSurfaceScale).g, uSurfaceMix);
      roughnessFactor *= detail;
    #endif
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <bumpmap_pars_fragment>',
    THREE.ShaderChunk.bumpmap_pars_fragment.replace(/vec2 dHdxy_fwd\(\)\s*\{[^}]*\}/, `
      vec2 dHdxy_fwd() {
        if (bumpScale == 0. && (uSurfaceMix <= 0. || uNextBumpScale == 0.)) return vec2(0.);
        float h = bumpScale * projectedSurface(bumpMap, uSurfaceScale).r;
        if (uSurfaceMix > 0.) h = mix(h, uNextBumpScale * projectedSurface(uNextSurfaceDetail, uNextSurfaceScale).r, uSurfaceMix);
        return vec2(dFdx(h), dFdy(h));
      }
    `));
}
