import * as THREE from '../vendor/three.module.js';
import { mkdir, writeFile } from 'node:fs/promises';

const modelDirectory = new URL('../assets/demo/', import.meta.url);
const palette = {
  enamel: [0xe7ecf2, 0.08, 0.43],
  ceramic: [0xb9c6d4, 0.22, 0.43],
  dark: [0x212a34, 0.38, 0.48],
  recess: [0x0e151d, 0.33, 0.54],
  alloy: [0x718596, 0.72, 0.34],
  blackGlass: [0x101c25, 0.65, 0.21],
  safety: [0xf9782c, 0.25, 0.38],
  indicator: [0x61d9f4, 0.18, 0.24],
};

function place(geometry, center, rotation = [0, 0, 0]) {
  const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
  transform.setPosition(...center);
  return geometry.applyMatrix4(transform);
}

// All armor profiles are convex, so each signed dominant-axis chart has an
// injective planar projection even along its bevel.
function plate(points, depth, bevel, center, rotation = [0, 0, 0]) {
  const outline = new THREE.Shape();
  outline.moveTo(...points[0]);
  points.slice(1).forEach(point => outline.lineTo(...point));
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  return place(geometry, center, rotation);
}

function block(width, height, depth, center, rotation = [0, 0, 0], edge = 0.08) {
  const bevel = Math.min(depth * 0.21, width * 0.055, height * 0.055, 0.026);
  const x = width / 2 - bevel;
  const y = height / 2 - bevel;
  const corner = Math.min(x, y) * edge;
  return plate([
    [-x + corner, -y], [x - corner, -y], [x, -y + corner], [x, y - corner],
    [x - corner, y], [-x + corner, y], [-x, y - corner], [-x, -y + corner],
  ], depth, bevel, center, rotation);
}

function cylinder(top, bottom, height, center, rotation = [0, 0, 0], sides = 24) {
  return place(new THREE.CylinderGeometry(top, bottom, height, sides, 1), center, rotation);
}

function taper(bottom, top, height, depth, center, rotation = [0, 0, 0], corner = 0.08) {
  const y = height / 2;
  const b = bottom / 2;
  const t = top / 2;
  const cut = Math.min(corner, b / 2, t / 2, y / 2);
  return plate([
    [-b + cut, -y], [b - cut, -y], [b + cut * 0.15, -y + cut],
    [t + cut * 0.15, y - cut], [t - cut, y], [-t + cut, y],
    [-t - cut * 0.15, y - cut], [-b - cut * 0.15, -y + cut],
  ], depth, Math.min(0.035, depth / 5), center, rotation);
}

function screw(size, center, rotation = [Math.PI / 2, 0, 0]) {
  return cylinder(size, size * 1.13, 0.019, center, rotation, 8);
}

function assembly(id, name, explode, optional = false) {
  return { id, name, explode, optional, mesh: 'paint-' + id, paint: [], details: {} };
}

function coat(part, geometry, unwrap = 'planar') {
  part.paint.push({ geometry, unwrap });
}

function detail(part, material, geometry) {
  (part.details[material] ??= []).push({ geometry, unwrap: 'none' });
}

