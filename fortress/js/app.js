import { loadManifest, loadImage, Sprites, sfxUrl, itemUrl } from './assets.js';
import { Audio } from './audio.js';
import { Game, DT } from './game.js';
import { Music } from './music.js';
import { TANKS, PICKABLE, tankById, randomTank } from './tanks.js';
import { ITEMS } from './items.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
let manifest;
let sprites;
let audio;
let music = null;
let game = null;
let lastSetup = null;
let itemIcons = null;
let myTank = 'cannon'; // a tank id, or 'random' for the ? card

function option(select, value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  select.append(o);
}

// ---- character select: the original arcade screen ----------------------------------------
// Card spots on the 320x240 picture: twelve tanks in two rows, then the ? card.
const CARD = { x: 7, y: [40, 84], w: 41, h: 39, step: 44 };
const RANDOM_CARD = { x: 277, y: 40, w: 41, h: 83 };
const STAT_ROWS = 160, STAT_STEP = 10;

function cardRect(i) {
  return { x: CARD.x + (i % 6) * CARD.step, y: CARD.y[Math.floor(i / 6)], w: CARD.w, h: CARD.h };
}

// 1-5 for each bar on the screen: defence, movement, power 1, power 2, fire angle, fire range.
function tankStats(t) {
  const power = (w) => Math.min(5, Math.max(1, Math.round(((w.damage * (w.count ?? 1) * (w.burst ?? 1)) / 50) * 5)));
  return [t.defence, t.movement, power(t.weapons[0]), power(t.weapons[1]),
    Math.max(1, Math.round(((t.angle[1] - t.angle[0]) / 90) * 5)),
    Math.min(5, Math.max(1, Math.round((t.weapons[0].speed - 0.8) * 12)))];
}

