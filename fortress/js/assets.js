// Loads the converted Fortress 2 Blue resources (assets/f2). Sprites are PNG strips with their
// frames side by side; the manifest keeps each frame as [x, width, height, anchorX, anchorY, ms].
const BASE = 'assets/f2/';

export function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function loadManifest() {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return null;
  }
}

// Sprites load on first use and are shared afterwards.
export class Sprites {
  constructor(manifest) {
    this.manifest = manifest;
    this.cache = {};
  }

  load(id) {
    this.cache[id] ??= loadImage(`${BASE}sprites/${id}.png`).then((img) => (img ? { img, frames: this.manifest.sprites[id] } : null));
    return this.cache[id];
  }

  loadAll(ids) {
    return Promise.all(ids.map((id) => this.load(id))).then((list) => Object.fromEntries(ids.map((id, i) => [id, list[i]])));
  }
}

export const sfxUrl = (id) => `${BASE}sfx/${id}.wav`;
export const itemUrl = (id) => `${BASE}items/${id}.png`;
export const musicUrl = (id) => `${BASE}music/${id}.ogg`;
