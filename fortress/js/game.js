// One match: two tanks taking turns on destructible ground. The simulation runs in fixed
// steps (update) and draws every animation frame (render); the bottom panel and the turn
// clock are the original arcade pictures, filled in on the canvas.
import { Terrain } from './terrain.js';
import { AI } from './ai.js';
import { ITEMS, POWER_SHOT, HEAL, itemIcon } from './items.js';

export const WORLD_H = 480;
export const GRAVITY = 270;
export const MAX_SPEED = 520;
export const WIND_ACCEL = 60;
export const DT = 1 / 60;
export const CHARGE_TIME = 1.6;
const TURN_TIME = 20;
const MOVE_MAX = 90;
const WALK_SPEED = 30;
const MAX_CLIMB = 5;
const AIM_SPEED = 40;
const AIM_REPEAT = 0.25;
const FALL_SAFE = 24;
const FALL_DAMAGE = 0.6;
const TANK_R = 13;
const AFTERMATH = 0.6;
export const WATER_Y = WORLD_H - 14;
// What the view shows at zoom 1: at least this many world pixels across and up.
const VIEW_W = 820, VIEW_H = 340;
// The panel picture is rebuilt from its own columns: rows above PANEL_SPLIT hold the dial,
// item slots and WIND / DELAY, the rows below the Energy / Power / Move bars.
const PANEL_SPLIT = 26;
const SLOT_X = 107, SLOT_PITCH = 22, SLOT_W = 18;
// Columns in the top rows without the stretchy ones; the panel is never narrower.
const PANEL_MIN_W = 129 + 4 * SLOT_PITCH + 23 + 40 + 24 + 29 + 2;
// Height of the arrow pad on touch screens (#pad in style.css).
const PAD_SIZE = 3 * 44 + 2 * 2;
// Width of the fire button cluster on touch screens (#actions in style.css).
const ACTIONS_W = 130;