function atlas() {
  const head = assembly('helmet', '头部装甲', [0, 0.61, 0.15]);
  coat(head, taper(0.46, 0.54, 0.47, 0.51, [0, 3.40, 0.01], [0, 0, 0], 0.10));
  coat(head, block(0.46, 0.095, 0.36, [0, 3.16, 0.20], [0.10, 0, 0], 0.28));
  detail(head, 'recess', cylinder(0.13, 0.15, 0.19, [0, 3.075, 0], [0, 0, 0], 16));
  detail(head, 'blackGlass', taper(0.35, 0.49, 0.15, 0.12, [0, 3.38, 0.268], [-0.08, 0, 0], 0.036));
  detail(head, 'safety', block(0.043, 0.096, 0.026, [0, 3.54, 0.272], [-0.06, 0, 0], 0.12));
  for (const side of [-1, 1]) {
    coat(head, block(0.108, 0.24, 0.38, [side * 0.255, 3.32, 0.07], [0, side * 0.18, side * 0.12], 0.28));
    detail(head, 'indicator', block(0.142, 0.014, 0.018, [side * 0.095, 3.39, 0.339], [0, 0, side * 0.13], 0.18));
    detail(head, 'alloy', screw(0.027, [side * 0.207, 3.53, 0.270]));
  }

  const chest = assembly('chest', '胸部外壳', [0, 0.18, 0.74]);
  coat(chest, taper(0.59, 0.99, 0.77, 0.59, [0, 2.67, 0.07], [-0.03, 0, 0], 0.135));
  coat(chest, taper(0.28, 0.43, 0.51, 0.185, [0, 2.67, 0.41], [0.13, 0, 0], 0.055));
  detail(chest, 'dark', block(0.72, 0.40, 0.48, [0, 2.34, -0.015], [0, 0, 0], 0.25));
  detail(chest, 'blackGlass', block(0.092, 0.24, 0.037, [0, 2.72, 0.527], [0.11, 0, 0], 0.32));
  detail(chest, 'indicator', block(0.035, 0.146, 0.022, [0, 2.736, 0.550], [0.11, 0, 0], 0.3));
  for (const side of [-1, 1]) {
    detail(chest, 'recess', block(0.208, 0.135, 0.046, [side * 0.332, 2.69, 0.380], [0.11, side * 0.16, side * 0.07], 0.24));
    for (let fin = 0; fin < 3; fin++) {
      detail(chest, 'alloy', block(0.159, 0.012, 0.027, [side * 0.333, 2.66 + fin * 0.032, 0.411], [0.12, side * 0.16, side * 0.07], 0.15));
    }
    detail(chest, 'safety', block(0.073, 0.018, 0.028, [side * 0.32, 2.875, 0.386], [0, side * 0.12, side * 0.11]));
    detail(chest, 'alloy', screw(0.025, [side * 0.382, 2.831, 0.380]));
  }

  const waist = assembly('waist', '骨盆装甲', [0, -0.17, 0.62]);
  coat(waist, taper(0.76, 0.61, 0.31, 0.51, [0, 1.965, 0.045], [0, 0, 0], 0.06));
  detail(waist, 'dark', block(0.56, 0.38, 0.46, [0, 2.16, -0.035], [0, 0, 0], 0.19));
  for (let layer = 0; layer < 3; layer++) {
    detail(waist, 'alloy', block(0.43 - layer * 0.031, 0.038, 0.082, [0, 2.088 + layer * 0.051, 0.209]));
  }
  detail(waist, 'recess', taper(0.17, 0.31, 0.18, 0.10, [0, 1.91, 0.303], [0.06, 0, 0], 0.032));
  detail(waist, 'safety', block(0.063, 0.030, 0.026, [0, 1.92, 0.366], [0.06, 0, 0], 0.18));

  const back = assembly('back', '动力背板', [0, 0.21, -0.86]);
  coat(back, taper(0.50, 0.73, 0.65, 0.29, [0, 2.68, -0.351], [0, 0, 0], 0.083));
  detail(back, 'recess', block(0.60, 0.53, 0.32, [0, 2.69, -0.32], [0, 0, 0], 0.17));
  for (const side of [-1, 1]) {
    detail(back, 'dark', cylinder(0.09, 0.12, 0.39, [side * 0.222, 2.5, -0.508], [0.15, 0, side * 0.10], 20));
    detail(back, 'alloy', cylinder(0.108, 0.118, 0.064, [side * 0.23, 2.302, -0.53], [0.15, 0, side * 0.10], 20));
    detail(back, 'indicator', block(0.023, 0.14, 0.012, [side * 0.232, 2.67, -0.635], [0, 0, side * 0.10]));
  }

  const major = [head, chest, waist, back];
  const options = [];
  for (const side of [-1, 1]) {
    const direction = side < 0 ? 'left' : 'right';
    const prefix = side < 0 ? '左' : '右';
    const shoulder = assembly(direction + '-shoulder', prefix + '肩甲', [side * 0.75, 0.23, 0.02]);
    coat(shoulder, taper(0.49, 0.65, 0.42, 0.63, [side * 0.932, 2.834, 0.025], [0.04, side * 0.09, side * 0.17], 0.12));
    coat(shoulder, block(0.43, 0.11, 0.46, [side * 0.947, 3.058, -0.006], [0.04, side * 0.09, side * 0.17], 0.26));
    detail(shoulder, 'dark', cylinder(0.17, 0.18, 0.40, [side * 0.663, 2.766, -0.02], [0, 0, Math.PI / 2], 20));
    detail(shoulder, 'blackGlass', block(0.309, 0.066, 0.028, [side * 0.955, 2.883, 0.365], [0, side * 0.09, side * 0.17], 0.18));
    detail(shoulder, 'safety', block(0.162, 0.015, 0.018, [side * 0.958, 2.889, 0.387], [0, side * 0.09, side * 0.17]));
    for (const y of [2.762, 2.957]) {
      detail(shoulder, 'alloy', screw(0.023, [side * 0.817, y, 0.342]));
    }

    const arm = assembly(direction + '-arm', prefix + '臂部', [side * 0.99, -0.02, 0.27]);
    coat(arm, taper(0.36, 0.29, 0.47, 0.40, [side * 1.129, 2.223, 0.052], [0.08, side * 0.04, side * 0.15], 0.056));
    detail(arm, 'ceramic', block(0.30, 0.31, 0.34, [side * 0.98, 2.583, -0.035], [0, side * 0.09, side * 0.20], 0.19));
    detail(arm, 'recess', cylinder(0.13, 0.14, 0.28, [side * 1.069, 2.454, -0.023], [0, 0, Math.PI / 2], 18));
    detail(arm, 'alloy', cylinder(0.092, 0.092, 0.030, [side * 1.221, 2.454, -0.024], [0, 0, Math.PI / 2], 12));
    detail(arm, 'dark', block(0.25, 0.25, 0.26, [side * 1.18, 1.918, 0.016], [0.10, side * -0.12, side * 0.14], 0.26));
    for (let digit = 0; digit < 3; digit++) {
      detail(arm, 'alloy', block(0.053, 0.109, 0.044, [side * (1.12 + digit * 0.064), 1.884, 0.158], [0.16, 0, side * 0.12], 0.21));
    }
    detail(arm, 'dark', block(0.088, 0.224, 0.020, [side * 1.19, 2.243, 0.269], [0.08, 0, side * 0.15], 0.22));
    detail(arm, 'alloy', screw(0.021, [side * 1.119, 2.355, 0.266]));

    const thigh = assembly(direction + '-thigh', prefix + '腿上装甲', [side * 0.51, -0.09, 0.21]);
    coat(thigh, taper(0.37, 0.45, 0.54, 0.51, [side * 0.433, 1.593, 0.036], [-0.08, side * 0.07, side * 0.105], 0.089));
    detail(thigh, 'dark', cylinder(0.145, 0.151, 0.27, [side * 0.338, 1.829, -0.009], [0, 0, Math.PI / 2], 20));
    detail(thigh, 'dark', block(0.071, 0.259, 0.019, [side * 0.511, 1.609, 0.299], [-0.08, side * 0.07, side * 0.108], 0.16));
    detail(thigh, 'safety', block(0.07, 0.022, 0.027, [side * 0.414, 1.733, 0.319], [-0.08, side * 0.07, side * 0.109]));

    const shin = assembly(direction + '-shin', prefix + '小腿与足部', [side * 0.65, 0, 0.25]);
    coat(shin, taper(0.51, 0.40, 0.79, 0.59, [side * 0.548, 0.787, 0.012], [0.046, side * 0.11, side * 0.113], 0.087));
    coat(shin, block(0.54, 0.235, 0.83, [side * 0.596, 0.244, 0.178], [-0.09, side * 0.14, 0], 0.29));
    detail(shin, 'recess', block(0.55, 0.081, 0.86, [side * 0.594, 0.112, 0.177], [0, side * 0.14, 0], 0.27));
    detail(shin, 'dark', cylinder(0.143, 0.15, 0.37, [side * 0.49, 1.238, -0.035], [0, 0, Math.PI / 2], 20));
    detail(shin, 'alloy', cylinder(0.087, 0.088, 0.040, [side * 0.694, 1.236, -0.035], [0, 0, Math.PI / 2], 14));
    detail(shin, 'dark', block(0.146, 0.41, 0.028, [side * 0.536, 0.753, 0.325], [0.04, side * 0.105, side * 0.11], 0.29));
    for (let fin = 0; fin < 3; fin++) {
      detail(shin, 'alloy', block(0.101, 0.015, 0.022, [side * (0.542 - fin * 0.008), 0.66 + fin * 0.058, 0.351], [0.04, side * 0.105, side * 0.11]));
    }
    detail(shin, 'safety', block(0.093, 0.022, 0.029, [side * 0.617, 0.234, 0.6], [0.04, side * 0.14, 0], 0.16));

    major.push(shoulder, arm, thigh, shin);
    const breast = assembly(direction + '-chest-panel', prefix + '胸甲附板', [side * 0.40, 0.24, 1.03], true);
    coat(breast, taper(0.19, 0.29, 0.154, 0.095, [side * 0.354, 2.818, 0.432], [0.08, side * 0.13, side * 0.12], 0.037));
    detail(breast, 'safety', block(0.105, 0.014, 0.02, [side * 0.365, 2.846, 0.492], [0.08, side * 0.13, side * 0.12]));

    const knee = assembly(direction + '-knee-shield', prefix + '膝部护板', [side * 0.46, 0.09, 0.78], true);
    coat(knee, taper(0.24, 0.35, 0.27, 0.16, [side * 0.499, 1.186, 0.247], [0.13, side * 0.08, side * 0.105], 0.067));
    detail(knee, 'dark', block(0.126, 0.022, 0.021, [side * 0.497, 1.186, 0.352], [0, side * 0.08, side * 0.105]));
    detail(knee, 'safety', screw(0.021, [side * 0.5, 1.253, 0.339]));

    const guard = assembly(direction + '-arm-guard', prefix + '臂部护板', [side * 1.25, -0.05, 0.77], true);
    coat(guard, taper(0.19, 0.24, 0.31, 0.109, [side * 1.141, 2.233, 0.285], [0.08, side * 0.10, side * 0.13], 0.04));
    detail(guard, 'dark', block(0.093, 0.101, 0.024, [side * 1.14, 2.245, 0.365], [0, side * 0.10, side * 0.13]));
    detail(guard, 'indicator', block(0.05, 0.012, 0.016, [side * 1.141, 2.267, 0.383]));

    const pod = assembly(direction + '-booster', prefix + '推进组件', [side * 0.64, 0.37, -0.97], true);
    coat(pod, taper(0.247, 0.26, 0.81, 0.27, [side * 0.537, 3.115, -0.409], [-0.17, 0, side * 0.22], 0.058));
    detail(pod, 'dark', cylinder(0.081, 0.094, 0.41, [side * 0.588, 3.497, -0.496], [-0.18, 0, side * 0.23], 14));
    detail(pod, 'alloy', cylinder(0.080, 0.081, 0.06, [side * 0.637, 3.704, -0.541], [-0.18, 0, side * 0.23], 14));
    detail(pod, 'safety', block(0.105, 0.037, 0.016, [side * 0.518, 3.222, -0.557], [0, 0, side * 0.22]));
    options.push(breast, knee, guard, pod);
  }
  return major.concat(options);
}

