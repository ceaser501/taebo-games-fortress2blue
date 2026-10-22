// Destructible ground: a canvas for drawing plus a byte mask for collision. The map picture is
// the ground itself; transparent pixels are air.
export class Terrain {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.mask = new Uint8Array(width * height);
  }

  // The picture sits on the bottom of a world `height` pixels tall.
  static fromImage(img, height) {
    const t = new Terrain(img.width, height);
    t.ctx.drawImage(img, 0, height - img.height);
    const { data } = t.ctx.getImageData(0, 0, t.width, t.height);
    for (let i = 0; i < t.mask.length; i++) t.mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    return t;
  }

  solid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.mask[y * this.width + x] === 1;
  }

  // Top of the ground in column x at or below `fromY`, or null when the column is empty.
  surfaceBelow(x, fromY = 0) {
    for (let y = Math.max(0, fromY | 0); y < this.height; y++) if (this.solid(x, y)) return y;
    return null;
  }

  // Direction pointing out of the ground around (x, y).
  normal(x, y, r = 4) {
    let nx = 0, ny = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.solid(x + dx, y + dy)) { nx -= dx; ny -= dy; }
      }
    }
    const len = Math.hypot(nx, ny);
    return len ? { x: nx / len, y: ny / len } : { x: 0, y: -1 };
  }

  explode(cx, cy, r) {
    const { width, height, mask, ctx } = this;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, cy + r); y++) {
      const span = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
      for (let x = Math.max(0, Math.floor(cx - span)); x <= Math.min(width - 1, cx + span); x++) mask[y * width + x] = 0;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // A scorched rim on what is left.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(30, 18, 10, 0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
