// Computer player: tries every angle and power against the current wind with the real shell
// physics, picks the shot that lands closest to the enemy, then turns the barrel and charges
// like a person would. Lower levels add aiming error.
import { DT, CHARGE_TIME, MAX_SPEED, FLOOR_Y, Game } from './game.js';

const LEVELS = {
  easy: { angle: 6, power: 0.07, think: 1.2 },
  normal: { angle: 2.5, power: 0.03, think: 0.9 },
  hard: { angle: 0.6, power: 0.01, think: 0.6 },
};

export class AI {
  constructor(game) { this.game = game; }

  plan(level) {
    const g = this.game, me = g.active;
    const enemy = g.tanks.find((t) => !t.dead && t !== me);
    if (!enemy) return;
    const lv = LEVELS[level] ?? LEVELS.normal;
    me.weapon = Math.random() < 0.65 ? 0 : 1;
    me.facing = enemy.x > me.x ? 1 : -1;
    const best = this.search(me, me.def.weapons[me.weapon], enemy);
    const err = (r) => (Math.random() * 2 - 1) * r;
    this.target = {
      aim: Math.max(0, Math.min(90, best.aim + err(lv.angle))),
      power: Math.max(0.1, Math.min(1, best.power + err(lv.power))),
    };
    this.wait = lv.think;
    this.phase = 'think';
  }

  // Where a shot lands, by stepping the same physics the game uses (terrain and tanks only).
  landing(me, def, aim, power) {
    const g = this.game, t = g.terrain;
    const a = (aim * Math.PI) / 180;
    const ux = Math.cos(a) * me.facing, uy = -Math.sin(a);
    const speed = power * MAX_SPEED * def.speed;
    const p = { def, x: me.cx + ux * 12, y: me.cy + uy * 12, vx: ux * speed, vy: uy * speed };
    for (let i = 0; i < 900; i++) {
      Game.stepShell(p, g.wind);
      // Same 1 px steps as the game, so thin masts and poles are not skipped.
      const steps = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * DT) || 1;
      for (let s = 0; s < steps; s++) {
        p.x += (p.vx * DT) / steps;
        p.y += (p.vy * DT) / steps;
        if (p.y >= FLOOR_Y || p.x < -400 || p.x > t.width + 400) return null;
        if (g.tanks.some((k) => !k.dead && (k !== me || i > 15) && Math.hypot(k.cx - p.x, k.cy - p.y) < 13)) return { x: p.x, y: p.y };
        if (t.solid(p.x, p.y)) return { x: p.x, y: p.y };
      }
    }
    return null;
  }

  search(me, def, enemy) {
    let best = { aim: 45, power: 0.7, score: Infinity };
    const score = (hit) => {
      if (!hit) return Infinity;
      const own = Math.hypot(hit.x - me.cx, hit.y - me.cy);
      return Math.hypot(hit.x - enemy.cx, hit.y - enemy.cy) + (own < def.radius + 16 ? 1000 : 0);
    };
    for (let aim = 10; aim <= 85; aim += 3) {
      for (let power = 0.2; power <= 1.001; power += 0.03) {
        const s = score(this.landing(me, def, aim, power));
        if (s < best.score) best = { aim, power, score: s };
      }
    }
    // Refine around the best coarse shot.
    const coarse = best;
    for (let aim = coarse.aim - 3; aim <= coarse.aim + 3; aim += 0.5) {
      for (let power = coarse.power - 0.03; power <= coarse.power + 0.03; power += 0.005) {
        if (aim < 0 || aim > 90 || power <= 0.05 || power > 1) continue;
        const s = score(this.landing(me, def, aim, power));
        if (s < best.score) best = { aim, power, score: s };
      }
    }
    return best;
  }

  update() {
    const g = this.game, me = g.active;
    if (!this.target || g.fired) return;
    this.wait -= DT;
    if (this.phase === 'think') {
      if (this.wait <= 0) this.phase = 'turn';
    } else if (this.phase === 'turn') {
      const d = this.target.aim - me.aim;
      me.aim += Math.sign(d) * Math.min(Math.abs(d), 40 * DT);
      if (Math.abs(d) < 0.01) { this.phase = 'charge'; this.wait = 0.3; }
    } else if (this.phase === 'charge') {
      if (this.wait > 0) return;
      if (g.charge == null) g.charge = 0;
      // The game adds to the charge in handleInput only for people; do it here.
      g.charge = Math.min(1, g.charge + DT / CHARGE_TIME);
      if (g.charge >= this.target.power) { g.charge = this.target.power; g.fire(); this.target = null; }
    }
  }
}