function forms() {
  const shell = assembly('test-shell', '切角方体', [0, 0.22, 0.34]);
  coat(shell, block(1.28, 1.37, 1.11, [0, 0.755, 0.03], [0, 0.16, 0], 0.24));
  const orb = assembly('test-orb', '弧面球体', [-0.48, 0.25, 0], true);
  const sphere = new THREE.SphereGeometry(0.44, 32, 24);
  coat(orb, place(sphere, [-1.127, 0.512, 0.176]), 'sphere');
  const tube = assembly('test-tube', '圆柱试件', [0.48, 0.30, 0], true);
  coat(tube, cylinder(0.29, 0.393, 1.02, [1.087, 0.579, 0.17], [0, 0, 0], 32));
  return [shell, orb, tube];
}

function component(geometry, unwrap) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  const uv = g.attributes.uv?.array ?? new Float32Array(p.length / 3 * 2);
  const charts = new Map();
  if (unwrap === 'none') return { p, n, uv, charts };
  if (unwrap === 'sphere') {
    // The UV seam and duplicated pole vertices come from SphereGeometry.
    charts.set('sphere', { vertices: Array.from({ length: p.length / 3 }, (_, i) => i), uv, min: [0, 0], size: [1, 0.5] });
    return { p, n, uv, charts };
  }
  const geometricUv = new Float32Array(p.length / 3 * 2);
  for (let i = 0; i < p.length / 3; i += 3) {
    const a = i * 3;
    const u = [p[a + 3] - p[a], p[a + 4] - p[a + 1], p[a + 5] - p[a + 2]];
    const v = [p[a + 6] - p[a], p[a + 7] - p[a + 1], p[a + 8] - p[a + 2]];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const axis = normal.map(Math.abs).reduce((best, value, index, values) => value > values[best] ? index : best, 0);
    const key = axis * 2 + (normal[axis] < 0 ? 1 : 0);
    if (!charts.has(key)) charts.set(key, { vertices: [], uv: geometricUv, min: [Infinity, Infinity], max: [-Infinity, -Infinity] });
    const chart = charts.get(key);
    for (let vertex = i; vertex < i + 3; vertex++) {
      chart.vertices.push(vertex);
      const values = [p[vertex * 3 + (axis + 1) % 3], p[vertex * 3 + (axis + 2) % 3]];
      for (const channel of [0, 1]) {
        geometricUv[vertex * 2 + channel] = values[channel];
        chart.min[channel] = Math.min(chart.min[channel], values[channel]);
        chart.max[channel] = Math.max(chart.max[channel], values[channel]);
      }
    }
  }
  for (const chart of charts.values()) {
    chart.size = chart.max.map((value, axis) => Math.max(0.0001, value - chart.min[axis]));
  }
  return { p, n, uv, charts };
}