let select = null; // { img, scale, n } once loaded
async function buildSelect() {
  const ids = [manifest.selectScreen, ...Object.values(manifest.tankNames), ...TANKS.map((t) => manifest.tanks[t.id].idle[2])];
  select = { s: await sprites.loadAll(ids) };
  const c = $('select');
  c.addEventListener('click', (e) => {
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 320, y = ((e.clientY - r.top) / r.height) * 240;
    const hit = (q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h;
    let pick = null;
    PICKABLE.forEach((t, i) => { if (hit(cardRect(i))) pick = t.id; });
    if (hit(RANDOM_CARD)) pick = 'random';
    if (!pick) return;
    myTank = pick;
    try { localStorage.setItem('fortress-tank', pick); } catch { /* not remembered */ }
    audio?.select();
    drawSelect();
  });
  window.addEventListener('resize', drawSelect);
  drawSelect();
}

function drawSelect() {
  if (!select || $('menu').hidden) return;
  const c = $('select');
  const box = c.parentElement.clientWidth;
  const scale = Math.max(1, Math.min(box / 320, (innerHeight * 0.62) / 240, 2.4));
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.style.width = `${Math.round(320 * scale)}px`;
  c.style.height = `${Math.round(240 * scale)}px`;
  c.width = Math.round(320 * scale * dpr);
  c.height = Math.round(240 * scale * dpr);
  // Draw in 320x240 units on a whole-number nearest-neighbour copy, then smooth it down.
  const n = Math.ceil(scale * dpr);
  const off = document.createElement('canvas');
  off.width = 320 * n; off.height = 240 * n;
  const x = off.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.scale(n, n);
  const sp = (id) => select.s[id];
  const bg = sp(manifest.selectScreen);
  if (bg) x.drawImage(bg.img, 0, 0, 320, 240, 0, 0, 320, 240);
  const random = myTank === 'random';
  const mine = random ? null : tankById(myTank);
  // Selected card: a pulsing yellow frame.
  const r = random ? RANDOM_CARD : cardRect(PICKABLE.indexOf(mine));
  x.strokeStyle = '#ffe14a'; x.lineWidth = 2;
  x.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  x.strokeStyle = '#ff3b2f'; x.lineWidth = 1;
  x.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
  // Name plate on the striped bar, and the tank in the middle window.
  const plate = mine && sp(manifest.tankNames[mine.id]);
  if (plate) {
    const [fx, fw, fh] = plate.frames[0];
    x.drawImage(plate.img, fx, 0, fw, fh, Math.round(160 - fw / 2), 134, fw, fh);
  }
  if (mine) {
    const t = sp(manifest.tanks[mine.id].idle[2]);
    const [fx, fw, fh] = t.frames[0];
    x.save();
    x.translate(158, 187); x.scale(-1, 1);
    x.drawImage(t.img, fx, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
    x.restore();
  } else {
    x.font = '900 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#8a3cc8'; x.fillText('?', 158, 188);
  }
  // Stat bars beside the labels: mine on the left, the opponent's on the right.
  const bars = (stats, x0, right) => stats.forEach((v, i) => {
    const y = STAT_ROWS + i * STAT_STEP + 2;
    for (let k = 0; k < 5; k++) {
      const bx = right ? x0 - (k + 1) * 9 : x0 + k * 9;
      x.fillStyle = '#0b1530'; x.fillRect(bx, y, 8, 6);
      x.fillStyle = k < v ? (v >= 4 ? '#ffd84a' : '#5fe06a') : '#2a3a66';
      x.fillRect(bx + 1, y + 1, 6, 4);
    }
  });
  if (mine) bars(tankStats(mine), 60, false);
  const enemy = $('enemy-tank').value;
  if (enemy && enemy !== 'random') bars(tankStats(tankById(enemy)), 260, true);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, c.width, c.height);
}

async function init() {
  manifest = await loadManifest();
  if (!manifest) {
    $('notice').textContent = '원본 에셋이 없어요. npm run fortress:assets 로 먼저 변환해 주세요.';
    $('start').textContent = '에셋 없음';
    return;
  }
  sprites = new Sprites(manifest);
  try {
    myTank = localStorage.getItem('fortress-tank') || myTank;
    $('player-name').value = localStorage.getItem('fortress-name') || '';
  } catch { /* nothing remembered */ }
  if (myTank !== 'random' && !PICKABLE.some((t) => t.id === myTank)) myTank = 'cannon';
  option($('enemy-tank'), 'random', '? (랜덤)');
  for (const t of PICKABLE) option($('enemy-tank'), t.id, t.name);
  $('enemy-tank').addEventListener('change', drawSelect);
  buildSelect();
  option($('map'), 'random', '랜덤');
  for (const m of manifest.maps) option($('map'), m.id, m.name);
  // Stage music: the twelve long tracks.
  music = new Music(manifest.music.filter((id) => parseInt(id, 16) <= 12));
  setupMusicButtons();
  music.start();
  $('start').disabled = false;
  $('start').textContent = '시작';
  if (new URLSearchParams(location.search).has('sfx')) showSfxBoard();
}

function setupMusicButtons() {
  const label = () => (music.on ? '배경음악 켜짐 ♪' : '배경음악 꺼짐');
  for (const id of ['menu-music', 'pause-music']) {
    const b = $(id);
    b.hidden = !music.available;
    b.textContent = label();
    b.onclick = () => {
      music.toggle();
      for (const other of ['menu-music', 'pause-music']) $(other).textContent = label();
    };
  }
}

async function prepareAudio() {
  if (!audio) {
    audio = new Audio();
    await audio.load();
  }
  audio.resume();
}

function pickSetup() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const mapId = $('map').value === 'random' ? pick(manifest.maps).id : $('map').value;
  const enemy = $('enemy-tank').value === 'random' ? randomTank().id : $('enemy-tank').value;
  const mine = myTank === 'random' ? randomTank().id : myTank;
  const cpu = $('opponent').value || null;
  const name = $('player-name').value.trim().slice(0, 8) || '나';
  try { localStorage.setItem('fortress-name', $('player-name').value.trim()); } catch { /* not remembered */ }
  return {
    map: manifest.maps.find((m) => m.id === mapId),
    players: [
      { name, tank: mine, cpu: null },
      { name: cpu ? '컴퓨터' : '2P', tank: enemy, cpu },
    ],
  };
}

// Everything a match draws, loaded before it starts.
function spriteIds(setup) {
  const ids = [setup.map.ground, setup.map.back, ...manifest.panels, ...manifest.timer,
    ...Object.values(manifest.shells), ...Object.values(manifest.blasts)];
  for (const p of setup.players) ids.push(...Object.values(manifest.tanks[p.tank]).flat());
  return [...new Set(ids)];
}

