import * as THREE from 'three';

export function planExplosion(model, yaw, elevation, floor) {
  const toward = new THREE.Vector3(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = toward.clone().cross(right);
  const span = axis => new THREE.Vector3(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z));
  const [wide, high, deep] = [right, up, toward].map(span);
  const cards = model.parts.map(part => {
    const center = part.restBounds.getCenter(new THREE.Vector3());
    const size = part.restBounds.getSize(new THREE.Vector3());
    return { part, center, width: size.dot(wide), height: size.dot(high), depth: size.dot(deep) };
  }).sort((a, b) => b.center.dot(up) - a.center.dot(up));
  const depth = Math.max(...cards.map(card => card.depth));
  const gap = .24 + depth * .32;
  const rows = [];
  let remaining = Math.min(3, Math.ceil(cards.length / 2));
  while (remaining) {
    const items = cards.splice(0, Math.ceil(cards.length / remaining)).sort((a, b) => a.center.dot(right) - b.center.dot(right));
    rows.push({ items, height: Math.max(...items.map(card => card.height)),
      width: items.reduce((sum, card) => sum + card.width, gap * (items.length - 1)) });
    remaining--;
  }
  const width = Math.max(...rows.map(row => row.width));
  const height = rows.reduce((sum, row) => sum + row.height, gap * (rows.length - 1));
  const center = new THREE.Vector3().fromArray(model.definition.center);
  const offsets = new Map();
  let y = height / 2, lift = 0;
  for (const row of rows) {
    let x = -row.width / 2;
    for (const card of row.items) {
      const shift = center.clone().addScaledVector(right, x + card.width / 2).addScaledVector(up, y - row.height / 2).sub(card.center);
      offsets.set(card.part.id, shift);
      lift = Math.max(lift, floor - (card.part.restBottom + model.position.y + shift.y));
      x += card.width + gap;
    }
    y -= row.height + gap;
  }
  for (const part of model.parts) offsets.get(part.id).y += lift;
  center.y += lift;
  center.add(model.position);
  return { offsets, center, width, height, depth };
}