function pack(charts) {
  const gutter = 0.010;
  const ordered = [...charts].sort((a, b) => b.size[1] - a.size[1]);
  let low = 0;
  let high = 1 / Math.max(...ordered.flatMap(chart => chart.size));
  function placeCharts(scale, save) {
    let x = gutter;
    let y = gutter;
    let rowHeight = 0;
    for (const chart of ordered) {
      const w = chart.size[0] * scale;
      const h = chart.size[1] * scale;
      if (x + w + gutter > 1) {
        x = gutter;
        y += rowHeight + 2 * gutter;
        rowHeight = 0;
      }
      if (x + w + gutter > 1 || y + h + gutter > 1) return false;
      if (save) Object.assign(chart, { x, y, w, h });
      x += w + 2 * gutter;
      rowHeight = Math.max(rowHeight, h);
    }
    return true;
  }
  for (let step = 0; step < 28; step++) {
    const scale = (low + high) / 2;
    if (placeCharts(scale, false)) low = scale;
    else high = scale;
  }
  placeCharts(low, true);
}

function mergedGeometry(items, painted) {
  const components = items.map(({ geometry, unwrap }) => component(geometry, unwrap));
  if (painted) pack(components.flatMap(entry => [...entry.charts.values()]));
  const positions = [];
  const normals = [];
  const textureUvs = [];
  const sprayUvs = [];
  const indices = [];
  const vertexMap = new Map();

  for (const { p, n, uv, charts } of components) {
    const packedUv = new Float32Array(uv.length);
    for (const [key, chart] of charts) {
      for (const vertex of chart.vertices) {
        const unwrappedU = chart.uv[vertex * 2];
        const unwrappedV = chart.uv[vertex * 2 + 1];
        const u = key === 'sphere' ? unwrappedU : (unwrappedU - chart.min[0]) / chart.size[0];
        const v = key === 'sphere' ? unwrappedV : (unwrappedV - chart.min[1]) / chart.size[1];
        packedUv[vertex * 2] = chart.x + u * chart.w;
        packedUv[vertex * 2 + 1] = chart.y + v * chart.h;
      }
    }

    for (let vertex = 0; vertex < p.length / 3; vertex++) {
      const xyz = Array.from(p.subarray(vertex * 3, vertex * 3 + 3));
      const normal = Array.from(n.subarray(vertex * 3, vertex * 3 + 3));
      const surface = Array.from(uv.subarray(vertex * 2, vertex * 2 + 2));
      const spray = Array.from(packedUv.subarray(vertex * 2, vertex * 2 + 2));
      const key = [...xyz, ...normal, ...surface, ...spray].map(value => Math.round(value * 100000)).join(',');
      let index = vertexMap.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        vertexMap.set(key, index);
        positions.push(...xyz);
        normals.push(...normal);
        textureUvs.push(...surface);
        if (painted) sprayUvs.push(...spray);
      }
      indices.push(index);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uv: new Float32Array(textureUvs),
    paintUv: new Float32Array(sprayUvs),
    indices: positions.length / 3 < 65536 ? new Uint16Array(indices) : new Uint32Array(indices),
  };
}

