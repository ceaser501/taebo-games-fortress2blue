// Converts the Fortress 2 Blue resources (ceaser501/taebo-games-fortress2blue-assets) into
// web-friendly PNG/WAV/OGG files under assets/f2, plus a manifest the game reads at startup.
//
//   npm run fortress:assets -- [path/to/taebo-games-fortress2blue-assets]
//   (default: ../taebo-games-fortress2blue-assets)
import fs from 'node:fs';
import path from 'node:path';
import { kindOf, readIcs, encodePng } from './f2-formats.mjs';
import { TANKS, SHELLS, BLASTS, MAPS, PANELS, TIMER_DIGITS } from './f2-names.mjs';

const root = path.resolve(process.argv[2] || '../taebo-games-fortress2blue-assets');
const src = path.join(root, 'Resource');
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/f2');
if (!fs.existsSync(src)) {
  console.error(`Fortress resources not found at ${src}`);
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['sprites', 'sfx', 'music', 'items']) fs.mkdirSync(path.join(out, dir), { recursive: true });

// Every sprite becomes one PNG with its frames side by side, top-aligned. The manifest keeps
// each frame as [x, width, height, anchorX, anchorY, delayMs]; the anchor is the point that
// sits on the ground (tanks) or the top-left (pictures).
function writeStrip(ics, file) {
  const width = ics.frames.reduce((s, f) => s + f.width, 0);
  const height = Math.max(...ics.frames.map((f) => f.height));
  const rgba = new Uint8Array(width * height * 4);
  const frames = [];
  let x = 0;
  for (const f of ics.frames) {
    for (let y = 0; y < f.height; y++) rgba.set(f.rgba.subarray(y * f.width * 4, (y + 1) * f.width * 4), (y * width + x) * 4);
    frames.push([x, f.width, f.height, f.ax, f.ay, f.delay]);
    x += f.width;
  }
  fs.writeFileSync(file, encodePng(width, height, rgba));
  return frames;
}

const manifest = { sprites: {}, sfx: [], music: [], items: [], tanks: TANKS, shells: SHELLS, blasts: BLASTS, maps: MAPS, panels: PANELS, timer: TIMER_DIGITS };
const counts = { ics: 0, wav: 0, ogg: 0, skipped: 0 };
for (const id of fs.readdirSync(src).sort()) {
  const buf = fs.readFileSync(path.join(src, id));
  const kind = kindOf(buf);
  if (kind === 'ics') manifest.sprites[id] = writeStrip(readIcs(buf), path.join(out, 'sprites', `${id}.png`));
  else if (kind === 'wav') { fs.copyFileSync(path.join(src, id), path.join(out, 'sfx', `${id}.wav`)); manifest.sfx.push(id); }
  else if (kind === 'ogg') { fs.copyFileSync(path.join(src, id), path.join(out, 'music', `${id}.ogg`)); manifest.music.push(id); }
  else { counts.skipped++; continue; }
  counts[kind]++;
}

// Item icons: the Worms clone's pictures, kept in the data repo (Worms/items/<id>.png).
const items = path.join(root, 'Worms', 'items');
if (fs.existsSync(items)) {
  for (const f of fs.readdirSync(items).sort()) {
    if (!f.endsWith('.png')) continue;
    fs.copyFileSync(path.join(items, f), path.join(out, 'items', f));
    manifest.items.push(f.replace(/\.png$/, ''));
  }
}

// Fail loudly if the name table points at something that is not there.
const named = [...Object.values(TANKS).flatMap((t) => Object.values(t).flat()), ...Object.values(SHELLS), ...Object.values(BLASTS), ...MAPS.flatMap((m) => [m.ground, m.back]), ...PANELS, ...TIMER_DIGITS];
const missing = named.filter((id) => !manifest.sprites[id]);
if (missing.length) {
  console.error(`Named sprites missing from the resources: ${missing.join(', ')}`);
  process.exit(1);
}

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
console.log(`Wrote ${counts.ics} sprites, ${counts.wav} sounds, ${counts.ogg} music files, ${manifest.items.length} item icons to ${out}` + (counts.skipped ? ` (${counts.skipped} unknown files skipped)` : ''));