async function start(setup = pickSetup()) {
  $('start').disabled = true;
  $('start').textContent = '불러오는 중…';
  await prepareAudio();
  const loaded = await sprites.loadAll(spriteIds(setup));
  itemIcons ??= Object.fromEntries(await Promise.all(manifest.items.map(async (id) => [id, await loadImage(itemUrl(id))])));
  lastSetup = setup;
  const match = new Game({
    canvas, manifest, sprites: loaded, itemIcons, audio, map: setup.map,
    players: setup.players.map((p) => ({ ...p, tank: tankById(p.tank) })),
    // The result comes a moment after the last blast; ignore it if the player already left.
    onEnd: (winner) => { if (game === match) showEnd(winner); },
    onTurn: syncTouch,
  });
  game = match;
  $('menu').hidden = true;
  $('end').hidden = true;
  $('touch').hidden = !touchDevice;
  music?.next();
  $('start').disabled = false;
  $('start').textContent = '시작';
}

function showEnd(winner) {
  const human = game.players.filter((p) => !p.cpu).length === 1;
  let title = '무승부!';
  if (winner) title = human ? (game.players[winner.player].cpu ? '패배…' : '승리!') : `${winner.name} 승리!`;
  $('end-title').textContent = title;
  $('end-title').style.color = winner?.color ?? '#fff';
  $('end').hidden = false;
}

function toMenu() {
  closePause();
  closeChat();
  game = null;
  $('end').hidden = true;
  $('touch').hidden = true;
  $('menu').hidden = false;
  drawSelect();
}

// ---- input ---------------------------------------------------------------------------------

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab']);
window.addEventListener('keydown', (e) => {
  if (document.activeElement === $('chat-input')) {
    if (e.code === 'Escape') closeChat();
    return;
  }
  if (e.code === 'Enter' && game && $('menu').hidden && $('pause').hidden && $('end').hidden) {
    e.preventDefault();
    openChat();
    return;
  }
  if (e.code === 'Escape') {
    if (game && $('end').hidden) togglePause();
    return;
  }
  if (!game || !$('menu').hidden) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Equal' || e.code === 'NumpadAdd') game.zoomBy(1.2);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') game.zoomBy(1 / 1.2);
  if (!e.repeat) gameKey(e.code, true);
});
window.addEventListener('keyup', (e) => gameKey(e.code, false));

function gameKey(code, down) {
  if (!game || game.cpuTurn) return;
  if (down) game.keyDown(code);
  else game.keyUp(code);
  if (down && (code === 'Digit1' || code === 'Digit2' || code === 'Tab')) setTimeout(syncTouch);
}

// The 1번 / 2번 buttons show which attack is picked.
function syncTouch() {
  const w = game?.active?.weapon ?? 0;
  $('t-w1').classList.toggle('on', w === 0);
  $('t-w2').classList.toggle('on', w === 1);
}

const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', touchDevice);
for (const button of document.querySelectorAll('#touch [data-key]')) {
  const key = button.dataset.key;
  let held = false;
  const press = (e) => {
    e.preventDefault();
    try { button.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ }
    if (held) return;
    held = true;
    button.classList.add('held');
    gameKey(key, true);
  };
  const release = () => {
    if (!held) return;
    held = false;
    button.classList.remove('held');
    gameKey(key, false);
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
$('t-menu').onclick = () => togglePause();
$('t-chat').onclick = () => openChat();

// Chat: on a computer the box sits on the input line of the chat window; on touch screens it
// opens above the bar on the left, where messages show.
function openChat() {
  if (!game) return;
  const form = $('chat');
  const { k, right } = game.panelLayout();
  if (game.touch) {
    Object.assign(form.style, { left: '10px', top: '', bottom: `${game.panelH + 10}px`, width: `${Math.min(320, innerWidth * 0.45)}px` });
  } else {
    // On the input line of the chat box (renderChat), same text size.
    const box = game.chatRect(right, k), size = Math.max(11, Math.round(6 * k));
    Object.assign(form.style, { left: `${box.x + 6}px`, top: `${box.y + box.h - size - 12}px`, bottom: '', width: `${box.w - 12}px` });
    Object.assign($('chat-input').style, { height: `${size + 8}px`, fontSize: `${size}px`, padding: '0 6px' });
  }
  form.hidden = false;
  game.chatOpen = true;
  $('chat-input').focus();
}
function closeChat() {
  $('chat').hidden = true;
  $('chat-input').blur();
  if (game) game.chatOpen = false;
}
$('chat').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (text && game) game.say(`${game.players[0].name}: ${text}`, '#ffffff');
  $('chat-input').value = '';
  closeChat();
};
$('chat-input').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('chat-input')) closeChat(); }));