function padded(buffer, byte = 0) {
  const count = (4 - buffer.length % 4) % 4;
  return count ? Buffer.concat([buffer, Buffer.alloc(count, byte)]) : buffer;
}

function makeGlb(name, parts) {
  const chunks = [];
  let offset = 0;
  const gltf = {
    asset: { version: '2.0', generator: 'ElloColor / original geometry' },
    scene: 0,
    scenes: [{ name, nodes: [] }],
    nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: Object.entries(palette).map(([name, [hex, metal, rough]]) => {
      const tint = new THREE.Color(hex).toArray();
      return {
        name,
        pbrMetallicRoughness: { baseColorFactor: [...tint, 1], metallicFactor: metal, roughnessFactor: rough },
        ...(name === 'indicator' ? { emissiveFactor: tint.map(channel => channel * 0.58) } : {}),
      };
    }),
  };

  function accessor(data, size, target, bounds = false) {
    const viewIndex = gltf.bufferViews.length;
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const chunk = padded(buffer);
    chunks.push(chunk);
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, target });
    offset += chunk.length;
    const count = data.length / size;
    const entry = {
      bufferView: viewIndex, count,
      type: ['SCALAR', 'VEC2', 'VEC3'][size - 1],
      componentType: data instanceof Float32Array ? 5126 : data instanceof Uint16Array ? 5123 : 5125,
    };
    if (bounds) {
      entry.min = Array(size).fill(Infinity);
      entry.max = Array(size).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        entry.min[i % size] = Math.min(entry.min[i % size], data[i]);
        entry.max[i % size] = Math.max(entry.max[i % size], data[i]);
      }
    }
    return gltf.accessors.push(entry) - 1;
  }

  function primitive(items, material, painted = false) {
    const geo = mergedGeometry(items, painted);
    const attributes = {
      POSITION: accessor(geo.positions, 3, 34962, true),
      NORMAL: accessor(geo.normals, 3, 34962),
      TEXCOORD_0: accessor(geo.uv, 2, 34962),
    };
    if (painted) attributes.TEXCOORD_1 = accessor(geo.paintUv, 2, 34962);
    return { attributes, indices: accessor(geo.indices, 1, 34963), material: Object.keys(palette).indexOf(material) };
  }

  for (const part of parts) {
    const root = { name: 'assembly-' + part.id, extras: { partId: part.id }, children: [] };
    gltf.scenes[0].nodes.push(gltf.nodes.push(root) - 1);
    const paintMesh = gltf.meshes.push({ name: part.mesh, primitives: [primitive(part.paint, 'enamel', true)] }) - 1;
    root.children.push(gltf.nodes.push({ name: part.mesh, mesh: paintMesh, extras: { partId: part.id, paintable: true } }) - 1);
    for (const [material, items] of Object.entries(part.details)) {
      const name = 'detail-' + part.id + '-' + material;
      const mesh = gltf.meshes.push({ name, primitives: [primitive(items, material)] }) - 1;
      root.children.push(gltf.nodes.push({ name, mesh, extras: { partId: part.id, paintable: false } }) - 1);
    }
  }

  gltf.buffers.push({ byteLength: offset });
  const json = padded(Buffer.from(JSON.stringify(gltf)), 32);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + offset, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(offset, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binaryHeader, ...chunks]);
}

