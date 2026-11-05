import * as THREE from 'three';
import { UVUnwrapper } from '../vendor/xatlas/unwrapper.js';
import { resourceURL } from './resources.js';

const limit = '白模限 24 个网格、12 万个三角面。单个网格限 6 万个面和 6 万个顶点。';
const format = '请导出单文件 GLB，去掉纹理、动画、蒙皮、压缩扩展和透明材质。';
const white = '只接受白色或浅灰色材质。请去掉顶点颜色。';
const unusable = '模型没有可用的三维表面。';
let unwrapper;

function readGlb(buffer) {
  try {
    const data = new DataView(buffer);
    const size = data.getUint32(12, true);
    if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2 ||
        data.getUint32(8, true) !== buffer.byteLength || data.getUint32(16, true) !== 0x4e4f534a) throw new Error();
    return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size)));
  } catch {
    throw new Error('文件不是有效的 glTF 2.0 GLB。');
  }
}

export function checkWhiteModel(buffer) {
  const json = readGlb(buffer);
  if (json.asset?.version !== '2.0') throw new Error('文件不是有效的 glTF 2.0 GLB。');
  if (json.images?.length || json.textures?.length || json.animations?.length || json.skins?.length ||
      json.buffers?.some(item => item.uri) || json.extensionsUsed?.length) throw new Error(format);
  for (const material of json.materials ?? []) {
    const [r, g, b, a = 1] = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    if ((material.alphaMode && material.alphaMode !== 'OPAQUE') || a !== 1 || material.emissiveFactor?.some(Boolean)) throw new Error(format);
    if (Math.min(r, g, b) < .55 || Math.max(r, g, b) - Math.min(r, g, b) > .045) throw new Error(white);
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.targets?.length || primitive.extensions) throw new Error(format);
      if (primitive.attributes.COLOR_0 !== undefined) throw new Error(white);
    }
  }
}

export async function loadWhiteModel(buffer, format, loader) {
  if (format === 'fbx') {
    const { FBXLoader } = await import('../vendor/addons/loaders/FBXLoader.js');
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(() => { throw new Error('请去掉白模的外部贴图。'); });
    const source = new FBXLoader(manager).parse(buffer, '');
    if (source.animations?.length) throw new Error('白模必须是没有动画和蒙皮的静态网格。');
    source.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh || mesh.morphTargetInfluences) throw new Error('白模必须是没有动画和蒙皮的静态网格。');
      if (mesh.geometry.hasAttribute('color')) throw new Error(white);
      for (const material of [mesh.material].flat()) {
        if (material.transparent || material.opacity !== 1 || Object.values(material).some(value => value?.isTexture)) {
          throw new Error('请去掉白模的外部贴图。');
        }
        const { r, g, b } = material.color ?? { r: 1, g: 1, b: 1 };
        if (Math.min(r, g, b) < .55 || Math.max(r, g, b) - Math.min(r, g, b) > .045) throw new Error(white);
      }
    });
    return source;
  }
  if (format === 'stl') {
    const { STLLoader } = await import('../vendor/addons/loaders/STLLoader.js');
    const { mergeVertices } = await import('../vendor/addons/utils/BufferGeometryUtils.js');
    const geometry = new STLLoader().parse(buffer);
    if (geometry.hasAttribute('color')) throw new Error(white);
    const mesh = new THREE.Mesh(mergeVertices(geometry));
    mesh.name = '模型主体';
    return new THREE.Group().add(mesh);
  }
  checkWhiteModel(buffer);
  return (await loader.parseAsync(buffer, '')).scene;
}

async function atlasTool() {
  if (!unwrapper) {
    const tool = new UVUnwrapper({ BufferAttribute: THREE.BufferAttribute }, { resolution: 512, padding: 3 }, {}, true);
    const path = file => resourceURL('./vendor/xatlas/' + file);
    unwrapper = tool.loadLibrary(() => {}, path('xatlas.wasm'), path('xatlas.js')).then(() => tool);
  }
  return unwrapper;
}

