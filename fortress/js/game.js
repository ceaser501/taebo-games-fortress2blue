// One match: two tanks taking turns on destructible ground. The simulation runs in fixed
// steps (update) and draws every animation frame (render); the bottom panel and the turn
// clock are the original arcade pictures, filled in on the canvas.
import { Terrain } from './terrain.js';
import { AI } from './ai.js';
import { ITEMS, POWER_SHOT, HEAL } from './items.js';

export const WORLD_H = 480;
export const GRAVITY = 270;
export const MAX_SPEED = 520;
export const WIND_ACCEL = 38;
export const DT = 1 / 60;
export const CHARGE_TIME = 1.6;
const TURN_TIME = 20;
// Move gauge for a tank with movement 3; each point of movement adds or takes 25%.
const MOVE_BASE = 90;
const moveMax = (def) => MOVE_BASE * (0.5 + def.movement / 6);
const WALK_SPEED = 30;
const MAX_CLIMB = 5;
const AIM_SPEED = 40;
const AIM_REPEAT = 0.25;
const FALL_SAFE = 24;
const FALL_DAMAGE = 0.6;
const TANK_R = 13;
const AFTERMATH = 0.6;
// Water fills everything below the bottom of the map (like Worms); its surface sits on the top
// edge of the bottom bar and a tank that drops in is out.
export const WATER_Y = WORLD_H;
// What the view shows at zoom 1: at least this many world pixels across and up.
const VIEW_W = 910, VIEW_H = 378;
// The panel picture is rebuilt from its own columns: rows above PANEL_SPLIT hold the dial,
// item slots and WIND / DELAY, the rows below the Energy / Power / Move bars.
const PANEL_SPLIT = 26;
// Item tray: from column ITEMS_X of the rebuilt panel, ITEMS_MIN..ITEMS_MAX columns wide, with
// the cards reaching ITEMS_TOP rows above the panel. Only the item labels use short names.
const ITEMS_X = 104, ITEMS_MIN = 100, ITEMS_MAX = 125, ITEMS_TOP = 4;
const ITEM_LABELS = { dual: '2연발', double: '공격 2배', power: '파워샷', heal: '회복', teleport: '순간이동' };
// The WIND bar after reshapeWindBox(): from the end of the WIND label to column 306.
const WIND_LEFT = 259, WIND_CENTRE = 283;
// Columns in the top rows without the stretchy ones; the panel is never narrower.
// The panel starts at the angle dial's red ring: the frame left of it is cut off.
const PANEL_CUT = 7;
// The dial's red ring (centre and radii, in picture columns and rows); left of its centre only
// the ring is kept, so the panel's left end is round.
const DIAL_X = 40, DIAL_Y = 31, DIAL_RX = 32.6, DIAL_RY = 31.5;
// The wind bar's middle piece is cut WIND_TRIM columns shorter than in the picture.
const WIND_TRIM = 10;
const PANEL_FIXED = ITEMS_X - PANEL_CUT + 5 + 40 + 24 - WIND_TRIM + 18;
const PANEL_MIN_W = PANEL_FIXED + ITEMS_MIN + 12;
// Touch screens: the panel is sized as if the tray still had six cards and the wind bar its
// full length (so it stays as large as before), then drawn that much narrower, with even margins.
const ONE_CARD = 20;
const TOUCH_PANEL_W = PANEL_MIN_W;
// Height of the arrow pad on touch screens (#pad in style.css).
const PAD_SIZE = 3 * 38 + 2 * 2;
// Touch screens: the arrow pad's right edge (6 + 3 * 38 + 2 * 2) and the 1번 button's left edge
// (#actions scaled to 0.78: 6 + (73 + 48) * 0.78), measured from their sides of the screen. The
// panel sits centred between them with the same gap on both sides.
const PAD_RIGHT = 124, FIRE_LEFT = 100.4, SIDE_GAP = 8;

// Player 1 uses the red panel, player 2 the blue one.
export const PLAYERS = [
  { color: '#ff4a3d', panel: 0 },
  { color: '#3d9bff', panel: 6 },
];

// Text in the Worms HUD style: a heavy, rounded sans with an outline or a pill behind it.
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", system-ui, sans-serif';
const font = (size, weight = 800) => `${weight} ${size}px ${FONT}`;

