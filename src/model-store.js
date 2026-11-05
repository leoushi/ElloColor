let opening, connection;
let channel;

function updates() {
  if (channel === undefined) {
    try { channel = new BroadcastChannel('ellocolor-model-library'); }
    catch { channel = null; }
  }
  return channel;
}

export function watchLibrary(callback) {
  updates()?.addEventListener('message', callback);
}

function database() {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('ellocolor-model-library', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['models', 'geometry', 'imports', 'previews']) db.createObjectStore(name, { keyPath: 'id' });
      const coats = db.createObjectStore('coats', { keyPath: ['modelId', 'partId'] });
      coats.createIndex('model', 'modelId');
    };
    request.onsuccess = () => {
      connection = request.result;
      resolve(connection);
    };
    request.onerror = () => reject(request.error);
  });
}

function transaction(names, mode, action) {
  if (!connection) return database().then(() => transaction(names, mode, action));
  return new Promise((resolve, reject) => {
    const tx = connection.transaction(names, mode);
    let result;
    tx.oncomplete = () => resolve(result?.result);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
    try {
      result = action(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

const read = (name, method, key) => transaction(name, 'readonly', tx => tx.objectStore(name)[method](key));
export const localModels = () => read('models', 'getAll');
export const savedPreviews = () => read('previews', 'getAll');
export const readGeometry = id => read('geometry', 'get', id);
export const readImport = id => read('imports', 'get', id);
export const queueImport = (id, file) => transaction('imports', 'readwrite', tx => tx.objectStore('imports').put({ id, file }));
export const discardImport = id => transaction('imports', 'readwrite', tx => tx.objectStore('imports').delete(id));

const backupStores = ['models', 'geometry', 'coats', 'previews'];

function collectRecords(tx, receive) {
  const records = {};
  let remaining = backupStores.length;
  for (const name of backupStores) {
    const request = tx.objectStore(name).getAll();
    request.onsuccess = () => {
      records[name] = request.result;
      if (--remaining === 0) receive(records);
    };
  }
}

export async function snapshotLibrary() {
  let records;
  await transaction(backupStores, 'readonly', tx => collectRecords(tx, data => { records = data; }));
  return records;
}

export async function appendLibrary(plan) {
  let result, failure;
  await transaction(backupStores, 'readwrite', tx => collectRecords(tx, records => {
    try {
      result = plan(records);
      for (const entry of result.additions) {
        const { id } = entry.definition;
        tx.objectStore('models').add(entry.definition);
        tx.objectStore('geometry').add({ id, geometry: entry.geometry });
        for (const { partId, coat } of entry.coats) tx.objectStore('coats').add({ modelId: id, partId, coat });
        if (entry.preview) tx.objectStore('previews').add({ id, generation: 0, ...entry.preview });
      }
    } catch (error) {
      failure = error;
      tx.abort();
    }
  })).catch(error => { throw failure ?? error; });
  if (result.additions.length) updates()?.postMessage('models');
  return { added: result.additions.length, copies: result.copies, skipped: result.skipped };
}

export function importFormat(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ['glb', 'fbx', 'stl'].includes(extension) && file.size > 0 && file.size <= 24 * 1024 * 1024 ? extension : null;
}

export async function saveImport(definition, geometry, pendingId) {
  await transaction(['models', 'geometry', 'imports'], 'readwrite', tx => {
    tx.objectStore('models').put(definition);
    tx.objectStore('geometry').put({ id: definition.id, geometry });
    tx.objectStore('imports').delete(pendingId);
  });
  updates()?.postMessage('models');
}

export async function updateLocalModel(definition) {
  await transaction('models', 'readwrite', tx => tx.objectStore('models').put(definition));
  updates()?.postMessage('models');
}

export async function readPaint(id) {
  let parts, preview;
  await transaction(['coats', 'previews'], 'readonly', tx => {
    parts = tx.objectStore('coats').index('model').getAll(id);
    preview = tx.objectStore('previews').get(id);
  });
  return { parts: parts.result, preview: preview.result };
}

export async function savePaint(id, generation, changes, thumbnail) {
  let saved = false;
  await transaction(['coats', 'previews'], 'readwrite', tx => {
    const coats = tx.objectStore('coats');
    const previews = tx.objectStore('previews');
    const request = previews.get(id);
    request.onsuccess = () => {
      const preview = request.result;
      if ((preview?.generation ?? 0) !== generation) return;
      const painted = new Set(preview?.painted ?? []);
      for (const [partId, coat] of changes) {
        if (coat) coats.put({ modelId: id, partId, coat });
        else coats.delete([id, partId]);
        if (coat?.ink) painted.add(partId);
        else painted.delete(partId);
      }
      previews.put({ id, generation, painted: [...painted], thumb: painted.size ? thumbnail || preview?.thumb : null });
      saved = true;
    };
  });
  if (saved) updates()?.postMessage('paint');
  return saved;
}

export async function resetPaint(id) {
  let generation;
  await transaction(['coats', 'previews'], 'readwrite', tx => {
    const coats = tx.objectStore('coats');
    const keys = coats.index('model').getAllKeys(id);
    keys.onsuccess = () => { for (const key of keys.result) coats.delete(key); };
    const previews = tx.objectStore('previews');
    const existing = previews.get(id);
    existing.onsuccess = () => {
      generation = (existing.result?.generation ?? 0) + 1;
      previews.put({ id, generation, painted: [], thumb: null });
    };
  });
  updates()?.postMessage('paint');
  return generation;
}
