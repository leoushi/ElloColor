import * as THREE from 'three';

export const workSurfaceY = .032;
const matWidth = 11.6;
const matDepth = 7.8;

function randomStream() {
  let seed = 681;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function surfaceTexture(renderer, width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height, randomStream());
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function drawWood(ctx, w, h, random) {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  for (const [position, color] of [[0, '#76503a'], [.27, '#67432f'], [.5, '#80593f'], [.76, '#694633'], [1, '#76523c']]) {
    base.addColorStop(position, color);
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 880; i++) {
    const y = random() * h;
    const phase = random() * Math.PI * 2;
    const amplitude = 1.4 + random() * 7;
    const start = -35 + random() * w * .65;
    const end = start + 110 + random() * w;
    ctx.strokeStyle = random() > .5 ? 'rgba(41,24,16,.16)' : 'rgba(211,158,108,.11)';
    ctx.lineWidth = .35 + random() * 1.65;
    ctx.beginPath();
    for (let x = start; x <= end; x += 22) {
      const curve = y + Math.sin(x * .009 + phase) * amplitude + Math.sin(x * .029 + y * .04) * 1.2;
      if (x === start) ctx.moveTo(x, curve);
      else ctx.lineTo(x, curve);
    }
    ctx.stroke();
  }
  for (const y of [h * .34, h * .69]) {
    ctx.fillStyle = '#3e2a20';
    ctx.fillRect(0, y, w, 1.4);
    ctx.fillStyle = 'rgba(211,158,108,.28)';
    ctx.fillRect(0, y + 2, w, 1);
  }
}

function drawMat(ctx, w, h, random) {
  ctx.fillStyle = '#4d4d4d';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8700; i++) {
    ctx.fillStyle = random() > .5 ? 'rgba(201,201,201,.08)' : 'rgba(20,20,20,.10)';
    ctx.fillRect(random() * w, random() * h, 1 + random() * 4, 1 + random() * 2);
  }
  const inset = 45;
  const cols = 58;
  const rows = 38;
  const xStep = (w - 2 * inset) / cols;
  const yStep = (h - 2 * inset) / rows;
  ctx.strokeStyle = '#a6a6a6';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  function ruling(count, step, vertical) {
    for (let i = 1; i < count; i++) {
      const p = inset + step * i;
      ctx.strokeStyle = i % 5 ? 'rgba(180,180,180,.40)' : 'rgba(201,201,201,.64)';
      ctx.lineWidth = i % 5 ? 1.1 : 2;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(p, inset);
        ctx.lineTo(p, h - inset);
      } else {
        ctx.moveTo(inset, p);
        ctx.lineTo(w - inset, p);
      }
      ctx.stroke();
    }
  }
  ruling(cols, xStep, true);
  ruling(rows, yStep, false);

  ctx.strokeStyle = 'rgba(201,201,201,.53)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const [x, y, endX, endY] of [
    [inset, h - inset - yStep * 12, inset + xStep * 12, h - inset],
    [w - inset - xStep * 21, h - inset, w - inset, h - inset - yStep * 12],
    [w - inset - xStep * 14, h - inset, w - inset, h - inset - yStep * 14]
  ]) {
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
  }
  ctx.stroke();

  ctx.fillStyle = '#bfbfbf';
  ctx.font = '600 17px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= cols; i += 5) {
    const x = inset + i * xStep;
    ctx.fillText(String(i), x, inset - 10);
    ctx.fillText(String(i), x, h - inset + 23);
  }
  for (let i = 0; i <= rows; i += 5) {
    const y = inset + i * yStep + 5;
    ctx.fillText(String(i), inset - 18, y);
    ctx.fillText(String(i), w - inset + 18, y);
  }
  ctx.textAlign = 'right';
  ctx.fillText('580 × 390 mm', w - inset, h - 9);

  ctx.strokeStyle = 'rgba(216,216,216,.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 170; i++) {
    const x = inset + random() * (w - 2 * inset), y = inset + random() * (h - 2 * inset);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + random() * 25, y + (random() - .5) * 19);
  }
  ctx.stroke();
}

function finish(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function block(parent, material, size, position, cast = true) {
  const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(...size), material), cast);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function runner(material, position, rotation, details) {
  const frame = new THREE.Group();
  frame.position.set(position[0], workSurfaceY + .038, position[1]);
  frame.rotation.y = rotation;
  const rails = [
    [-1.22, -.84, 1.22, -.84], [-1.22, .84, 1.22, .84],
    [-1.22, -.84, -1.22, .84], [1.22, -.84, 1.22, .84],
    [0, -.84, 0, .84], [-1.22, 0, 1.22, 0]
  ];
  for (const x of [-.86, -.48, .46, .84]) {
    rails.push([x, -.84, x, -.39], [x, .84, x, .4]);
  }
  const tubes = finish(new THREE.InstancedMesh(new THREE.CylinderGeometry(.027, .027, 1, 8), material, rails.length));
  const transform = new THREE.Object3D();
  const axis = new THREE.Vector3(0, 1, 0);
  rails.forEach(([x1, z1, x2, z2], i) => {
    const vector = new THREE.Vector3(x2 - x1, 0, z2 - z1);
    transform.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    transform.scale.set(1, vector.length(), 1);
    transform.quaternion.setFromUnitVectors(axis, vector.normalize());
    transform.updateMatrix();
    tubes.setMatrixAt(i, transform.matrix);
  });
  frame.add(tubes);
  block(frame, material, [.29, .055, .16], [-1.08, 0, -.84]);
  block(frame, material, [.29, .055, .16], [1.08, 0, .84]);
  for (const [color, x, z, w, d] of details) {
    const piece = block(frame, color, [w, .061, d], [x, -.002, z]);
    piece.rotation.y = -.12;
  }
  return frame;
}