const specs = [
  { id: 'atlas', name: 'ATLAS–07', zh: 'ATLAS–07 工程机甲', en: 'ATLAS–07 Utility Mech', center: [0, 1.86, 0], height: 3.76, build: atlas },
  { id: 'forms', name: 'FORM–01', zh: 'FORM–01 几何实验体', en: 'FORM–01 Geometry Study', center: [0, 0.75, 0], height: 1.44, build: forms },
];
await mkdir(modelDirectory, { recursive: true });
const models = [];
for (const { id, name, zh, en, center, height, build } of specs) {
  const parts = build();
  const glb = makeGlb(name, parts);
  await writeFile(new URL(id + '.glb', modelDirectory), glb);
  models.push({
    id, name, zh, en, file: `./assets/demo/${id}.js`, thumb: `./assets/demo/${id}.jpg`, partCount: parts.length,
    front: [0, 0, 1], anchor: [0, 0, 0], center, height,
    parts: parts.map(({ id, name, mesh, explode, optional }, i) => ({ id, name, mesh, explode, optional, number: i + 1 })),
  });
  console.log(id, parts.length, 'paintable parts,', Math.round(glb.length / 1024), 'KiB');
}
await writeFile(new URL('catalog.json', modelDirectory), JSON.stringify(models, null, 2) + '\n');
