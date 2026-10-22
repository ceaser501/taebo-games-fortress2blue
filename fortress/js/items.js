// Items, the same set as taebo-games-worms: each player gets a few per match and several can be
// stacked in one turn (dual + damage x2 hits four times as hard). They are used before firing.
export const ITEMS = [
  { id: 'dual', name: '2연발', color: '#ff8a3c', key: 'KeyQ', count: 2, info: '같은 각도·세기로 한 발 더 쏴요' },
  { id: 'double', name: '공격력 2배', color: '#ff5a5a', key: 'KeyW', count: 2, info: '이번 턴 데미지가 2배' },
  { id: 'power', name: '파워샷', color: '#ffd84a', key: 'KeyE', count: 3, info: '더 멀리 날아가고 데미지 1.3배' },
  { id: 'calm', name: '바람 멈춤', color: '#4fc3ff', key: 'KeyR', count: 2, info: '이번 턴 바람이 없어요' },
  { id: 'heal', name: '체력 회복', color: '#6be06b', key: 'KeyT', count: 1, info: '체력 +40' },
  { id: 'teleport', name: '순간이동', color: '#c58bff', key: 'KeyY', count: 1, info: '원하는 곳을 눌러 이동 (턴 끝)' },
];

export const POWER_SHOT = 1.3;
export const HEAL = 40;

const SIZE = 48;

function outlined(ctx, path, fill, stroke = '#111', width = 2) {
  ctx.beginPath();
  path();
  if (fill !== 'transparent') { ctx.fillStyle = fill; ctx.fill(); }
  if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function star(ctx, cx, cy, points, outer, inner) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

function boldText(ctx, text, x, y, size, color) {
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// One frame of a sprite ({ img, frames }) centred at cx, cy, scaled to fit maxSize.
function drawSprite(ctx, s, cx, cy, maxSize, rotation = 0, flip = false) {
  if (!s) return;
  const [fx, fw, fh] = s.frames[0];
  const k = maxSize / Math.max(fw, fh);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(s.img, fx, 0, fw, fh, (-fw * k) / 2, (-fh * k) / 2, fw * k, fh * k);
  ctx.restore();
}

// The pictures follow the Worms icons; `shell` and `tank` are sprites from the match.
const ICONS = {
  dual(ctx, { shell }) {
    drawSprite(ctx, shell, 18, 28, 30, -Math.PI / 4);
    drawSprite(ctx, shell, 30, 18, 30, -Math.PI / 4);
    boldText(ctx, '2', 38, 38, 15, '#ffb070');
  },
  double(ctx) {
    outlined(ctx, () => star(ctx, 24, 24, 10, 21, 13), '#ff6a2a', '#5a1400', 2);
    outlined(ctx, () => star(ctx, 24, 24, 10, 14, 9), '#ffd84a', 'transparent', 0);
    boldText(ctx, '×2', 24, 25, 17, '#fff');
  },
  power(ctx, { shell }) {
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [x, y, l] of [[8, 30, 10], [12, 38, 12], [18, 43, 8]]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l * 0.7, y - l * 0.7); ctx.stroke();
    }
    outlined(ctx, () => { ctx.ellipse(17, 31, 9, 4, -Math.PI / 4, 0, Math.PI * 2); }, '#ff8a2a', 'transparent', 0);
    drawSprite(ctx, shell, 28, 20, 34, -Math.PI / 4);
  },
  calm(ctx) {
    ctx.lineCap = 'round';
    for (const [y, w] of [[15, 26], [24, 30], [33, 22]]) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(10, y); ctx.bezierCurveTo(10 + w / 3, y - 5, 10 + (w * 2) / 3, y + 5, 10 + w, y); ctx.stroke();
      ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.strokeStyle = '#111'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.moveTo(11, 11); ctx.lineTo(37, 37); ctx.stroke();
    ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 4; ctx.stroke();
  },
  heal(ctx) {
    outlined(ctx, () => { ctx.roundRect(16, 8, 16, 8, 3); }, 'transparent', '#555', 3);
    outlined(ctx, () => { ctx.roundRect(7, 13, 34, 27, 4); }, '#f4f4f4');
    ctx.fillStyle = '#e03030';
    ctx.fillRect(20, 17, 8, 19); ctx.fillRect(14, 23, 20, 7);
  },
  teleport(ctx, { tank }) {
    ctx.lineCap = 'round';
    for (const [r, a] of [[19, 0.2], [14, 2.4], [9, 4.4]]) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(24, 24, r, a, a + 4); ctx.stroke();
      ctx.strokeStyle = '#c58bff'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    drawSprite(ctx, tank, 24, 26, 22);
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[8, 10], [40, 12], [39, 39], [9, 37]]) { ctx.fillRect(x - 1, y - 3, 2, 6); ctx.fillRect(x - 3, y - 1, 6, 2); }
  },
};

export function itemIcon(item, sprites) {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ICONS[item.id]?.(ctx, sprites);
  return c;
}