export function makeWorkbench(renderer) {
  const bench = new THREE.Group();
  const tabletop = new THREE.Group();
  bench.add(tabletop);
  const wood = surfaceTexture(renderer, 1024, 640, drawWood);
  const mat = surfaceTexture(renderer, 1536, 1024, drawMat);
  const woodMaterial = new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: .012, roughness: .62 });
  const matTop = new THREE.MeshStandardMaterial({ map: mat, roughness: .91, envMapIntensity: .4 });
  const matEdge = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: .94 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x3d403f, roughness: .78 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xc6c1a6, roughness: .74 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa13526, roughness: .65 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x325574, roughness: .62 });
  const tray = new THREE.MeshStandardMaterial({ color: 0x292b29, roughness: .75 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xa99b78, roughness: .93 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9395, roughness: .36, metalness: .76 });

  block(tabletop, woodMaterial, [23, .40, 16], [0, -.221, 1], false);
  block(tabletop, [matEdge, matEdge, matTop, matEdge, matEdge, matEdge],
    [matWidth, .052, matDepth], [0, workSurfaceY - .026, .23], false);
  tabletop.add(
    runner(graphite, [-3.1, .71], -.16, [
      [red, -.85, .38, .20, .25], [red, -.47, .39, .21, .14], [red, .84, .38, .14, .15],
      [blue, .46, -.39, .17, .26], [graphite, .2, .32, .22, .38]
    ]),
    runner(cream, [2.59, -1.37], .23, [[cream, -.85, -.39, .37, .3], [cream, .46, .43, .24, .28]])
  );

  const bin = new THREE.Group();
  bin.position.set(-3.1, workSurfaceY, -2.34);
  bin.rotation.y = -.1;
  block(bin, tray, [1.45, .07, .86], [0, .04, 0]);
  for (const x of [-.69, .69]) block(bin, tray, [.072, .2, .86], [x, .15, 0]);
  for (const z of [-.40, .40]) block(bin, tray, [1.45, .2, .07], [0, .15, z]);
  block(bin, cream, [.37, .095, .15], [-.32, .116, .14]).rotation.y = .28;
  block(bin, graphite, [.16, .08, .25], [.27, .11, -.12]).rotation.y = -.37;
  tabletop.add(bin);

  const cutter = new THREE.Group();
  cutter.position.set(3.52, workSurfaceY + .06, 1.42);
  cutter.rotation.y = -.72;
  const handle = new THREE.MeshStandardMaterial({ color: 0x275651, roughness: .65 });
  for (const sign of [-1, 1]) {
    const arm = block(cutter, handle, [.145, .12, .71], [sign * .17, 0, .28]);
    arm.rotation.y = sign * .31;
    const jaw = block(cutter, steel, [.094, .089, .37], [sign * .071, -.012, -.22]);
    jaw.rotation.y = sign * -.26;
  }
  const pin = finish(new THREE.Mesh(new THREE.CylinderGeometry(.083, .083, .08, 12), steel));
  pin.position.y = .045;
  cutter.add(pin);
  tabletop.add(cutter);

  const tape = finish(new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .135, 32, 1, true), paper));
  tape.material.side = THREE.DoubleSide;
  tape.position.set(3.51, workSurfaceY + .07, 2.34);
  const tapeTop = finish(new THREE.Mesh(new THREE.RingGeometry(.254, .361, 36), paper));
  tapeTop.rotation.x = -Math.PI / 2;
  tapeTop.position.y = .068;
  tape.add(tapeTop);
  const tapeCore = finish(new THREE.Mesh(new THREE.CylinderGeometry(.254, .254, .133, 32, 1, true), paper));
  tape.add(tapeCore);
  tabletop.add(tape);

  const wall = new THREE.MeshStandardMaterial({ color: 0x37322b, roughness: .98, envMapIntensity: .45 });
  const divider = new THREE.MeshStandardMaterial({ color: 0x282723, roughness: .93 });
  const wallPanel = finish(new THREE.Mesh(new THREE.PlaneGeometry(33, 13), wall), false);
  wallPanel.position.set(0, 5.8, -10.1);
  bench.add(wallPanel);
  const addWallTrim = (width, height, x, y) => {
    const trim = finish(new THREE.Mesh(new THREE.PlaneGeometry(width, height), divider), false);
    trim.position.set(x, y, -9.94);
    bench.add(trim);
  };
  addWallTrim(22, .31, 0, .19);
  for (const x of [-6.3, 4.7]) addWallTrim(.13, 11, x, 5.7);
  return { bench, tabletop };
}