function copyXYZ(attribute) {
  const output = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    output[i * 3] = attribute.getX(i);
    output[i * 3 + 1] = attribute.getY(i);
    output[i * 3 + 2] = attribute.getZ(i);
  }
  return new THREE.BufferAttribute(output, 3);
}

export async function prepareWhiteModel(source, definition) {
  const meshes = [];
  source.updateMatrixWorld(true);
  let triangles = 0;
  source.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, position = geometry.getAttribute('position');
    const count = (geometry.index?.count ?? position?.count) / 3;
    if (!Number.isInteger(count) || count < 1) throw new Error(unusable);
    triangles += count;
    if (count > 60000 || triangles > 120000 || position.count > 60000 || meshes.length >= 24) throw new Error(limit);
    meshes.push(mesh);
  });
  if (!meshes.length) throw new Error(limit);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.z, size.y * .82);
  if (!Number.isFinite(extent) || extent < .000001) throw new Error(unusable);
  const center = bounds.getCenter(new THREE.Vector3());
  center.y = bounds.min.y;
  const scale = 2.55 / extent;
  const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  normalize.elements[13] += .032;

  const tool = await atlasTool();
  const scene = new THREE.Group();
  const parts = [];
  for (const [i, mesh] of meshes.entries()) {
    const input = mesh.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', copyXYZ(input.getAttribute('position')));
    if (input.hasAttribute('normal')) geometry.setAttribute('normal', copyXYZ(input.getAttribute('normal')));
    const count = input.index?.count ?? geometry.attributes.position.count;
    const indices = new Uint16Array(count);
    for (let n = 0; n < count; n++) indices[n] = input.index ? input.index.getX(n) : n;
    if (mesh.matrixWorld.determinant() < 0) {
      for (let n = 0; n < count; n += 3) [indices[n + 1], indices[n + 2]] = [indices[n + 2], indices[n + 1]];
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
    if (!geometry.attributes.position.array.every(Number.isFinite)) throw new Error(unusable);

    const atlas = await tool.unwrapGeometry(geometry, 'uv2', 'uv');
    if (atlas.atlasCount !== 1 || !geometry.getAttribute('uv2')) throw new Error('无法展开喷涂 UV。请清理模型网格后重试。');
    geometry.setAttribute('uv1', geometry.getAttribute('uv2'));
    geometry.setAttribute('uv', geometry.getAttribute('uv2'));
    geometry.deleteAttribute('uv2');
    const id = 'mesh-' + (i + 1);
    const object = new THREE.Mesh(geometry);
    object.name = 'paint-' + id;
    const group = new THREE.Group();
    group.add(object);
    scene.add(group);
    const offset = geometry.computeBoundingBox() ?? geometry.boundingBox;
    const position = offset.getCenter(new THREE.Vector3());
    position.y -= size.y * scale * .46;
    if (position.lengthSq() < .015) position.y += .25;
    position.normalize().multiplyScalar(.56);
    const wheel = /wheel/i.test(mesh.name);
    parts.push({
      id, mesh: object.name, name: definition.imported && mesh.name ? mesh.name
        : definition.category === 'vehicle' ? wheel ? '车轮' : '车身' : '网格',
      number: i + 1, explode: position.toArray(), optional: wheel
    });
  }
  return { scene, parts, height: size.y * scale + .032, center: [0, size.y * scale * .5, 0], anchor: [0, 0, 0] };
}

export function packWhiteModel({ scene, ...metadata }) {
  const meshes = scene.children.map(group => {
    const { attributes, index } = group.children[0].geometry;
    return { position: attributes.position.array, normal: attributes.normal.array, uv: attributes.uv1.array, index: index.array };
  });
  return { ...metadata, meshes };
}

export function unpackWhiteModel({ meshes, ...metadata }) {
  const scene = new THREE.Group();
  for (const [i, mesh] of meshes.entries()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
    const uv = new THREE.BufferAttribute(mesh.uv, 2);
    geometry.setAttribute('uv', uv);
    geometry.setAttribute('uv1', uv);
    geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    const object = new THREE.Mesh(geometry);
    object.name = metadata.parts[i].mesh;
    scene.add(new THREE.Group().add(object));
  }
  return { ...metadata, scene };
}