// Player 1 uses the red panel, player 2 the blue one.
export const PLAYERS = [
  { color: '#ff4a3d', panel: 0 },
  { color: '#3d9bff', panel: 6 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Tank {
  constructor(player, def, name, x, y) {
    Object.assign(this, { player, def, name, x, y });
    this.hp = 100;
    this.facing = 1;
    this.aim = 45;
    this.weapon = 0;
    this.lastPower = null;
    this.vy = 0;
    this.fallFrom = null;
    this.walkTime = 0;
    this.hitTime = 0;
    this.dead = false;
  }

  get color() { return PLAYERS[this.player].color; }
  get cx() { return this.x; }
  get cy() { return this.y - 11; }
}

export class Game {
  // players: [{ name, tank (def from tanks.js), cpu: null | 'easy' | 'normal' | 'hard' }]
  // sprites: id -> { img, frames } for everything the match draws.
  constructor({ canvas, manifest, sprites, audio, map, players, onEnd, onTurn = () => {} }) {
    Object.assign(this, { canvas, manifest, sprites, audio, onEnd, onTurn });
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.terrain = Terrain.fromImage(sprites[map.ground].img, WORLD_H);
    this.back = sprites[map.back].img;
    this.keys = new Set();
    this.pressed = new Set();
    this.projectiles = [];
    this.blasts = [];
    this.labels = [];
    this.itemFx = [];
    this.log = [];
    this.queue = [];
    this.camera = { x: 0, y: 0, shake: 0, free: false, snap: true };
    this.time = 0;
    this.players = players;
    this.tanks = this.spawn(players);
    this.ai = new AI(this);
    this.turn = Math.floor(Math.random() * this.tanks.length) - 1;
    this.resize();
    this.nextTurn();
  }

  // ---- setup -------------------------------------------------------------------------------

  // One tank on each side of the map, on solid ground above the water.
  spawn(players) {
    const t = this.terrain;
    return players.map((p, i) => {
      // Each side's outer third, so the two start well apart.
      const [from, to] = i === 0 ? [50, t.width * 0.35] : [t.width * 0.65, t.width - 50];
      let x = 0, y = null;
      for (let tries = 0; tries < 200; tries++) {
        x = Math.round(rand(from, to));
        y = t.surfaceBelow(x);
        if (y != null && y < WATER_Y - 20 && t.solid(x - 6, y + 2) && t.solid(x + 6, y + 2)) break;
      }
      const tank = new Tank(i, p.tank, p.name, x, y ?? 0);
      tank.items = Object.fromEntries(ITEMS.map((it) => [it.id, it.count]));
      tank.facing = x < t.width / 2 ? 1 : -1;
      return tank;
    });
  }

  get active() { return this.tanks[this.turn]; }
  get cpuTurn() { return !!this.players[this.turn]?.cpu; }
  // The panel at the bottom belongs to the person at this screen: the only human, or in a
  // two-person game on one screen, whoever is playing.
  get panelTank() {
    const humans = this.tanks.filter((t) => !this.players[t.player].cpu);
    return humans.length === 1 ? humans[0] : this.active;
  }

  nextTurn() {
    if (this.checkOver()) return;
    do this.turn = (this.turn + 1) % this.tanks.length; while (this.active.dead);
    const t = this.active;
    this.wind = Math.round(rand(-1, 1) * 10) / 10;
    this.timer = TURN_TIME;
    this.move = MOVE_MAX;
    this.charge = null;
    this.fired = false;
    this.after = 0;
    this.aimHeld = 0;
    this.turnItems = new Set();
    this.mult = 1;
    this.teleportArmed = false;
    this.state = 'aim';
    this.camera.free = false;
    this.camera.snap = true;
    this.banner = { text: `${t.name} 차례`, color: t.color, life: 1.4 };
    this.say(`${t.name} 차례 · 바람 ${this.wind < 0 ? '◀' : this.wind > 0 ? '▶' : ''}${Math.round(Math.abs(this.wind) * 10)}`, t.color);
    this.audio.turn();
    this.onTurn(t);
    if (this.cpuTurn) this.ai.plan(this.players[t.player].cpu);
  }

  checkOver() {
    const alive = this.tanks.filter((t) => !t.dead);
    if (alive.length > 1) return false;
    if (this.state !== 'over') {
      this.state = 'over';
      setTimeout(() => this.onEnd(alive[0] ?? null), 1500);
    }
    return true;
  }

  // ---- input -------------------------------------------------------------------------------

  keyDown(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  keyUp(code) {
    this.keys.delete(code);
    if (code === 'Space' && this.charge != null && this.state === 'aim' && !this.cpuTurn) this.fire();
  }

  selectWeapon(i) {
    if (this.state !== 'aim' || this.fired || this.charge != null || !this.active.def.weapons[i]) return;
    if (this.active.weapon !== i) this.audio.select();
    this.active.weapon = i;
    this.banner = { text: this.active.def.weapons[i].name, color: '#ffd84a', life: 0.9 };
  }

  handleInput() {
    const t = this.active;
    if (this.state !== 'aim' || this.cpuTurn || !t || t.dead) return;
    if (this.pressed.has('Digit1')) this.selectWeapon(0);
    if (this.pressed.has('Digit2')) this.selectWeapon(1);
    if (this.pressed.has('Tab')) this.selectWeapon(1 - t.weapon);
    for (const item of ITEMS) if (this.pressed.has(item.key)) this.useItem(item.id);
    if (this.charge == null) {
      const dir = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      this.walk(t, dir);
      const turn = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
      // A tap moves the aim one degree; holding sweeps it.
      if (this.pressed.has('ArrowUp') || this.pressed.has('ArrowDown')) { t.aim = clamp(t.aim + turn, 0, 90); this.aimHeld = 0; }
      else if (turn) {
        this.aimHeld += DT;
        if (this.aimHeld > AIM_REPEAT) t.aim = clamp(t.aim + turn * AIM_SPEED * DT, 0, 90);
      }
      if (this.pressed.has('Space') && this.grounded(t)) this.charge = 0;
    }
    if (this.charge != null) {
      this.charge = Math.min(1, this.charge + DT / CHARGE_TIME);
      if (this.charge >= 1) this.fire();
    }
  }

  // ---- items -------------------------------------------------------------------------------

  get canUseItems() {
    return this.state === 'aim' && !this.fired && this.charge == null && !this.teleportArmed && !!this.active && !this.active.dead;
  }

  useItem(id) {
    const t = this.active;
    if (!this.canUseItems || this.turnItems.has(id) || !(t.items[id] > 0)) return;
    t.items[id]--;
    this.turnItems.add(id);
    if (id === 'double') this.mult *= 2;
    else if (id === 'power') this.mult *= POWER_SHOT;
    else if (id === 'calm') this.wind = 0;
    else if (id === 'heal') {
      const gain = Math.min(HEAL, 100 - t.hp);
      t.hp += gain;
      this.label(t.x, t.y - 44, `+${gain}`, '#6be06b');
    } else if (id === 'teleport') {
      this.teleportArmed = true;
      this.banner = { text: '이동할 곳을 탭(클릭)하세요', color: '#c58bff', life: 3 };
    }
    const item = ITEMS.find((it) => it.id === id);
    this.itemFx.push({ name: item.name, color: item.color, life: 1.4 });
    this.say(`${t.name}: ${item.name}`, item.color);
    this.audio.item();
  }

  // A tap on the field; only the armed teleport uses it.
  clickAt(world) {
    if (this.teleportArmed && !this.cpuTurn) this.teleport(world);
  }

  teleport(world) {
    const t = this.active;
    const x = clamp(Math.round(world.x), 8, this.terrain.width - 8);
    const y = this.terrain.surfaceBelow(x, Math.round(world.y) - 30);
    if (y == null || y >= WATER_Y - 6 || this.terrain.solid(x, y - 20)) {
      this.label(world.x, world.y, '갈 수 없는 곳이에요', t.color);
      return;
    }
    Object.assign(t, { x, y, vy: 0, fallFrom: null });
    this.teleportArmed = false;
    this.banner = null;
    this.audio.item();
    this.fired = true;
    this.state = 'fly';
    this.after = 0;
    this.camera.free = false;
    this.camera.snap = true;
  }

  // ---- tanks -------------------------------------------------------------------------------

  supported(x, y) {
    for (let dx = -4; dx <= 4; dx++) if (this.terrain.solid(x + dx, y)) return true;
    return false;
  }

  grounded(t) { return t.fallFrom == null && this.supported(t.x, t.y); }

  walk(t, dir) {
    if (!dir || !this.grounded(t)) { t.walking = false; return; }
    t.facing = dir;
    if (this.move <= 0) { t.walking = false; return; }
    t.walking = true;
    t.walkAcc = (t.walkAcc ?? 0) + WALK_SPEED * DT;
    while (t.walkAcc >= 1) {
      t.walkAcc -= 1;
      if (!this.step(t, dir)) { t.walkAcc = 0; break; }
      this.move = Math.max(0, this.move - 1);
      if (this.move <= 0) break;
    }
    t.walkTime += DT;
  }

  // One pixel sideways: climbs small steps, follows the ground down short drops.
  step(t, dir) {
    const nx = t.x + dir;
    if (nx < 6 || nx > this.terrain.width - 6) return false;
    let ny = t.y, climb = 0;
    while (this.terrain.solid(nx, ny - 1)) {
      if (++climb > MAX_CLIMB) return false;
      ny--;
    }
    t.x = nx;
    t.y = ny;
    for (let d = 0; d < MAX_CLIMB && !this.supported(t.x, t.y); d++) t.y++;
    return true;
  }

  updateTank(t) {
    t.hitTime = Math.max(0, t.hitTime - DT);
    if (t.y > WATER_Y + 4) { this.drown(t); return; }
    if (this.supported(t.x, t.y)) {
      // Climb out if the ground was rebuilt under it (never happens today, cheap to keep).
      while (this.terrain.solid(t.x, t.y - 1) && t.y > 0) t.y--;
      if (t.fallFrom != null) this.land(t);
      return;
    }
    t.fallFrom ??= t.y;
    t.vy += GRAVITY * DT;
    let dist = t.vy * DT;
    while (dist > 0) {
      const d = Math.min(1, dist);
      t.y += d;
      dist -= d;
      if (this.supported(t.x, Math.ceil(t.y))) { t.y = Math.ceil(t.y); this.land(t); return; }
    }
  }

  land(t) {
    const fall = t.y - t.fallFrom;
    t.fallFrom = null;
    t.vy = 0;
    if (fall > FALL_SAFE) this.hurt(t, Math.round((fall - FALL_SAFE) * FALL_DAMAGE));
  }

  drown(t) {
    if (t.dead) return;
    t.dead = true;
    t.hp = 0;
    this.splash(t.x);
    this.label(t.x, WATER_Y - 30, '퐁당!', t.color);
    this.say(`${t.name} 물에 빠짐`, '#7fd0ff');
  }

  hurt(t, dmg) {
    if (dmg <= 0 || t.dead) return;
    t.hp = Math.max(0, t.hp - dmg);
    t.hitTime = 0.6;
    this.label(t.x, t.y - 44, `-${dmg}`, t.color);
    this.say(`${t.name} -${dmg}`, '#ffb0a0');
    if (t.hp <= 0) {
      t.dead = true;
      this.addBlast('large', t.cx, t.cy);
      this.audio.explosion('large');
    }
  }

  // ---- shooting ----------------------------------------------------------------------------

  fire() {
    const t = this.active;
    if (this.fired || t.dead || this.teleportArmed) { this.charge = null; return; }
    const def = t.def.weapons[t.weapon];
    const power = Math.max(0.05, this.charge ?? 0);
    this.charge = null;
    t.lastPower = power;
    const shots = [];
    const count = def.count ?? 1;
    for (let i = 0; i < count; i++) shots.push({ at: 0, aim: t.aim + (i - (count - 1) / 2) * (def.spread ?? 0) });
    for (let i = 1; i < (def.burst ?? 1); i++) shots.push({ at: i * def.gap, aim: t.aim });
    // 2연발: the whole volley again half a second later.
    const rounds = this.turnItems.has('dual') ? 2 : 1;
    const opts = { mult: this.mult, speed: this.turnItems.has('power') ? POWER_SHOT : 1 };
    for (let r = 0; r < rounds; r++) {
      for (const s of shots) this.queue.push({ at: this.time + s.at + r * 0.5, run: () => this.launch(t, def, s.aim, power, opts) });
    }
    this.fired = true;
    this.state = 'fly';
    this.after = 0;
  }

  launch(t, def, aim, power, { mult = 1, speed: boost = 1 } = {}) {
    if (t.dead) return;
    const a = (aim * Math.PI) / 180;
    const ux = Math.cos(a) * t.facing, uy = -Math.sin(a);
    const speed = power * MAX_SPEED * def.speed * boost;
    this.projectiles.push({
      def, owner: t, x: t.cx + ux * 12, y: t.cy + uy * 12, vx: ux * speed, vy: uy * speed,
      age: 0, bounces: def.bounce ?? 0, mult,
    });
    this.audio.launch(def.sfx);
  }

  // The flight of every shell, shared with the computer player's aiming.
  static stepShell(p, wind) {
    p.vy += GRAVITY * p.def.gravity * DT;
    p.vx += wind * WIND_ACCEL * p.def.wind * DT;
  }

  updateProjectile(p) {
    p.age += DT;
    Game.stepShell(p, this.wind);
    const t = this.terrain;
    const steps = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * DT) || 1;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + (p.vx * DT) / steps, ny = p.y + (p.vy * DT) / steps;
      if (ny >= WATER_Y) { p.dead = true; this.splash(nx); return; }
      if (nx < -400 || nx > t.width + 400) { p.dead = true; return; }
      const hit = this.tanks.find((k) => !k.dead && (k !== p.owner || p.age > 0.25) && Math.hypot(k.cx - nx, k.cy - ny) < TANK_R);
      if (hit) { p.x = nx; p.y = ny; this.detonate(p); return; }
      if (t.solid(nx, ny)) {
        if (p.bounces > 0) {
          p.bounces--;
          const n = t.normal(nx, ny);
          const dot = p.vx * n.x + p.vy * n.y;
          if (dot < 0) { p.vx = (p.vx - 2 * dot * n.x) * 0.55; p.vy = (p.vy - 2 * dot * n.y) * 0.55; }
          this.audio.bounce();
          return;
        }
        p.x = nx; p.y = ny;
        this.detonate(p);
        return;
      }
      p.x = nx; p.y = ny;
    }
  }

  detonate(p) {
    p.dead = true;
    const { radius, damage, blast } = p.def;
    this.terrain.explode(p.x, p.y, radius);
    this.addBlast(blast, p.x, p.y);
    this.audio.explosion(blast);
    this.camera.shake = Math.min(10, radius / 4);
    for (const t of this.tanks) {
      if (t.dead) continue;
      const reach = radius + TANK_R;
      const d = Math.hypot(t.cx - p.x, t.cy - p.y);
      if (d >= reach) continue;
      this.hurt(t, Math.round(damage * p.mult * (0.35 + 0.65 * (1 - d / reach))));
    }
  }

  addBlast(size, x, y) {
    const id = this.manifest.blasts[size];
    if (this.sprites[id]) this.blasts.push({ id, x, y, age: 0 });
  }

  splash(x) {
    const id = this.manifest.blasts.splash;
    if (this.sprites[id]) this.blasts.push({ id, x, y: WATER_Y + 4, age: 0 });
    this.audio.splash();
  }

  label(x, y, text, color) {
    this.labels.push({ x, y, text, color, life: 1.4 });
  }

  // ---- simulation --------------------------------------------------------------------------

  update() {
    this.time += DT;
    if (this.menuPaused) return;
    if (this.cpuTurn && this.state === 'aim') this.ai.update();
    this.handleInput();
    this.pressed.clear();
    if (this.state === 'aim') {
      const before = Math.ceil(this.timer);
      this.timer -= DT;
      const now = Math.ceil(this.timer);
      if (now !== before && this.timer > 0) { this.audio.clock(now); this.tickAt = this.time; }
      if (this.timer <= 0) {
        if (this.charge != null) this.fire();
        else { this.state = 'fly'; this.fired = true; }
      }
    }
    const due = this.queue.filter((q) => q.at <= this.time);
    this.queue = this.queue.filter((q) => q.at > this.time);
    for (const q of due) q.run();
    for (const t of this.tanks) if (!t.dead) this.updateTank(t);
    for (const p of this.projectiles) this.updateProjectile(p);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const b of this.blasts) b.age += DT;
    this.blasts = this.blasts.filter((b) => b.age * 1000 < this.blastLength(b.id));
    for (const l of this.labels) { l.life -= DT; l.y -= 20 * DT; }
    for (const f of this.itemFx) f.life -= DT;
    this.itemFx = this.itemFx.filter((f) => f.life > 0);
    this.labels = this.labels.filter((l) => l.life > 0);
    if (this.banner) { this.banner.life -= DT; if (this.banner.life <= 0) this.banner = null; }
    // The tank whose turn it is fell in the water or blew up: the turn is over.
    if (this.state === 'aim' && this.active.dead) { this.state = 'fly'; this.fired = true; this.charge = null; }
    if (this.state === 'fly') {
      const busy = this.projectiles.length || this.queue.length || this.blasts.length || this.tanks.some((t) => !t.dead && t.fallFrom != null);
      this.after = busy ? 0 : this.after + DT;
      if (this.after >= AFTERMATH) this.nextTurn();
    }
    this.updateCamera();
  }

  blastLength(id) {
    return this.sprites[id].frames.reduce((s, f) => s + f[5], 0);
  }

  // ---- camera ------------------------------------------------------------------------------

  // Sizes are in CSS pixels; the canvas itself is drawn at the screen's pixel density so text
  // and the panel stay sharp on phones.
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.touch = document.body.classList.contains('touch');
    // The bottom bar: [arrow pad | panel | fire button] on touch screens, [panel | chat] on a
    // computer. The pad and the fire cluster stand in the corners like in Worms.
    const leftW = this.touch ? PAD_SIZE + 16 : 0;
    // On touch screens the right box is as wide as the fire cluster (#actions plus its margin),
    // so no button covers the panel.
    const rightW = this.touch ? ACTIONS_W + 22 : Math.round(clamp(W * 0.26, 220, 420));
    this.panelScale = clamp(Math.min((W - leftW - rightW) / (PANEL_MIN_W + 30), (H * (this.touch ? 0.21 : 0.16)) / 56), 1, 2);
    this.panelH = Math.round(56 * this.panelScale);
    this.bar = { leftW, rightW };
    // The touch buttons sit in the boxes at both ends of the bar.
    const root = document.documentElement.style;
    root.setProperty('--panel-h', `${this.panelH}px`);
    root.setProperty('--right-w', `${rightW}px`);
    const fit = Math.min((H - this.panelH) / VIEW_H, W / VIEW_W);
    this.zoomLevel = clamp(this.zoomLevel ?? 1, 0.6, 3);
    this.scale = fit * this.zoomLevel;
    this.viewW = W / this.scale;
    this.viewH = (H - this.panelH) / this.scale;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
  }

  zoomBy(factor) {
    this.zoomLevel = (this.zoomLevel ?? 1) * factor;
    const { x, y } = this.camera, cx = x + this.viewW / 2, cy = y + this.viewH / 2;
    this.resize();
    this.camera.x = cx - this.viewW / 2;
    this.camera.y = cy - this.viewH / 2;
  }

  pan(dx, dy) {
    this.camera.free = true;
    this.camera.x -= dx;
    this.camera.y -= dy;
  }

  toWorld(x, y) {
    return { x: x / this.scale + this.camera.x, y: y / this.scale + this.camera.y };
  }

  updateCamera() {
    const c = this.camera;
    const shell = this.projectiles[0];
    const focus = shell ?? (this.active && !this.active.dead ? { x: this.active.x, y: this.active.cy } : null);
    if (focus && !c.free) {
      const tx = focus.x - this.viewW / 2, ty = focus.y - this.viewH * 0.55;
      const k = c.snap ? 0.2 : shell ? 0.12 : 0.08;
      c.x += (tx - c.x) * k;
      c.y += (ty - c.y) * k;
      if (c.snap && Math.abs(tx - c.x) < 4) c.snap = false;
    }
    const w = this.terrain.width;
    if (this.viewW >= w + 40) c.x = (w - this.viewW) / 2;
    else c.x = clamp(c.x, -20, w - this.viewW + 20);
    // The bottom of the world sits on top of the panel. The view rises only a little for high
    // shells so the ground stays in sight; above that a marker shows where the shell is.
    c.y = clamp(c.y, WORLD_H - this.viewH - 60, WORLD_H - this.viewH);
    c.shake *= 0.88;
  }

  // ---- rendering ---------------------------------------------------------------------------

  render() {
    const { ctx, camera: c, scale } = this;
    const { W, H, dpr } = this;
    const sx = c.x + rand(-c.shake, c.shake), sy = c.y + rand(-c.shake, c.shake);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Background picture: covers the screen and drifts slowly as the view moves.
    {
      const b = this.back, k = Math.max(W / b.width, H / b.height) * 1.15;
      const roomX = b.width * k - W;
      const t = clamp((sx + 20) / Math.max(1, this.terrain.width - this.viewW + 40), 0, 1);
      const y = H - this.panelH - b.height * k * 0.92 + clamp((WORLD_H - this.viewH - sy) * scale * 0.15, 0, b.height * k * 0.08);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(b, -roomX * t, y, b.width * k, b.height * k);
    }
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, -sx * scale * dpr, -sy * scale * dpr);
    ctx.drawImage(this.terrain.canvas, 0, 0);
    for (const t of this.tanks) if (!t.dead) this.renderTank(t);
    for (const p of this.projectiles) this.renderProjectile(p);
    for (const b of this.blasts) this.renderBlast(b);
    this.renderWater();
    for (const t of this.tanks) if (!t.dead) this.renderTag(t);
    this.renderAim();
    for (const p of this.projectiles) if (p.y < sy + 4) this.offscreenMarker(p.x, sy + 4);
    for (const l of this.labels) this.text(l.text, l.x, l.y, l.color, Math.min(1, l.life * 2), 11);
    this.renderItemFx();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderChatOverlay();
    this.renderTimer();
    this.renderBanner();
    this.renderMinimap();
    this.renderPanel();
  }

  drawFrame(id, frame, x, y, flip = false, rotation = 0) {
    const s = this.sprites[id];
    if (!s) return;
    const [fx, fw, fh, ax, ay] = s.frames[frame % s.frames.length];
    const { ctx } = this;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (rotation) ctx.rotate(rotation);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(s.img, fx, 0, fw, fh, -ax, -ay, fw, fh);
    ctx.restore();
  }

  // Frame index for an animation that has been running `seconds`.
  frameAt(id, seconds, loop = true) {
    const frames = this.sprites[id]?.frames;
    if (!frames) return 0;
    const total = frames.reduce((s, f) => s + f[5], 0) || 1;
    let ms = seconds * 1000;
    ms = loop ? ms % total : Math.min(ms, total - 1);
    for (let i = 0; i < frames.length; i++) { ms -= frames[i][5]; if (ms < 0) return i; }
    return frames.length - 1;
  }

  // Five drawings per tank for the slope it stands on; index 2 is level ground.
  pose(t) {
    const ground = (x) => {
      for (let y = t.y - 8; y < t.y + 10; y++) if (this.terrain.solid(x, y)) return y;
      return t.y + 10;
    };
    const dy = ground(t.x + 7) - ground(t.x - 7);
    const tilt = Math.atan2(dy, 14) * t.facing;
    return clamp(Math.round(2 + tilt / 0.35), 0, 4);
  }

  renderTank(t) {
    const set = this.manifest.tanks[t.def.id];
    const pose = this.pose(t);
    let id = set.idle[pose], time = 0;
    if (t.hitTime > 0 && set.hit) { id = set.hit[pose]; time = 0.6 - t.hitTime; }
    else if (t.walking && t === this.active && set.walk) { id = set.walk[pose]; time = t.walkTime; }
    // The drawings face left.
    this.drawFrame(id, this.frameAt(id, time), t.x, t.y, t.facing > 0);
  }

  renderTag(t) {
    const { ctx } = this;
    this.text(t.name, t.x, t.y - 46, t.color, 1, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(t.x - 16), Math.round(t.y - 39), 32, 5);
    ctx.fillStyle = t.hp > 50 ? '#3ddc54' : t.hp > 25 ? '#ffd84a' : '#ff3b3b';
    ctx.fillRect(Math.round(t.x - 15), Math.round(t.y - 38), Math.round((30 * t.hp) / 100), 3);
  }

  renderProjectile(p) {
    const id = this.manifest.shells[p.def.shell];
    const frame = this.frameAt(id, p.age);
    if (p.def.spin) this.drawFrame(id, frame, p.x, p.y);
    else this.drawFrame(id, frame, p.x, p.y, false, Math.atan2(p.vy, p.vx));
  }

  // The moment an item is used: a ring and sparks burst from the tank, with the item's name.
  renderItemFx() {
    const t = this.active;
    if (!t || !this.itemFx.length) return;
    const { ctx } = this;
    const x = t.x, y = t.cy;
    this.itemFx.forEach((f, i) => {
      const k = 1 - f.life / 1.4;
      if (k < 0.45) {
        const e = k / 0.45;
        ctx.save();
        ctx.globalAlpha = 1 - e;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 8 + e * 30, 0, Math.PI * 2); ctx.stroke();
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2 + i;
          ctx.fillStyle = s % 2 ? '#fff' : f.color;
          ctx.fillRect(Math.round(x + Math.cos(a) * (12 + e * 26)) - 1, Math.round(y + Math.sin(a) * (12 + e * 26)) - 1, 3, 3);
        }
        ctx.restore();
      }
      this.text(`${f.name}!`, x, y - 50 - k * 14 - i * 13, f.color, Math.min(1, f.life * 2), 11);
    });
  }

  // A small yellow arrow on the top edge under a shell that flew above the view.
  offscreenMarker(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x + 5, y + 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  renderBlast(b) {
    this.drawFrame(b.id, this.frameAt(b.id, b.age, false), b.x, b.y);
  }

  renderWater() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(30,70,150,0.85)';
    ctx.fillRect(-500, WATER_Y, this.terrain.width + 1000, 700);
    ctx.fillStyle = 'rgba(160,210,255,0.8)';
    for (let x = -500; x < this.terrain.width + 500; x += 6) {
      ctx.fillRect(x, WATER_Y - 2 + Math.round(Math.sin(x / 18 + this.time * 2) * 1.5), 6, 2);
    }
  }

  // A team-coloured arrow shows the aim and the angle sits beside the tank.
  renderAim() {
    const t = this.active;
    if (!t || t.dead || this.state !== 'aim') return;
    const a = (t.aim * Math.PI) / 180;
    const ang = t.facing > 0 ? -a : Math.PI + a;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const { ctx } = this;
    ctx.save();
    ctx.translate(t.cx + ux * 30, t.cy + uy * 30);
    ctx.rotate(ang);
    ctx.fillStyle = t.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-1, 0); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
    this.text(`${Math.round(t.aim)}°`, t.x - t.facing * 24, t.cy + 6, '#fff', 1, 10);
  }

  text(str, x, y, color, alpha = 1, size = 10) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(str).width + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - size * 0.6), Math.ceil(w), Math.round(size * 1.2));
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y) + 1);
    ctx.restore();
  }

  // The original 00..20 numbers. From 10 they turn red, drop in each second and shake.
  renderTimer() {
    if (this.state !== 'aim') return;
    const n = clamp(Math.ceil(this.timer), 0, 20);
    const id = this.manifest.timer[n];
    const s = this.sprites[id];
    if (!s) return;
    const { W } = this;
    const k = W >= 1000 ? 2.5 : 2, w = 32 * k, h = 20 * k;
    let x = (W - w) / 2, y = 8;
    let img = s.img;
    if (n <= 10) {
      const since = this.time - (this.tickAt ?? -1);
      y -= Math.max(0, 0.15 - since) * 80;
      x += rand(-2.5, 2.5); y += rand(-1.5, 1.5);
      this.redDigits ??= {};
      img = this.redDigits[id] ??= tint(s.img, '#ff2a2a');
    }
    this.drawCrisp(img, k, 0, 0, 32, 20, Math.round(x), Math.round(y), w, h);
  }

  renderBanner() {
    const b = this.banner;
    if (!b) return;
    const { ctx } = this;
    const { W } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3);
    ctx.font = `bold ${W >= 1000 ? 20 : 15}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = W >= 1000 ? 80 : 62;
    const w = ctx.measureText(b.text).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 15, Math.ceil(w), 30);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, W / 2, y + 1);
    ctx.restore();
  }

  // The bottom bar spans the whole width like the PC original. The arcade panel is rebuilt
  // from its own columns to fit (see panelPieces): six item slots, a wider WIND / DELAY box and
  // long Energy / Power / Move bars. A box at the right holds the chat on a computer, or the
  // fire button on touch screens.
  panelLayout() {
    const { W, H, panelScale: k, panelH } = this;
    const { leftW, rightW } = this.bar;
    const x0 = leftW, panelW = W - leftW - rightW;
    const width = Math.max(PANEL_MIN_W, Math.round(panelW / k));
    const pieces = panelPieces(width);
    const kx = panelW / width;
    const y = H - panelH;
    return {
      k, kx, x0, y, width, pieces, panelW,
      // Picture column -> screen x, for the top rows (dial, items, wind) and the bars.
      Xt: (u) => x0 + mapColumn(pieces.top, u) * kx,
      Xb: (u) => x0 + mapColumn(pieces.bottom, u) * kx,
      right: { x: W - rightW, y, w: rightW, h: panelH },
    };
  }

  // Screen point -> weapon index when it lands on FIRE1 or FIRE2.
  panelWeaponAt(x, y) {
    const { k, kx, x0, y: py } = this.panelLayout();
    const u = (x - x0) / kx, v = (y - py) / k;
    if (Math.hypot(u - 91.5, v - 19) < 10) return 0;
    if (Math.hypot(u - 83.5, v - 39) < 10) return 1;
    return null;
  }

  // Screen point -> item index when it lands on one of the six slots.
  panelItemAt(x, y) {
    const { k, kx, x0, y: py } = this.panelLayout();
    const u = (x - x0) / kx, v = (y - py) / k;
    if (v < 6 || v > 26) return null;
    const i = Math.floor((u - SLOT_X + 2) / SLOT_PITCH);
    return i >= 0 && i < ITEMS.length && u - SLOT_X - i * SLOT_PITCH < SLOT_W + 2 ? i : null;
  }

  // Pixel art scaled by a whole number with hard edges, then down to its real size with
  // smoothing: sharp but without the uneven, broken-looking pixels of a fractional zoom.
  crisp(img, scale) {
    const n = Math.max(1, Math.ceil(scale * this.dpr));
    this.crispCache ??= new WeakMap();
    let sizes = this.crispCache.get(img);
    if (!sizes) this.crispCache.set(img, (sizes = {}));
    let c = sizes[n];
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width * n; c.height = img.height * n;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0, c.width, c.height);
      c.n = n;
      sizes[n] = c;
    }
    return c;
  }

  // Draws part (sx, sy, sw, sh) of `img` into the screen rectangle, using crisp().
  drawCrisp(img, scale, sx, sy, sw, sh, dx, dy, dw, dh) {
    const c = this.crisp(img, scale), n = c.n, { ctx } = this;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, sx * n, sy * n, sw * n, sh * n, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = false;
  }

  // The panel picture rebuilt `width` columns wide (cached per picture and width).
  composedPanel(img, width, pieces) {
    this.panelCache ??= new WeakMap();
    let byWidth = this.panelCache.get(img);
    if (!byWidth) this.panelCache.set(img, (byWidth = {}));
    if (byWidth[width]) return byWidth[width];
    const c = document.createElement('canvas');
    c.width = width; c.height = 56;
    const x = c.getContext('2d');
    for (const [rows, list] of [[[0, PANEL_SPLIT], pieces.top], [[PANEL_SPLIT, 56], pieces.bottom]]) {
      let dx = 0;
      for (const [s0, s1, n] of list) {
        const w = s1 - s0;
        if (w === 1) { x.drawImage(img, s0, rows[0], 1, rows[1] - rows[0], dx, rows[0], n, rows[1] - rows[0]); dx += n; continue; }
        for (let i = 0; i < n; i++, dx += w) x.drawImage(img, s0, rows[0], w, rows[1] - rows[0], dx, rows[0], w, rows[1] - rows[0]);
      }
    }
    return (byWidth[width] = c);
  }

  renderPanel() {
    const { ctx } = this;
    const t = this.panelTank;
    if (!t) return;
    const s = this.sprites[this.manifest.panels[PLAYERS[t.player].panel]];
    const { k, kx, x0, y: py, width, pieces, panelW, Xt, Xb, right } = this.panelLayout();
    if (s) this.drawCrisp(this.composedPanel(s.img, width, pieces), k, 0, 0, width, 56, x0, py, panelW, 56 * k);
    const rect = (X, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(X(x), py + y * k, X(x + w) - X(x), h * k); };
    const font = (size) => `bold ${Math.round(size * k)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    const mine = t === this.active && this.state === 'aim';
    // Energy, Power (with last turn's power as a yellow mark), Move.
    rect(Xb, 140, 29, (140 * t.hp) / 100, 6, '#3ddc54');
    ctx.font = font(6); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(t.hp, Xb(278), py + 32.5 * k);
    const p0 = Xb(140), p1 = Xb(280);
    if (mine && this.charge != null) {
      const g = ctx.createLinearGradient(p0, 0, p1, 0);
      g.addColorStop(0, '#ffe25a'); g.addColorStop(1, '#ff3b3b');
      ctx.fillStyle = g;
      ctx.fillRect(p0, py + 38 * k, (p1 - p0) * this.charge, 6 * k);
    }
    // Tenths along the power bar, to aim by.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(p0 + ((p1 - p0) * i) / 10), py + 38 * k, 1, 6 * k);
    if (t.lastPower != null) {
      const mx = p0 + (p1 - p0) * t.lastPower, my = py + 37 * k;
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, my + 1); ctx.lineTo(mx - 5, my - 7); ctx.lineTo(mx + 5, my - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    rect(Xb, 140, 47, 140 * (t === this.active ? this.move / MOVE_MAX : 1), 6, '#ffb52e');
    // Wind grows from the centre mark of the WIND bar; its strength sits in the DELAY bar.
    const wind = this.wind ?? 0;
    const wc = Xt(283), wl = Xt(259), wr = Xt(306);
    ctx.fillStyle = '#7fd0ff';
    if (wind < 0) ctx.fillRect(wc + (wc - wl) * wind, py + 8 * k, (wl - wc) * wind, 4 * k);
    else if (wind > 0) ctx.fillRect(wc, py + 8 * k, (wr - wc) * wind, 4 * k);
    ctx.font = font(7); ctx.fillStyle = '#cfe8ff'; ctx.textAlign = 'right';
    ctx.fillText(`${wind < 0 ? '◀ ' : wind > 0 ? '▶ ' : ''}${Math.round(Math.abs(wind) * 10)}`, Xt(305), py + 19.5 * k);
    // Angle dial: the needle points the way the tank aims.
    {
      const cx = Xt(39.5), cy = py + 30.5 * k, r = 19 * k, a = (t.aim * Math.PI) / 180;
      const ang = t.facing > 0 ? -a : Math.PI + a;
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(2, 1.6 * k); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
      ctx.font = font(10); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(t.aim), cx, cy + 9 * k);
    }
    // FIRE1 / FIRE2: the chosen attack is lit.
    if (t.weapon === 0) rect(Xt, 87, 14, 10, 11, '#ffd84a'); else rect(Xt, 79, 34, 10, 11, '#ffd84a');
    // Items: icon, how many are left; the ones used this turn glow.
    this.itemIcons ??= {};
    const sprites = { shell: this.sprites[this.manifest.shells.carrot], tank: this.sprites[this.manifest.tanks[t.def.id].idle[2]] };
    ITEMS.forEach((item, i) => {
      // Slots are counted in the rebuilt panel (slots 2-5 are copies), not in the picture.
      const sx = x0 + (SLOT_X + i * SLOT_PITCH) * kx, sy = py + 8 * k, sw = SLOT_W * kx, sh = 17 * k;
      const icon = (this.itemIcons[`${item.id}-${t.def.id}`] ??= itemIcon(item, sprites));
      const used = t === this.active && this.turnItems.has(item.id);
      ctx.save();
      if (!t.items[item.id] && !used) ctx.globalAlpha = 0.3;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(icon, sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.restore();
      if (used) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh); }
      ctx.font = font(5.5); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      ctx.strokeText(t.items[item.id], sx + sw - 1, sy + sh);
      ctx.fillStyle = '#fff';
      ctx.fillText(t.items[item.id], sx + sw - 1, sy + sh);
    });
    ctx.textBaseline = 'middle';
    // TURN: lit in the player's colour when it is their turn.
    rect(Xb, 290, 30, 23, 15, mine ? t.color : '#20242c');
    ctx.font = font(6); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(mine ? 'MY' : this.state === 'aim' ? '상대' : '', Xb(301.5), py + 37.5 * k);
    // Touch screens leave the corners open so the field shows around the arrow pad and the
    // fire buttons; a computer gets the chat box.
    if (!this.touch) {
      this.renderBox(right, k);
      this.renderChat(right, k);
    }
    if (!mine) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0, py, panelW, 56 * k); }
  }

  // The chat box at the right end of the bar, in the same blue metal as the panel.
  renderBox(b, k) {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, '#5d8fe0'); g.addColorStop(0.5, '#2f5fb8'); g.addColorStop(1, '#1d3f86');
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y + 4 * k, b.w, b.h - 4 * k);
    ctx.fillStyle = '#a6e9f8';
    ctx.fillRect(b.x, b.y + 4 * k, b.w, Math.max(1, k));
    const m = 4 * k;
    ctx.fillStyle = '#000';
    ctx.fillRect(b.x + m - k, b.y + 8 * k - k, b.w - 2 * m + 2 * k, b.h - 12 * k + 2 * k);
    ctx.fillStyle = '#06101f';
    ctx.fillRect(b.x + m, b.y + 8 * k, b.w - 2 * m, b.h - 12 * k);
  }

  // Chat and game messages inside the right box (computer).
  renderChat(b, k) {
    const { ctx } = this;
    const m = 4 * k, inner = { x: b.x + m, y: b.y + 8 * k, w: b.w - 2 * m, h: b.h - 12 * k };
    const size = Math.max(11, Math.round(6 * k));
    ctx.save();
    ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
    ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const lineH = size + 4;
    const inputY = inner.y + inner.h - 4;
    if (!this.chatOpen) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Enter: 채팅', inner.x + 6, inputY);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(inner.x + 3, inputY - lineH, inner.w - 6, 1);
    let y = inputY - lineH - 2;
    for (let i = this.log.length - 1; i >= 0 && y > inner.y + 2; i--, y -= lineH) {
      ctx.fillStyle = this.log[i].color;
      ctx.fillText(this.log[i].text, inner.x + 6, y);
    }
    ctx.restore();
  }

  // Touch screens: recent messages float on the left above the arrow pad, then fade.
  renderChatOverlay() {
    if (!this.touch) return;
    const { ctx } = this;
    const size = 13, lineH = 18;
    let y = this.H - 4 - PAD_SIZE - 10;
    ctx.save();
    ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const recent = this.log.filter((l) => this.time - l.time < 8).slice(-5);
    for (let i = recent.length - 1; i >= 0; i--, y -= lineH) {
      const l = recent[i];
      ctx.globalAlpha = clamp(8 - (this.time - l.time), 0, 1);
      const w = ctx.measureText(l.text).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, y - lineH + 2, w, lineH - 2);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 15, y - 1);
    }
    ctx.restore();
  }

  // Top-right map of the whole field: ground, tanks, shells and the part on screen.
  renderMinimap() {
    const { ctx } = this;
    const { W } = this;
    const w = Math.round(this.touch ? clamp(W * 0.2, 140, 190) : clamp(W * 0.18, 180, 280));
    const k = w / this.terrain.width, h = Math.round(WORLD_H * k);
    const x = W - w - 8, y = 8;
    ctx.fillStyle = 'rgba(8,16,40,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.strokeStyle = 'rgba(166,233,248,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain.canvas, x, y, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(60,110,200,0.7)';
    ctx.fillRect(x, y + WATER_Y * k, w, h - WATER_Y * k);
    for (const t of this.tanks) {
      if (t.dead) continue;
      ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x + t.x * k) - 3, Math.round(y + t.cy * k) - 3, 6, 6);
      ctx.fillStyle = t.color; ctx.fillRect(Math.round(x + t.x * k) - 2, Math.round(y + t.cy * k) - 2, 4, 4);
    }
    ctx.fillStyle = '#ffd84a';
    for (const p of this.projectiles) ctx.fillRect(Math.round(x + p.x * k) - 1, Math.round(y + clamp(p.y, 0, WORLD_H) * k) - 1, 2, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    const c = this.camera;
    ctx.strokeRect(Math.round(x + c.x * k) + 0.5, Math.round(y + c.y * k) + 0.5, Math.round(this.viewW * k), Math.round(this.viewH * k));
  }

  say(text, color = '#cfd8e6') {
    this.log.push({ text, color, time: this.time });
    if (this.log.length > 40) this.log.shift();
  }
}

