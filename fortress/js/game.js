// One match: two tanks taking turns on destructible ground. The simulation runs in fixed
// steps (update) and draws every animation frame (render); the bottom panel and the turn
// clock are the original arcade pictures, filled in on the canvas.
import { Terrain } from './terrain.js';
import { AI } from './ai.js';

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
    this.state = 'aim';
    this.camera.free = false;
    this.camera.snap = true;
    this.banner = { text: `${t.name} 차례`, color: t.color, life: 1.4 };
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
  }

  hurt(t, dmg) {
    if (dmg <= 0 || t.dead) return;
    t.hp = Math.max(0, t.hp - dmg);
    t.hitTime = 0.6;
    this.label(t.x, t.y - 44, `-${dmg}`, t.color);
    if (t.hp <= 0) {
      t.dead = true;
      this.addBlast('large', t.cx, t.cy);
      this.audio.explosion('large');
    }
  }

  // ---- shooting ----------------------------------------------------------------------------

  fire() {
    const t = this.active;
    if (this.fired || t.dead) return;
    const def = t.def.weapons[t.weapon];
    const power = Math.max(0.05, this.charge ?? 0);
    this.charge = null;
    t.lastPower = power;
    const shots = [];
    const count = def.count ?? 1;
    for (let i = 0; i < count; i++) shots.push({ at: 0, aim: t.aim + (i - (count - 1) / 2) * (def.spread ?? 0) });
    for (let i = 1; i < (def.burst ?? 1); i++) shots.push({ at: i * def.gap, aim: t.aim });
    for (const s of shots) this.queue.push({ at: this.time + s.at, run: () => this.launch(t, def, s.aim, power) });
    this.fired = true;
    this.state = 'fly';
    this.after = 0;
  }

  launch(t, def, aim, power) {
    if (t.dead) return;
    const a = (aim * Math.PI) / 180;
    const ux = Math.cos(a) * t.facing, uy = -Math.sin(a);
    const speed = power * MAX_SPEED * def.speed;
    this.projectiles.push({
      def, owner: t, x: t.cx + ux * 12, y: t.cy + uy * 12, vx: ux * speed, vy: uy * speed,
      age: 0, bounces: def.bounce ?? 0,
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
      this.hurt(t, Math.round(damage * (0.35 + 0.65 * (1 - d / reach))));
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

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.touch = document.body.classList.contains('touch');
    this.panelScale = this.touch ? clamp((W - 300) / 320, 1, 1.4) : clamp(W / 640, 1, 2);
    this.panelH = Math.round(56 * this.panelScale);
    const fit = Math.min((H - this.panelH) / VIEW_H, W / VIEW_W);
    this.zoomLevel = clamp(this.zoomLevel ?? 1, 0.6, 3);
    this.scale = fit * this.zoomLevel;
    this.viewW = W / this.scale;
    this.viewH = (H - this.panelH) / this.scale;
    this.canvas.width = W;
    this.canvas.height = H;
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
    const W = this.canvas.width, H = this.canvas.height;
    const sx = c.x + rand(-c.shake, c.shake), sy = c.y + rand(-c.shake, c.shake);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    ctx.setTransform(scale, 0, 0, scale, -sx * scale, -sy * scale);
    ctx.drawImage(this.terrain.canvas, 0, 0);
    for (const t of this.tanks) if (!t.dead) this.renderTank(t);
    for (const p of this.projectiles) this.renderProjectile(p);
    for (const b of this.blasts) this.renderBlast(b);
    this.renderWater();
    for (const t of this.tanks) if (!t.dead) this.renderTag(t);
    this.renderAim();
    for (const p of this.projectiles) if (p.y < sy + 4) this.offscreenMarker(p.x, sy + 4);
    for (const l of this.labels) this.text(l.text, l.x, l.y, l.color, Math.min(1, l.life * 2), 11);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.renderTimer();
    this.renderBanner();
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
    const W = this.canvas.width;
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
    this.ctx.drawImage(img, 0, 0, 32, 20, Math.round(x), Math.round(y), w, h);
  }

  renderBanner() {
    const b = this.banner;
    if (!b) return;
    const { ctx } = this;
    const W = this.canvas.width;
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

  // Where the panel sits on screen, for drawing and for taps on FIRE1 / FIRE2.
  panelRect() {
    const k = this.panelScale, W = this.canvas.width, H = this.canvas.height;
    return { x: Math.round((W - 320 * k) / 2), y: H - this.panelH, k };
  }

  // Screen point -> weapon index when it lands on FIRE1 or FIRE2.
  panelWeaponAt(x, y) {
    const { x: px, y: py, k } = this.panelRect();
    const u = (x - px) / k, v = (y - py) / k;
    if (Math.hypot(u - 91.5, v - 19) < 10) return 0;
    if (Math.hypot(u - 83.5, v - 39) < 10) return 1;
    return null;
  }

  renderPanel() {
    const { ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, H - this.panelH, W, this.panelH);
    const t = this.panelTank;
    if (!t) return;
    const s = this.sprites[this.manifest.panels[PLAYERS[t.player].panel]];
    const { x: px, y: py, k } = this.panelRect();
    if (s) ctx.drawImage(s.img, 0, 0, 320, 56, px, py, 320 * k, 56 * k);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(px + x * k, py + y * k, w * k, h * k); };
    const font = (size) => `bold ${Math.round(size * k)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;
    const mine = t === this.active && this.state === 'aim';
    // Energy, Power (with last turn's power as a yellow mark), Move.
    R(140, 29, (140 * t.hp) / 100, 6, '#3ddc54');
    ctx.font = font(6); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(t.hp, px + 278 * k, py + 32.5 * k);
    if (mine && this.charge != null) {
      const g = ctx.createLinearGradient(px + 140 * k, 0, px + 280 * k, 0);
      g.addColorStop(0, '#ffe25a'); g.addColorStop(1, '#ff3b3b');
      ctx.fillStyle = g;
      ctx.fillRect(px + 140 * k, py + 38 * k, 140 * this.charge * k, 6 * k);
    }
    if (t.lastPower != null) {
      const mx = px + (140 + 140 * t.lastPower) * k, my = py + 37 * k;
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, my + 1); ctx.lineTo(mx - 5, my - 7); ctx.lineTo(mx + 5, my - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    R(140, 47, 140 * (t === this.active ? this.move / MOVE_MAX : 1), 6, '#ffb52e');
    // Wind grows from the centre mark.
    const wind = this.wind ?? 0;
    if (wind < 0) R(282 + 23 * wind, 8, -23 * wind, 4, '#7fd0ff');
    else if (wind > 0) R(283, 8, 23 * wind, 4, '#7fd0ff');
    ctx.font = font(6); ctx.fillStyle = '#cfe8ff'; ctx.textAlign = 'center';
    ctx.fillText(`${wind < 0 ? '◀' : wind > 0 ? '▶' : ''} ${Math.round(Math.abs(wind) * 10)}`, px + 268 * k, py + 19.5 * k);
    // Angle dial: the needle points the way the tank aims.
    {
      const cx = px + 39.5 * k, cy = py + 30.5 * k, r = 19 * k, a = (t.aim * Math.PI) / 180;
      const ang = t.facing > 0 ? -a : Math.PI + a;
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(2, 1.6 * k);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
      ctx.font = font(10); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(t.aim), cx, cy + 9 * k);
    }
    // FIRE1 / FIRE2: the chosen attack is lit.
    if (t.weapon === 0) R(87, 14, 10, 11, '#ffd84a'); else R(79, 34, 10, 11, '#ffd84a');
    // Weapon name in the small window right of the item slots.
    ctx.font = font(6); ctx.fillStyle = '#ffd84a'; ctx.textAlign = 'center';
    ctx.fillText(t.def.weapons[t.weapon].name, px + 210.5 * k, py + 18 * k, 25 * k);
    // TURN: lit in the player's colour when it is their turn.
    R(290, 30, 23, 15, mine ? t.color : '#20242c');
    ctx.font = font(6); ctx.fillStyle = '#fff';
    ctx.fillText(mine ? 'MY' : this.state === 'aim' ? '상대' : '', px + 301.5 * k, py + 37.5 * k);
    if (!mine) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py, 320 * k, 56 * k); }
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
