import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rate = 22050;
let seed = 1535;
function white() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
}

function noise(length, envelope) {
  const raw = Array.from({ length }, white);
  return raw.map((value, index) => {
    const previous = raw[(index - 1 + length) % length];
    const next = raw[(index + 1) % length];
    const low = (previous + next) * .33;
    return (value * .52 - low * .4) * envelope(index / length);
  });
}

function wav(name, samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => data.writeInt16LE(Math.round(sample * 32767), 44 + index * 2));
  fs.writeFileSync(path.join(root, 'assets', name), data);
}

wav('spray-loop.wav', noise(rate * 2, t => .87 + .08 * Math.sin(Math.PI * 4 * t)));
wav('valve.wav', noise(Math.round(rate * .135), t => Math.min(1, t * 65) * Math.exp(-4.1 * t) * (1 - t)));
