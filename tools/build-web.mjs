import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const path = file => new URL(file, root);
const read = file => readFile(path(file));
const write = (file, text) => writeFile(path(file), text);
const dataURL = (data, type) => `data:${type};base64,${data.toString('base64')}`;
const script = (property, data) => `${property} = ${JSON.stringify(data)};\n`;
const esbuild = process.argv[2] ?? 'esbuild';

await mkdir(path('web/'), { recursive: true });
const catalog = JSON.parse(await read('assets/demo/catalog.json'));
const thumbnails = {};
for (const model of catalog) {
  const glb = await read(`assets/demo/${model.id}.glb`);
  const packed = dataURL(gzipSync(glb, { level: 6 }), 'application/gzip');
  await write(model.file, script('document.currentScript.ellocolorModel', packed));
  thumbnails[model.id] = dataURL(await read(model.thumb), 'image/jpeg');
}
await write('web/library-thumbnails.js', script('document.currentScript.ellocolorThumbnails', thumbnails));

const resources = {};
for (const [file, type] of [
  ['./assets/spray-loop.wav', 'audio/wav'], ['./assets/valve.wav', 'audio/wav'],
  ['./vendor/xatlas/xatlas.js', 'text/javascript'], ['./vendor/xatlas/xatlas.wasm', 'application/wasm']
]) resources[file] = dataURL(await read(file), type);
await write('web/resources.js', script('globalThis.ellocolorResources', resources));

for (const [source, bundle] of [['app', 'studio'], ['library', 'library']]) {
  execFileSync(esbuild, [`src/${source}.js`, '--bundle', '--format=iife', '--target=es2022', '--minify',
    '--alias:three=./vendor/three.module.js', `--outfile=web/${bundle}.js`],
  { cwd: fileURLToPath(root), stdio: 'inherit' });
}
