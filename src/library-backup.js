import { appendLibrary, snapshotLibrary } from './model-store.js';
import { readLocalPayload, readStudioModel } from './resources.js';

const format = 'ellocolor-library';
const version = 1;
const maxBytes = 256 * 1024 * 1024;
const maxManifest = 16 * 1024 * 1024;
const bufferTypes = new Map([ArrayBuffer, Uint8Array, Uint16Array, Uint32Array, Float32Array]
  .map(type => [type.name, type]));
const invalid = '无法读取这份 ElloColor 模型库备份。';
const tooLarge = '模型库备份超过 256 MB 的数据上限。';
const unsupported = '这份备份需要较新版本的 ElloColor。';

export class LibraryBackupError extends Error {}

function check(valid, message = invalid) {
  if (!valid) throw new LibraryBackupError(message);
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
const vec3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const thumbnail = value => typeof value === 'string' && value.length <= 2 * 1024 * 1024 && /^data:image\/(png|jpeg|webp);base64,/.test(value);

function bytes(value) {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function pack(entries) {
  const blocks = [];
  let length = 0;
  const manifest = new TextEncoder().encode(JSON.stringify({ format, version, entries }, (key, value) => {
    if (!(value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return value;
    const type = value.constructor.name;
    check(bufferTypes.has(type));
    const descriptor = [type, length, value.byteLength];
    length += value.byteLength;
    check(length <= maxBytes, tooLarge);
    blocks.push(bytes(value));
    return { $binary: descriptor };
  }));
  check(manifest.length <= maxManifest && length + manifest.length + 4 <= maxBytes, tooLarge);
  const header = new DataView(new ArrayBuffer(4));
  header.setUint32(0, manifest.length, true);
  const stream = new Blob([header.buffer, manifest, ...blocks]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();
}

async function unpack(file) {
  check(file.size > 0 && file.size <= maxBytes + 1024 * 1024, file.size ? tooLarge : invalid);
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const blocks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new LibraryBackupError(tooLarge);
      }
      blocks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  check(length > 4);
  const archive = await new Blob(blocks).arrayBuffer();
  const manifestLength = new DataView(archive).getUint32(0, true);
  const binaryStart = 4 + manifestLength;
  check(manifestLength <= maxManifest && binaryStart <= length);
  let nextOffset = 0;
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(archive, 4, manifestLength)), (key, value) => {
    if (!object(value) || !Object.hasOwn(value, '$binary')) return value;
    check(Array.isArray(value.$binary) && value.$binary.length === 3);
    const [type, offset, size] = value.$binary;
    const ArrayType = bufferTypes.get(type);
    check(ArrayType && offset === nextOffset && Number.isSafeInteger(size) && size >= 0 && size % (ArrayType.BYTES_PER_ELEMENT || 1) === 0);
    nextOffset += size;
    check(binaryStart + nextOffset <= length);
    const block = archive.slice(binaryStart + offset, binaryStart + nextOffset);
    return ArrayType === ArrayBuffer ? block : new ArrayType(block);
  });
  check(data?.format === format);
  check(data.version === version, unsupported);
  check(Array.isArray(data.entries) && data.entries.length > 0 && binaryStart + nextOffset === length);
  return data.entries;
}

function checkParts(metadata, partCount) {
  check(Array.isArray(metadata.parts) && metadata.parts.length === partCount);
  check(vec3(metadata.anchor) && vec3(metadata.center) && Number.isFinite(metadata.height) && metadata.height > 0);
  const parts = new Set();
  for (const part of metadata.parts) {
    check(object(part) && id(part.id) && !parts.has(part.id) && text(part.mesh) && text(part.name) && vec3(part.explode));
    parts.add(part.id);
  }
  return parts;
}

function checkGLB(glb) {
  check(glb instanceof ArrayBuffer && glb.byteLength >= 28);
  const header = new DataView(glb);
  const jsonLength = header.getUint32(12, true);
  check(header.getUint32(0, true) === 0x46546c67 && header.getUint32(4, true) === 2 && header.getUint32(8, true) === glb.byteLength);
  check(header.getUint32(16, true) === 0x4e4f534a && jsonLength <= maxManifest && 20 + jsonLength < glb.byteLength);
  const asset = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
  // Archived catalogue assets use only the embedded GLB buffer. Never load URLs from a backup.
  check(asset?.asset?.version === '2.0' && asset.buffers?.length === 1 && !Object.hasOwn(asset.buffers[0], 'uri') && !asset.images?.length && !asset.extensionsUsed?.length);
}

function checkMeshes(geometry, partCount) {
  check(Array.isArray(geometry.meshes) && geometry.meshes.length === partCount);
  let triangles = 0;
  for (const mesh of geometry.meshes) {
    check(object(mesh) && mesh.position instanceof Float32Array && mesh.normal instanceof Float32Array && mesh.uv instanceof Float32Array);
    const vertices = mesh.position.length / 3;
    check(Number.isInteger(vertices) && vertices >= 3 && vertices <= 180000 && mesh.normal.length === 3 * vertices && mesh.uv.length === 2 * vertices);
    check(mesh.index instanceof Uint32Array || mesh.index instanceof Uint16Array);
    const faces = mesh.index.length / 3;
    triangles += faces;
    check(Number.isInteger(faces) && faces >= 1 && faces <= 60000 && triangles <= 120000 && mesh.index.every(index => index < vertices));
    check(mesh.position.every(Number.isFinite) && mesh.normal.every(Number.isFinite) && mesh.uv.every(Number.isFinite));
  }
}

function checkLayer(layer) {
  check(layer == null || (object(layer) && [1, 256, 512].includes(layer.size) && layer.bytes instanceof Uint8Array && layer.bytes.length === 4 * layer.size ** 2));
}

function checkEntry(entry) {
  check(object(entry) && object(entry.definition) && object(entry.geometry) && Array.isArray(entry.coats));
  const { definition, geometry, coats, preview } = entry;
  const { partCount } = definition;
  check(id(definition.id) && text(definition.name) && text(definition.zh) && text(definition.en));
  check(Number.isInteger(partCount) && partCount > 0 && partCount <= 24);
  check(definition.thumb == null || thumbnail(definition.thumb));
  check(definition.front == null || vec3(definition.front));
  check(definition.mergeSource == null || id(definition.mergeSource));
  check(definition.mergeVersion == null || (Number.isSafeInteger(definition.mergeVersion) && definition.mergeVersion > 0 && definition.mergeVersion < 1000000));
  check(!Object.hasOwn(definition, 'file'));
  check(definition.white === undefined || typeof definition.white === 'boolean');
  check(definition.storedGLB === undefined || typeof definition.storedGLB === 'boolean');
  const packed = definition.white === true;
  check(packed !== (definition.storedGLB === true));
  const parts = checkParts(packed ? geometry : definition, partCount);
  if (packed) checkMeshes(geometry, partCount);
  else checkGLB(geometry.glb);
  const savedParts = new Set();
  for (const saved of coats) {
    check(object(saved) && parts.has(saved.partId) && !savedParts.has(saved.partId) && object(saved.coat));
    savedParts.add(saved.partId);
    const coat = saved.coat;
    check(id(coat.substrate) && (coat.ink == null || (typeof coat.ink === 'string' && /^#[0-9a-f]{6}$/i.test(coat.ink))));
    check((coat.opacity == null || (Number.isFinite(coat.opacity) && coat.opacity >= 0 && coat.opacity <= 1)) && Number.isFinite(coat.coverage));
    check(typeof coat.filled === 'boolean');
    coat.opacity ??= 1;
    checkLayer(coat.current);
    checkLayer(coat.history);
  }
  check(preview == null || (object(preview) && Array.isArray(preview.painted) && preview.painted.length <= partCount &&
    preview.painted.every(part => parts.has(part)) && (preview.thumb == null || thumbnail(preview.thumb))));
}

async function builtInEntries(catalog) {
  const entries = [];
  if (!catalog.length) return entries;
  const thumbs = await readLocalPayload('./web/library-thumbnails.js', 'ellocolorThumbnails');
  for (const { file, ...definition } of catalog) {
    const glb = await readStudioModel(file);
    entries.push({ definition: { ...definition, thumb: thumbs[definition.id], storedGLB: true }, geometry: { glb }, template: true });
  }
  return entries;
}

function libraryEntries(records, builtIns) {
  const geometry = new Map(records.geometry.map(entry => [entry.id, entry.geometry]));
  const previews = new Map(records.previews.map(entry => [entry.id, entry]));
  const coats = new Map();
  for (const { modelId, partId, coat } of records.coats) {
    if (!coats.has(modelId)) coats.set(modelId, []);
    coats.get(modelId).push({ partId, coat });
  }
  return [...builtIns, ...records.models.map(definition => ({ definition, geometry: geometry.get(definition.id) }))]
    .map(entry => {
      const modelId = entry.definition.id;
      const saved = previews.get(modelId);
      const preview = saved?.thumb || saved?.painted?.length ? { painted: [...saved.painted].sort(), thumb: saved.thumb ?? null } : null;
      return { ...entry, preview, coats: (coats.get(modelId) ?? []).sort((a, b) => a.partId.localeCompare(b.partId)) };
    });
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || a.constructor !== b.constructor) return false;
  if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) {
    if (a.byteLength !== b.byteLength) return false;
    const x = bytes(a), y = bytes(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

const lineage = definition => definition.mergeSource ?? definition.id;
const modelContent = ({ id, mergeSource, mergeVersion, ...definition }) => definition;

function mergePlan(records, builtIns, incoming, reserved) {
  const additions = [];
  const families = new Map();
  const used = new Set(reserved);
  let copies = 0, skipped = 0;
  const remember = entry => {
    const key = lineage(entry.definition);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(entry);
    used.add(entry.definition.id);
  };
  libraryEntries(records, builtIns).forEach(remember);
  for (const entry of incoming) {
    const source = lineage(entry.definition);
    const variants = families.get(source) ?? [];
    const blankTemplate = entry.template === true && entry.coats.length === 0 && !entry.preview;
    const same = variants.some(other => equal(modelContent(entry.definition), modelContent(other.definition)) && equal(entry.geometry, other.geometry) &&
      (blankTemplate || (equal(entry.coats, other.coats) && equal(entry.preview, other.preview))));
    if (same) { skipped++; continue; }
    const definition = { ...entry.definition };
    if (used.has(definition.id) || variants.length) {
      do {
        definition.id = 'local-' + [...crypto.getRandomValues(new Uint32Array(4))].map(word => word.toString(16)).join('-');
      } while (used.has(definition.id));
      definition.mergeSource = source;
      definition.mergeVersion = 1 + Math.max(0, ...variants.map(other => other.definition.mergeVersion ?? 0));
      copies++;
    }
    const addition = { ...entry, definition };
    additions.push(addition);
    remember(addition);
  }
  return { additions, copies, skipped };
}

export async function exportLibrary(catalog) {
  const [records, builtIns] = await Promise.all([snapshotLibrary(), builtInEntries(catalog)]);
  const entries = libraryEntries(records, builtIns);
  entries.forEach(checkEntry);
  return { file: await pack(entries), count: entries.length };
}

export async function importLibrary(file, catalog) {
  let entries;
  try {
    entries = await unpack(file);
    entries.forEach(checkEntry);
  } catch (error) {
    if (error instanceof LibraryBackupError) throw error;
    throw new LibraryBackupError(invalid);
  }
  const sources = new Set(entries.map(entry => lineage(entry.definition)));
  const builtIns = await builtInEntries(catalog.filter(item => sources.has(item.id)));
  return appendLibrary(records => mergePlan(records, builtIns, entries, catalog.map(item => item.id)));
}