// Dragging pans the view, two fingers pinch to zoom, a tap on FIRE1 / FIRE2 picks the attack.
let drag = null;
const touches = new Map();
let pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
    drag = null;
    return;
  }
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
const endTouch = (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2 && pinch != null) {
    pinch = null;
    const rest = [...touches.values()][0];
    drag = rest ? { ...rest, moved: 99 } : null;
  }
};
window.addEventListener('pointercancel', endTouch);
window.addEventListener('pointerup', (e) => {
  endTouch(e);
  // A tap: FIRE1 / FIRE2 or an item slot on the panel, or the teleport target on the field.
  if (drag && drag.moved < 5 && game && !game.cpuTurn && game.panelTank === game.active) {
    const onBar = e.clientY >= game.H - game.panelH;
    const w = onBar ? game.panelWeaponAt(e.clientX, e.clientY) : null;
    const item = onBar ? game.panelItemAt(e.clientX, e.clientY) : null;
    if (w != null) { game.selectWeapon(w); syncTouch(); }
    else if (item != null) game.useItem(ITEMS[item].id);
    else if (!onBar) game.clickAt(game.toWorld(e.clientX, e.clientY));
  }
  drag = null;
});
window.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch != null && game) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0 && pinch > 0) game.zoomBy(d / pinch);
    pinch = d;
    return;
  }
  if (!game || !drag) return;
  drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
  if (drag.moved >= 5) game.pan((e.clientX - drag.x) / game.scale, (e.clientY - drag.y) / game.scale);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  game?.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });
window.addEventListener('resize', () => game?.resize());

$('start').onclick = () => start();
$('again').onclick = () => start(lastSetup);
$('to-menu').onclick = toMenu;

// In-game menu: the match waits while it is open.
let quitArmed = null;
function togglePause() {
  if ($('pause').hidden) openPause(); else closePause();
}
function openPause() {
  if (!game) return;
  $('pause').hidden = false;
  game.menuPaused = true;
}
function closePause() {
  $('pause').hidden = true;
  $('quit').textContent = '게임 나가기';
  clearTimeout(quitArmed);
  quitArmed = null;
  if (game) game.menuPaused = false;
}
$('resume').onclick = closePause;
// Leaving takes two taps so a stray touch never ends the game.
$('quit').onclick = () => {
  if (!quitArmed) {
    $('quit').textContent = '정말 나갈까요? 한 번 더 누르세요';
    quitArmed = setTimeout(() => { $('quit').textContent = '게임 나가기'; quitArmed = null; }, 3000);
    return;
  }
  toMenu();
};

// `?sfx`: every original sound effect on a button, to find out which is which.
function showSfxBoard() {
  $('menu').hidden = true;
  $('sfx').hidden = false;
  for (const id of manifest.sfx) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = id.replace(/^0+/, '');
    b.onclick = async () => { await prepareAudio(); audio.play(await audio.decode(sfxUrl(id))); };
    $('sfx-list').append(b);
  }
}

// Fixed-step simulation, rendered every animation frame.
let last = performance.now();
let acc = 0;
function frame(now) {
  acc = Math.min(acc + (now - last) / 1000, 0.25);
  last = now;
  if (game) {
    while (acc >= DT) { game.update(); acc -= DT; }
    game.render();
  } else acc = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- full screen, installing, in-app browsers ----------------------------------------------

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

async function enterFullscreen() {
  if (!canFullscreen || standalone || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
    await screen.orientation?.lock?.('landscape');
  } catch { /* the browser said no; play on as is */ }
}

// Phones jump to full screen when a game starts (it needs the tap that started it).
if (touchDevice && canFullscreen && !standalone) {
  for (const id of ['start', 'again']) $(id).addEventListener('click', enterFullscreen);
  for (const id of ['menu-full', 'pause-full']) { $(id).hidden = false; $(id).onclick = enterFullscreen; }
}
if (isIOS && !standalone) $('ios-help').hidden = false;

// KakaoTalk's in-app browser keeps its own bars on screen; hand the page to the phone's browser.
if (/KAKAOTALK/i.test(ua)) {
  const openOutside = () => { location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`; };
  $('kakao').hidden = false;
  $('kakao-open').onclick = openOutside;
  $('kakao-stay').onclick = () => { $('kakao').hidden = true; };
  let tried = false;
  try { tried = sessionStorage.getItem('kakao-external') === '1'; sessionStorage.setItem('kakao-external', '1'); } catch { /* try once anyway */ }
  if (!tried) openOutside();
}

init();

// For automated checks.
window.fortress = { get game() { return game; } };