// A copy of a picture recoloured with `color` (keeps its shading and transparency).
function tint(img, color) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(img, 0, 0);
  return c;
}

// [first column, end column, times] pieces of the 320-column panel picture for a panel `width`
// columns wide. One-column pieces are stretched instead of repeated.
//   top:    dial and FIRE, slot 1, slot 2 four times (slots 2-5), slot 4 as the last slot and
//           the frame end, then the WIND / DELAY box widened on both sides of the wind centre
//           (the small window between them is left out)
//   bottom: the bars, widened at column 210
function panelPieces(width) {
  const room = width - (129 + 4 * SLOT_PITCH + 23 + 40 + 24 + 29);
  const a = Math.floor(room / 2), b = room - a;
  return {
    top: [[0, 129, 1], [129, 151, 4], [173, 196, 1], [225, 265, 1], [265, 266, a], [266, 290, 1], [290, 291, b], [291, 320, 1]],
    bottom: [[0, 210, 1], [210, 211, width - 319], [211, 320, 1]],
  };
}

// Picture column -> column in the rebuilt panel (first copy of a repeated piece).
function mapColumn(pieces, u) {
  let dx = 0;
  for (const [s0, s1, n] of pieces) {
    const w = s1 - s0;
    if (u >= s0 && u < s1) return dx + (w === 1 ? (u - s0) * n : u - s0);
    dx += w === 1 ? n : w * n;
  }
  return dx;
}