const rand = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Tank {
  constructor(player, def, name, x, y) {
    Object.assign(this, { player, def, name, x, y });
    this.hp = 100;
    this.facing = 1;
    this.aim = clamp(45, def.angle[0], def.angle[1]);
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
  // Online play: the host simulates and calls `emit` with effects for the guest; the guest
  // builds a `replica` from the host's start message and only draws the host's snapshots.
  // `myPlayer` is the player at this screen (null = everyone, as in local play).
  constructor({ canvas, manifest, sprites, itemIcons = {}, audio, map, players, onEnd, onTurn = () => {}, emit = null, replica = null, myPlayer = null }) {
    Object.assign(this, { canvas, manifest, sprites, itemIcons, audio, onEnd, onTurn, myPlayer });
    this.emit = emit || (() => {});
    this.replica = !!replica;
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
    if (replica) {
      this.tanks = replica.tanks.map(([x, y], i) => {
        const t = new Tank(i, players[i].tank, players[i].name, x, y);
        t.items = Object.fromEntries(ITEMS.map((it) => [it.id, it.count]));
        return t;
      });
      this.turn = 0;
      this.state = 'idle';
      this.wind = 0;
      this.move = 0;
      this.resize();
      return;
    }
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
        if (y != null && y < WATER_Y - 30 && t.solid(x - 6, y + 2) && t.solid(x + 6, y + 2)) break;
      }
      const tank = new Tank(i, p.tank, p.name, x, y ?? 0);
      tank.items = Object.fromEntries(ITEMS.map((it) => [it.id, it.count]));
      tank.facing = x < t.width / 2 ? 1 : -1;
      return tank;
    });
  }

  get active() { return this.tanks[this.turn]; }
  get cpuTurn() { return !!this.players[this.turn]?.cpu; }
  // Whether the person at this screen may act now.
  get myTurn() { return !this.cpuTurn && (this.myPlayer == null || this.active?.player === this.myPlayer); }
  // The panel at the bottom belongs to the person at this screen: the only human, or in a
  // two-person game on one screen, whoever is playing.
  get panelTank() {
    if (this.myPlayer != null) return this.tanks[this.myPlayer];
    const humans = this.tanks.filter((t) => !this.players[t.player].cpu);
    return humans.length === 1 ? humans[0] : this.active;
  }

  nextTurn() {
    if (this.checkOver()) return;
    do this.turn = (this.turn + 1) % this.tanks.length; while (this.active.dead);
    const t = this.active;
    this.wind = Math.round(rand(-1, 1) * 10) / 10;
    this.timer = TURN_TIME;
    this.move = moveMax(t.def);
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
    this.setBanner(`${t.name} 차례`, t.color, 1.4);
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
    this.setBanner(this.active.def.weapons[i].name, '#ffd84a', 0.9);
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
      if (this.pressed.has('ArrowUp') || this.pressed.has('ArrowDown')) { t.aim = clamp(t.aim + turn, ...t.def.angle); this.aimHeld = 0; }
      else if (turn) {
        this.aimHeld += DT;
        if (this.aimHeld > AIM_REPEAT) t.aim = clamp(t.aim + turn * AIM_SPEED * DT, ...t.def.angle);
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
    else if (id === 'heal') {
      const gain = Math.min(HEAL, 100 - t.hp);
      t.hp += gain;
      this.label(t.x, t.y - 44, `+${gain}`, '#6be06b');
    } else if (id === 'teleport') {
      this.teleportArmed = true;
      this.setBanner('이동할 곳을 탭(클릭)하세요', '#c58bff', 3);
    }
    const item = ITEMS.find((it) => it.id === id);
    this.itemPop(item.id);
    this.say(`${t.name}: ${item.name}`, item.color);
    this.audio.item();
  }

  itemPop(id) {
    const item = ITEMS.find((it) => it.id === id);
    if (!item) return;
    this.itemFx.push({ name: item.name, color: item.color, life: 1.4 });
    this.emit({ t: 'itemfx', a: [id] });
  }

  setBanner(text, color, life) {
    this.banner = text ? { text, color, life } : null;
    this.emit({ t: 'banner', a: [text, color, life] });
  }

  // A tap on the field; only the armed teleport uses it.
  clickAt(world) {
    if (this.teleportArmed && !this.cpuTurn) this.teleport(world);
  }

  teleport(world) {
    const t = this.active;
    const x = clamp(Math.round(world.x), 8, this.terrain.width - 8);
    const y = this.terrain.surfaceBelow(x, Math.round(world.y) - 30);
    if (y == null || y >= WATER_Y - 10 || this.terrain.solid(x, y - 20)) {
      this.label(world.x, world.y, '갈 수 없는 곳이에요', t.color);
      return;
    }
    Object.assign(t, { x, y, vy: 0, fallFrom: null });
    this.teleportArmed = false;
    this.setBanner(null);
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
    this.crater(p.x, p.y, radius);
    this.addBlast(blast, p.x, p.y);
    this.audio.explosion(blast);
    this.camera.shake = Math.min(10, radius / 4);
    for (const t of this.tanks) {
      if (t.dead) continue;
      const reach = radius + TANK_R;
      const d = Math.hypot(t.cx - p.x, t.cy - p.y);
      if (d >= reach) continue;
      // Defence 3 takes the hit as is; each point either way is 10%.
      const armour = 1.3 - t.def.defence * 0.1;
      this.hurt(t, Math.round(damage * p.mult * armour * (0.35 + 0.65 * (1 - d / reach))));
    }
  }

  crater(x, y, r) {
    this.terrain.explode(x, y, r);
    this.emit({ t: 'crater', a: [r1(x), r1(y), r] });
  }

  addBlast(size, x, y) {
    this.emit({ t: 'blast', a: [size, r1(x), r1(y)] });
    const id = this.manifest.blasts[size];
    if (this.sprites[id]) this.blasts.push({ id, x, y, age: 0 });
  }

  splash(x) {
    this.emit({ t: 'splash', a: [r1(x)] });
    const id = this.manifest.blasts.splash;
    if (this.sprites[id]) this.blasts.push({ id, x, y: WATER_Y + 4, age: 0 });
    if (!this.replica) this.audio.splash();
  }

  label(x, y, text, color) {
    this.emit({ t: 'label', a: [r1(x), r1(y), text, color] });
    this.labels.push({ x, y, text, color, life: 1.4 });
  }

  // ---- simulation --------------------------------------------------------------------------

  update() {
    this.time += DT;
    if (this.replica) { this.updateEffects(); this.updateCamera(); return; }
    if (this.menuPaused || this.paused) return;
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
    this.updateEffects();
    // The tank whose turn it is fell in the water or blew up: the turn is over.
    if (this.state === 'aim' && this.active.dead) { this.state = 'fly'; this.fired = true; this.charge = null; }
    if (this.state === 'fly') {
      const busy = this.projectiles.length || this.queue.length || this.blasts.length || this.tanks.some((t) => !t.dead && t.fallFrom != null);
      this.after = busy ? 0 : this.after + DT;
      if (this.after >= AFTERMATH) this.nextTurn();
    }
    this.updateCamera();
  }

  // Explosions, floating numbers, item bursts and the banner age and fade.
  updateEffects() {
    for (const b of this.blasts) b.age += DT;
    this.blasts = this.blasts.filter((b) => b.age * 1000 < this.blastLength(b.id));
    for (const l of this.labels) { l.life -= DT; l.y -= 20 * DT; }
    for (const f of this.itemFx) f.life -= DT;
    this.itemFx = this.itemFx.filter((f) => f.life > 0);
    this.labels = this.labels.filter((l) => l.life > 0);
    for (const t of this.tanks) t.hitTime = Math.max(0, t.hitTime - (this.replica ? DT : 0));
    if (this.banner) {
      this.banner.life -= DT;
      this.banner.age = (this.banner.age ?? 0) + DT;
      if (this.banner.life <= 0) this.banner = null;
    }
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
    const leftW = this.touch ? PAD_RIGHT + SIDE_GAP : 0;
    // On touch screens the right box is as wide as the fire cluster (#actions plus its margin),
    // so no button covers the panel.
    const rightW = this.touch ? FIRE_LEFT + SIDE_GAP : Math.round(clamp(W * 0.26, 220, 420));
    this.panelScale = clamp(Math.min((W - leftW - rightW) / (this.touch ? TOUCH_PANEL_W + ONE_CARD + WIND_TRIM : PANEL_MIN_W), (H * (this.touch ? 0.29 : 0.16)) / 56), 1, 2.4);
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
    // The bottom of the map (the water line) sits on the top edge of the bottom bar.
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
    // The water line sits on the top edge of the bottom bar. The view rises only a little for
    // high shells so the ground stays in sight; above that a marker shows where the shell is.
    c.y = clamp(c.y, WORLD_H - this.viewH - 60, WORLD_H - this.viewH);
    // Never leave the tank or shell being followed behind the bottom bar.
    if (focus) c.y = Math.max(c.y, focus.y + 40 - (this.H - this.panelH) / this.scale);
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
      const y = H - b.height * k * 0.92 + clamp((WORLD_H - this.viewH - sy) * scale * 0.15, 0, b.height * k * 0.08);
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
    for (const l of this.labels) this.shout(l.text, l.x, l.y, l.color, Math.min(1, l.life * 2), 13);
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

  // Name pill and a rounded health bar over the tank.
  renderTag(t) {
    const { ctx } = this;
    this.text(t.name, t.x, t.y - 48, t.color, 1, 9);
    const w = 32, h = 5, x = t.x - w / 2, y = t.y - 40;
    ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 3.5);
    ctx.fillStyle = 'rgba(8,14,28,0.85)'; ctx.fill();
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    const col = t.hp > 50 ? ['#7dff8f', '#28b64a'] : t.hp > 25 ? ['#ffe680', '#e0a800'] : ['#ff8a7a', '#d42a2a'];
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.beginPath(); ctx.roundRect(x, y, (w * t.hp) / 100, h, 2.5);
    ctx.fillStyle = g; ctx.fill();
  }

  renderProjectile(p) {
    const id = this.manifest.shells[p.def.shell];
    const frame = this.frameAt(id, p.age);
    if (p.def.spin) this.drawFrame(id, frame, p.x, p.y);
    // Pointed shells keep their level drawing and turn along the flight. The anchor sits on
    // the nose, so a drawing with its anchor on the left faces left and is turned half round.
    else {
      const [, fw, , ax] = this.sprites[id].frames[0];
      this.drawFrame(id, 0, p.x, p.y, false, Math.atan2(p.vy, p.vx) + (ax < fw / 2 ? Math.PI : 0));
    }
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
      this.shout(`${f.name}!`, x, y - 50 - k * 14 - i * 13, f.color, Math.min(1, f.life * 2), 12);
    });
  }

  // A small yellow arrow on the top edge under a shell that flew above the view.
  offscreenMarker(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x + 5, y + 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  renderWater() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(30,70,150,0.9)';
    ctx.fillRect(-500, WATER_Y, this.terrain.width + 1000, 700);
    ctx.fillStyle = 'rgba(160,210,255,0.8)';
    for (let x = -500; x < this.terrain.width + 500; x += 6) {
      ctx.fillRect(x, WATER_Y - 2 + Math.round(Math.sin(x / 18 + this.time * 2) * 1.5), 6, 2);
    }
  }

  renderBlast(b) {
    this.drawFrame(b.id, this.frameAt(b.id, b.age, false), b.x, b.y);
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

  // A tag: dark rounded pill, thin border in `color` with a soft glow, text in `color`.
  text(str, x, y, color, alpha = 1, size = 10) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(str).width + size * 1.1, h = size * 1.55;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(8,14,28,0.82)';
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(0.6, size / 12);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(str, x, y + size * 0.06);
    ctx.restore();
  }

  // Big floating numbers (damage, heal, item names): bold with a dark outline, no box.
  shout(str, x, y, color, alpha = 1, size = 13) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = font(size, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = size / 3;
    ctx.strokeText(str, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
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
    this.drawSmooth(img, 0, 0, 32, 20, Math.round(x), Math.round(y), w, h);
  }

  // Turn and item messages, like the Worms toast: a glowing pill that slides in under the clock.
  renderBanner() {
    const b = this.banner;
    if (!b) return;
    const { ctx, W } = this;
    b.age = (b.age ?? 0);
    const size = W >= 1000 ? 18 : 14;
    const y = (W >= 1000 ? 82 : 64) - Math.max(0, 6 - b.age * 40);
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3, b.age * 6 + 0.2);
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(b.text).width + size * 1.8, h = size * 2;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(8,14,28,0.82)';
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = b.color;
    ctx.stroke();
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
    // On touch screens the panel keeps a set width and sits centred between the arrow pad and
    // the fire buttons; on a computer it fills the room left of the chat box.
    const room = W - leftW - rightW;
    const panelW = this.touch ? Math.min(room, Math.round(TOUCH_PANEL_W * k)) : room;
    const x0 = leftW + Math.round((room - panelW) / 2);
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
    const u = (x - x0) / kx + PANEL_CUT, v = (y - py) / k;
    if (Math.hypot(u - 91.5, v - 19) < 10) return 0;
    if (Math.hypot(u - 83.5, v - 39) < 10) return 1;
    return null;
  }

  // Screen point -> item index when it lands on one of the six slots.
  panelItemAt(x, y) {
    const { k, kx, x0, y: py } = this.panelLayout();
    const u = (x - x0) / kx + PANEL_CUT, v = (y - py) / k;
    if (v < ITEMS_TOP || v > 27) return null;
    const i = Math.floor(((u - ITEMS_X) / itemsWidth(this.panelLayout().width)) * ITEMS.length);
    return i >= 0 && i < ITEMS.length ? i : null;
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

  // Pixel art redrawn at 4x with Scale2x applied twice: diagonal edges and letter shapes get
  // smooth outlines instead of square steps, colours stay exactly the original ones.
  smooth(img) {
    this.smoothCache ??= new WeakMap();
    let c = this.smoothCache.get(img);
    if (!c) {
      c = scale2x(scale2x(img));
      c.n = 4;
      this.smoothCache.set(img, c);
    }
    return c;
  }

  // Like drawCrisp, from the smooth() copy.
  drawSmooth(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const c = this.smooth(img), n = c.n, { ctx } = this;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, sx * n, sy * n, sw * n, sh * n, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = false;
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
  composedPanel(source, width, pieces) {
    this.panelCache ??= new WeakMap();
    let byWidth = this.panelCache.get(source);
    if (!byWidth) this.panelCache.set(source, (byWidth = {}));
    if (byWidth[width]) return byWidth[width];
    const img = (byWidth.reshaped ??= reshapeWindBox(source));
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
    // Left end: only the angle dial's round ring, nothing of the frame beside it.
    const w = Math.ceil(DIAL_X - PANEL_CUT);
    const { data } = x.getImageData(0, 0, w, 56);
    for (let yy = 0; yy < 56; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const dx = (xx + PANEL_CUT - DIAL_X) / DIAL_RX, dy = (yy - DIAL_Y) / DIAL_RY;
        if (dx * dx + dy * dy > 1) data[(yy * w + xx) * 4 + 3] = 0;
      }
    }
    x.putImageData(new ImageData(data, w, 56), 0, 0);
    return (byWidth[width] = c);
  }

  renderPanel() {
    const { ctx } = this;
    const t = this.panelTank;
    if (!t) return;
    const s = this.sprites[this.manifest.panels[PLAYERS[t.player].panel]];
    const { k, kx, x0, y: py, width, pieces, panelW, Xt, Xb, right } = this.panelLayout();
    if (s) {
      // A soft shadow and a faint light rim follow the panel's outline, so it sits on the field
      // instead of looking pasted on.
      const composed = this.composedPanel(s.img, width, pieces);
      for (const [color, blur, dy] of [['rgba(166,233,248,0.5)', 2, 0]]) {
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = blur * this.dpr; ctx.shadowOffsetY = dy * this.dpr;
        this.drawSmooth(composed, 0, 0, width, 56, x0, py, panelW, 56 * k);
        ctx.restore();
      }
      this.drawSmooth(composed, 0, 0, width, 56, x0, py, panelW, 56 * k);
    }
    const rect = (X, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(X(x), py + y * k, X(x + w) - X(x), h * k); };
    const pfont = (size) => font(Math.round(size * k));
    const mine = t === this.active && this.state === 'aim';
    // Energy, Power, Move redrawn over the picture: rounded label chips with clean text, dark
    // tracks with a thin coloured rim, and glossy fills.
    const b0 = Xb(140), b1 = Xb(280), l0 = Xb(100), l1 = Xb(138.5);
    const rows = [
      { y: 28.5, label: 'Energy', colors: ['#3fe060', '#14862e'], fill: ['#8cff9c', '#2fc24b', '#1b8f34'], value: t.hp / 100 },
      { y: 37, label: 'Power', colors: ['#ff5a4a', '#b51a1a'], fill: ['#fff07a', '#ffb02e', '#ff3b2b'], value: mine && this.charge != null ? this.charge : 0 },
      { y: 45.5, label: 'Move', colors: ['#f2b23a', '#8a5a0c'], fill: ['#ffe39a', '#ffb52e', '#d98a10'], value: t === this.active ? this.move / moveMax(t.def) : 1 },
    ];
    const rh = 8 * k, rr = 2.2 * k;
    for (const r of rows) {
      const y = py + r.y * k;
      // Label chip.
      ctx.beginPath(); ctx.roundRect(l0, y, l1 - l0, rh, rr);
      let g = ctx.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, r.colors[0]); g.addColorStop(1, r.colors[1]);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.5 * k); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
      ctx.save();
      ctx.font = font(Math.round(5.6 * k), 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowOffsetY = Math.max(1, 0.4 * k); ctx.shadowBlur = k;
      ctx.fillStyle = '#fff';
      ctx.fillText(r.label, (l0 + l1) / 2, y + rh / 2 + 0.3 * k, l1 - l0 - 2 * k);
      ctx.restore();
      // Track.
      ctx.beginPath(); ctx.roundRect(b0, y, b1 - b0, rh, rr);
      ctx.fillStyle = '#0a0d16'; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.5 * k); ctx.strokeStyle = r.colors[1]; ctx.stroke();
      // Fill.
      const fw = (b1 - b0 - 2 * k) * clamp(r.value, 0, 1);
      if (fw > 0.5) {
        ctx.beginPath(); ctx.roundRect(b0 + k, y + k, fw, rh - 2 * k, rr * 0.7);
        g = ctx.createLinearGradient(0, y + k, 0, y + rh - k);
        g.addColorStop(0, r.fill[0]); g.addColorStop(0.45, r.fill[1]); g.addColorStop(1, r.fill[2]);
        ctx.fillStyle = g; ctx.fill();
      }
    }
    ctx.font = pfont(5.5); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 2;
    ctx.fillText(t.hp, b1 - 2 * k, py + 32.5 * k);
    ctx.restore();
    const p0 = b0, p1 = b1;
    // Tenths along the power bar, to aim by.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(p0 + ((p1 - p0) * i) / 10), py + 38 * k, 1, 6 * k);
    if (t.lastPower != null) {
      const mx = p0 + (p1 - p0) * t.lastPower, my = py + 37 * k;
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, my + 1); ctx.lineTo(mx - 5, my - 7); ctx.lineTo(mx + 5, my - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Wind grows from the centre mark of the (thick) WIND bar, with its strength at the end.
    const wind = this.wind ?? 0;
    const wc = Xt(WIND_CENTRE), wl = Xt(WIND_LEFT), wr = Xt(306), wy = py + 17 * k, wh = 5 * k;
    // Clean WIND chip over the pixel label.
    {
      const lx0 = Xt(230.5), lx1 = Xt(258), ly = py + 15.5 * k, lh = 7 * k;
      ctx.beginPath(); ctx.roundRect(lx0, ly, lx1 - lx0, lh, 2 * k);
      const g = ctx.createLinearGradient(0, ly, 0, ly + lh);
      g.addColorStop(0, '#2a3350'); g.addColorStop(1, '#141a2c');
      ctx.fillStyle = g; ctx.fill();
      ctx.save();
      ctx.font = font(Math.round(5.2 * k), 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff6a5a'; ctx.shadowColor = '#000'; ctx.shadowBlur = k;
      ctx.fillText('WIND', (lx0 + lx1) / 2, ly + lh / 2 + 0.3 * k);
      ctx.restore();
    }
    ctx.fillStyle = '#7fd0ff';
    if (wind < 0) ctx.fillRect(wc + (wc - wl) * wind, wy, (wl - wc) * wind, wh);
    else if (wind > 0) ctx.fillRect(wc, wy, (wr - wc) * wind, wh);
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(wc), wy - k, Math.max(1, k / 2), wh + 2 * k);
    ctx.font = pfont(6.5); ctx.textAlign = 'right'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    const windText = `${wind < 0 ? '◀ ' : wind > 0 ? '▶ ' : ''}${Math.round(Math.abs(wind) * 10)}`;
    ctx.strokeText(windText, Xt(305), py + 19.5 * k);
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(windText, Xt(305), py + 19.5 * k);
    // Angle dial: the needle points the way the tank aims.
    {
      const cx = Xt(39.5), cy = py + 30.5 * k, r = 19 * k, a = (t.aim * Math.PI) / 180;
      const ang = t.facing > 0 ? -a : Math.PI + a;
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(2, 1.6 * k); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
      ctx.font = pfont(10); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(t.aim), cx, cy + 9 * k);
    }
    // FIRE1 / FIRE2: the chosen attack is lit.
    // FIRE1 / FIRE2 hold the two attacks' shells, as in the original; the chosen one is lit.
    t.def.weapons.forEach((w, i) => {
      const [ux, uy] = i === 0 ? [92, 19.5] : [84, 39.5];
      const cx = Xt(ux), cy = py + uy * k, r = 6.2 * k;
      const on = t.weapon === i;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
      if (on) { g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#ffb800'); } else { g.addColorStop(0, '#2a3040'); g.addColorStop(1, '#0a0d14'); }
      ctx.fillStyle = g;
      if (on) { ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 3 * k; }
      ctx.fill();
      ctx.restore();
      const s = this.sprites[this.manifest.shells[w.shell]];
      if (s) {
        const [fx, fw, fh] = s.frames[0];
        const size = r * 1.5, sc = size / Math.max(fw, fh);
        ctx.save();
        if (!on) ctx.globalAlpha = 0.75;
        this.drawCrisp(s.img, sc, fx, 0, fw, fh, cx - (fw * sc) / 2, cy - (fh * sc) / 2, fw * sc, fh * sc);
        ctx.restore();
      }
    });
    this.renderItems(t, x0 + (ITEMS_X - PANEL_CUT) * kx, py + ITEMS_TOP * k, pieces.items * kx, (26.5 - ITEMS_TOP) * k, k);
    ctx.textBaseline = 'middle';
    // Touch screens leave the corners open so the field shows around the arrow pad and the
    // fire buttons; a computer gets the chat box.
    if (!this.touch) this.renderChat(right, k);
  }

  // The item tray in the Worms style: a rounded dark panel of cards, each with its icon, a short
  // name and a yellow badge with how many are left. Items used this turn get a glowing frame.
  renderItems(t, x, y, w, h, k) {
    const { ctx } = this;
    // A slot sunk into the panel: dark well, shadow along the top, light rim along the bottom.
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3 * k);
    const well = ctx.createLinearGradient(0, y, 0, y + h);
    well.addColorStop(0, '#0b1020'); well.addColorStop(1, '#1a2238');
    ctx.fillStyle = well; ctx.fill();
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4 * k; ctx.shadowOffsetY = k;
    ctx.lineWidth = 2 * k; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.roundRect(x - k, y - k, w + 2 * k, h + 2 * k, 3 * k); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3 * k);
    ctx.lineWidth = Math.max(1, 0.6 * k); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 3 * k, y + h + 0.5); ctx.lineTo(x + w - 3 * k, y + h + 0.5);
    ctx.strokeStyle = 'rgba(200,235,255,0.7)'; ctx.stroke();
    const pad = 1.5 * k, gap = 1.2 * k;
    const cw = (w - 2 * pad - gap * (ITEMS.length - 1)) / ITEMS.length, ch = h - 2 * pad;
    ITEMS.forEach((item, i) => {
      const cx = x + pad + i * (cw + gap), cy = y + pad;
      const used = t === this.active && this.turnItems.has(item.id);
      const left = t.items[item.id];
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 3 * k);
      const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
      g.addColorStop(0, used ? 'rgba(120,96,24,0.95)' : 'rgba(58,64,78,0.95)');
      g.addColorStop(1, used ? 'rgba(60,46,10,0.95)' : 'rgba(24,27,36,0.95)');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(1, k * 0.6);
      ctx.strokeStyle = used ? '#ffd84a' : '#5d6678';
      if (used) { ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 8; }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      if (!left && !used) ctx.globalAlpha = 0.35;
      const icon = item.id === 'teleport' ? this.teleportIcon(t) : this.itemIcons[item.id];
      const size = Math.min(cw - 2 * k, ch * 0.6);
      if (icon) this.drawCrisp(icon, size / icon.height, 0, 0, icon.width, icon.height, cx + (cw - size) / 2, cy + 0.6 * k, size, size);
      ctx.font = font(Math.max(7, Math.round(3.6 * k)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
      ctx.fillText(ITEM_LABELS[item.id], cx + cw / 2, cy + ch - 0.6 * k, cw - 2);
      ctx.restore();
      // Count badge on the top-right corner.
      const r = 2.5 * k, bx = cx + cw - r * 1.1, by = cy + r * 0.85;
      ctx.beginPath(); ctx.roundRect(bx - r * 1.1, by - r * 0.85, r * 2.2, r * 1.7, r * 0.85);
      ctx.fillStyle = left ? '#ffd84a' : '#5d6678'; ctx.fill();
      ctx.font = font(Math.round(r * 1.25), 900);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a1405';
      ctx.fillText(left, bx, by + 0.5);
    });
  }

  // 순간이동 with the player's own tank in the swirl (the Worms icon has a worm there).
  teleportIcon(t) {
    this.teleportIcons ??= {};
    if (this.teleportIcons[t.def.id]) return this.teleportIcons[t.def.id];
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const x = c.getContext('2d');
    x.lineCap = 'round';
    for (const [r, a] of [[19, 0.2], [14, 2.4], [9, 4.4]]) {
      x.strokeStyle = '#111'; x.lineWidth = 5;
      x.beginPath(); x.arc(24, 24, r, a, a + 4); x.stroke();
      x.strokeStyle = '#c58bff'; x.lineWidth = 2.5; x.stroke();
    }
    const s = this.sprites[this.manifest.tanks[t.def.id].idle[2]];
    if (s) {
      const [fx, fw, fh] = s.frames[0];
      const k = 26 / Math.max(fw, fh);
      x.imageSmoothingEnabled = false;
      x.save(); x.translate(24, 26); x.scale(-1, 1);
      x.drawImage(s.img, fx, 0, fw, fh, (-fw * k) / 2, (-fh * k) / 2, fw * k, fh * k);
      x.restore();
    }
    x.fillStyle = '#fff';
    for (const [px, py] of [[8, 10], [40, 12], [39, 39], [9, 37]]) { x.fillRect(px - 1, py - 3, 2, 6); x.fillRect(px - 3, py - 1, 6, 2); }
    return (this.teleportIcons[t.def.id] = c);
  }

  // Touch screens: a thin rounded end on the right of the panel (the left ends at the dial).
  // They are filled with the panel's own edge column, so they take each player's colours.
  renderPanelEnds(img, x0, py, panelW, k) {
    const { ctx } = this;
    const w = 6 * k, top = py + 14 * k, bottom = this.H;
    for (const [from, dir] of [[x0 + panelW, 1]]) {
      const outer = from + dir * w;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(from, top);
      ctx.quadraticCurveTo(outer, top, outer, top + 10 * k);
      ctx.lineTo(outer, bottom);
      ctx.lineTo(from, bottom);
      ctx.closePath();
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 2, 0, 1, 56, Math.min(from, outer), py, w, 56 * k);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(from, top);
      ctx.quadraticCurveTo(outer, top, outer, top + 10 * k);
      ctx.lineTo(outer, bottom);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, k * 0.7);
      ctx.stroke();
    }
  }

  // A Worms HUD panel: dark metal gradient, rounded, thin grey border, a highlight along the
  // top and a drop shadow.
  hudPanel(x, y, w, h, r = 10) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(42,48,60,0.94)'); g.addColorStop(1, 'rgba(16,19,26,0.94)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#596273';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.restore();
  }

  // The chat box at the right end of the bar (computer).
  chatRect(b, k) {
    const m = 5 * k;
    return { x: b.x + m, y: b.y + 5 * k, w: b.w - 2 * m, h: b.h - 9 * k };
  }

  // Chat and game messages inside the box.
  renderChat(b, k) {
    const { ctx } = this;
    const box = this.chatRect(b, k);
    this.hudPanel(box.x, box.y, box.w, box.h);
    const inner = { x: box.x + 8, y: box.y + 6, w: box.w - 16, h: box.h - 10 };
    const size = Math.max(11, Math.round(6 * k));
    ctx.save();
    ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
    ctx.font = font(size, 700);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#000'; ctx.shadowOffsetY = 1; ctx.shadowBlur = 2;
    const lineH = size + 4;
    const inputY = inner.y + inner.h - 2;
    if (!this.chatOpen) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Enter: 채팅', inner.x, inputY);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(inner.x, inputY - lineH, inner.w, 1);
    let y = inputY - lineH - 3;
    for (let i = this.log.length - 1; i >= 0 && y > inner.y + 2; i--, y -= lineH) {
      ctx.fillStyle = this.log[i].color;
      ctx.fillText(this.log[i].text, inner.x, y);
    }
    ctx.restore();
  }

  // Touch screens: recent messages float on the left above the arrow pad, then fade.
  renderChatOverlay() {
    if (!this.touch) return;
    const { ctx } = this;
    const size = 13, lineH = 21;
    let y = this.H - 4 - PAD_SIZE - 10;
    ctx.save();
    ctx.font = font(size);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const recent = this.log.filter((l) => this.time - l.time < 8).slice(-5);
    for (let i = recent.length - 1; i >= 0; i--, y -= lineH) {
      const l = recent[i];
      ctx.globalAlpha = clamp(8 - (this.time - l.time), 0, 1);
      const w = ctx.measureText(l.text).width + 18, h = lineH - 2;
      ctx.beginPath(); ctx.roundRect(10, y - h, w, h, h / 2);
      ctx.fillStyle = 'rgba(8,14,28,0.78)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 19, y - 1);
    }
    ctx.restore();
  }

  // Top-right map of the whole field: ground, tanks, shells and the part on screen.
  renderMinimap() {
    const { ctx } = this;
    const { W } = this;
    const w = Math.round(this.touch ? clamp(W * 0.2, 140, 190) : clamp(W * 0.18, 180, 280));
    const k = w / this.terrain.width, h = Math.round(WORLD_H * k);
    const x = W - w - 14, y = 14;
    this.hudPanel(x - 6, y - 6, w + 12, h + 12, 10);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.clip();
    ctx.fillStyle = 'rgba(70,110,170,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain.canvas, x, y, w, h);
    ctx.imageSmoothingEnabled = false;
    for (const t of this.tanks) {
      if (t.dead) continue;
      ctx.beginPath(); ctx.arc(x + t.x * k, y + t.cy * k, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = t.color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
    }
    ctx.fillStyle = '#ffd84a';
    for (const p of this.projectiles) ctx.fillRect(Math.round(x + p.x * k) - 1, Math.round(y + clamp(p.y, 0, WORLD_H) * k) - 1, 2, 2);
    ctx.fillStyle = 'rgba(60,110,200,0.8)';
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    const c = this.camera;
    ctx.beginPath();
    ctx.roundRect(Math.round(x + c.x * k) + 0.5, Math.round(y + c.y * k) + 0.5, Math.round(this.viewW * k), Math.round(this.viewH * k), 3);
    ctx.stroke();
    ctx.restore();
  }

  // ---- online sync -------------------------------------------------------------------------

  // Everything the guest needs to draw the current frame.
  snapshot() {
    return {
      st: this.state, tu: this.turn, tm: r1(this.timer ?? 0), wd: this.wind,
      ch: this.charge == null ? null : r2(this.charge), mv: r1(this.move ?? 0),
      ti: [...(this.turnItems ?? [])], tp: this.teleportArmed ? 1 : 0,
      k: this.tanks.map((t) => [r1(t.x), r1(t.y), t.hp, t.dead ? 1 : 0, t.facing, r1(t.aim), t.weapon,
        t.lastPower == null ? null : r2(t.lastPower), t.walking ? 1 : 0, r2(t.hitTime), ITEMS.map((it) => t.items[it.id])]),
      p: this.projectiles.map((p) => [this.tanks.indexOf(p.owner), p.owner.def.weapons.indexOf(p.def), r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r2(p.age)]),
    };
  }

  applySnapshot(s) {
    const turned = s.tu !== this.turn || (s.st === 'aim' && this.state !== 'aim');
    const tick = Math.ceil(s.tm) !== Math.ceil(this.timer ?? 0);
    Object.assign(this, { state: s.st, turn: s.tu, timer: s.tm, wind: s.wd, charge: s.ch, move: s.mv, teleportArmed: !!s.tp });
    if (tick) this.tickAt = this.time;
    this.turnItems = new Set(s.ti);
    s.k.forEach(([x, y, hp, dead, facing, aim, weapon, lastPower, walking, hitTime, items], i) => {
      const t = this.tanks[i];
      if (walking) t.walkTime += DT * 3;
      Object.assign(t, { x, y, hp, dead: !!dead, facing, aim, weapon, lastPower, walking: !!walking, hitTime });
      ITEMS.forEach((it, j) => { t.items[it.id] = items[j]; });
    });
    this.projectiles = s.p.map(([ti, wi, x, y, vx, vy, age]) => {
      const owner = this.tanks[ti];
      return { owner, def: owner.def.weapons[wi], x, y, vx, vy, age };
    });
    if (turned && s.st === 'aim') {
      this.camera.free = false;
      this.camera.snap = true;
      this.onTurn(this.active);
    }
  }

  applyEvent(e) {
    if (e.t === 'crater') this.terrain.explode(...e.a);
    else if (e.t === 'blast') this.addBlast(...e.a);
    else if (e.t === 'splash') this.splash(...e.a);
    else if (e.t === 'label') this.label(...e.a);
    else if (e.t === 'say') this.say(...e.a);
    else if (e.t === 'itemfx') this.itemPop(...e.a);
    else if (e.t === 'banner') this.setBanner(...e.a);
    else if (e.t === 'sfx') this.audio[e.n]?.(...e.a);
  }

  say(text, color = '#cfd8e6') {
    this.emit({ t: 'say', a: [text, color] });
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

// Columns of the item tray: as wide as fits while the wind bar keeps at least 12.
function itemsWidth(width) {
  return clamp(width - PANEL_FIXED - 12, ITEMS_MIN, ITEMS_MAX);
}

// [first column, end column, times] pieces of the 320-column panel picture for a panel `width`
// columns wide. One-column pieces are stretched instead of repeated.
//   top:    dial and FIRE, an empty frame stretched under the item tray, the frame end, then the
//           WIND box widened on both sides of the wind centre (the small window between the item
//           slots and WIND is left out)
//   bottom: the bars, widened at column 210; the panel ends with them and with the WIND box,
//           (the TURN box and the frame's right end are left out)
function panelPieces(width) {
  const items = itemsWidth(width);
  const room = width - PANEL_FIXED - items;
  const a = Math.floor(room / 2), b = room - a;
  return {
    items,
    top: [[PANEL_CUT, ITEMS_X, 1], [148, 149, items], [191, 196, 1], [225, 265, 1], [265, 266, a], [266 + WIND_TRIM, 290, 1], [290, 291, b], [291, 309, 1]],
    bottom: [[PANEL_CUT, 210, 1], [210, 211, width - (210 - PANEL_CUT) - 73], [211, 284, 1]],
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

// The WIND / DELAY box without the DELAY line: the box loses the height of the thin WIND row
// and the thick DELAY bar becomes the wind bar, with the WIND label moved into it. The turn
// clock at the top already shows the time.
function reshapeWindBox(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const x0 = 225, w = img.width - x0;
  x.clearRect(x0, 0, w, 14);
  // Top outline and highlight, moved down onto the DELAY bar.
  x.drawImage(img, x0, 4, w, 2, x0, 12, w, 2);
  // Empty the bar and put the WIND label at its left end.
  x.fillStyle = '#333333';
  x.fillRect(231, 16, 76, 7);
  x.drawImage(img, 230, 7, 27, 6, 231, 16, 27, 6);
  return c;
}

// Scale2x (EPX): doubles a picture, rounding off stair-step edges. Returns a canvas.
function scale2x(src) {
  const w = src.width, h = src.height;
  const a = document.createElement('canvas');
  a.width = w; a.height = h;
  const ax = a.getContext('2d');
  ax.drawImage(src, 0, 0);
  const p = new Uint32Array(ax.getImageData(0, 0, w, h).data.buffer);
  const out = document.createElement('canvas');
  out.width = w * 2; out.height = h * 2;
  const ox = out.getContext('2d');
  const img = ox.createImageData(w * 2, h * 2);
  const q = new Uint32Array(img.data.buffer);
  const at = (x, y) => p[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = p[y * w + x], b = at(x, y - 1), d = at(x - 1, y), f = at(x + 1, y), hh = at(x, y + 1);
      let e0 = e, e1 = e, e2 = e, e3 = e;
      if (b !== hh && d !== f) {
        if (d === b) e0 = d;
        if (b === f) e1 = f;
        if (d === hh) e2 = d;
        if (hh === f) e3 = f;
      }
      const o = y * 2 * w * 2 + x * 2;
      q[o] = e0; q[o + 1] = e1; q[o + w * 2] = e2; q[o + w * 2 + 1] = e3;
    }
  }
  ox.putImageData(img, 0, 0);
  return out;
}
