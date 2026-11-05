export function resourceURL(path) {
  return globalThis.ellocolorResources?.[path] ?? path;
}

// Classic scripts can read sibling files when the page is opened from disk.
export function readLocalPayload(path, property) {
  const source = new URL(path, location.href).href;
  const script = document.createElement('script');
  return new Promise((resolve, reject) => {
    script.src = source;
    script.onload = () => {
      const data = script[property];
      script.remove();
      if (data) resolve(data);
      else reject(new Error('Missing model payload'));
    };
    script.onerror = () => { script.remove(); reject(new Error('Unable to read model')); };
    document.head.appendChild(script);
  });
}

export async function readStudioModel(path) {
  const packed = await readLocalPayload(path, 'ellocolorModel');
  const payload = await fetch(packed);
  const data = payload.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(data).arrayBuffer();
}
