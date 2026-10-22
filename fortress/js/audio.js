// Sound effects from the original WAVs, with synthesized stand-ins where none fits (the turn
// clock) or the file is missing. The resource files have no names, so which WAV is which
// sound was picked by its length and shape; `?sfx` on the page lists them all to listen to.
import { sfxUrl } from './assets.js';

const SFX = {
  boom: '00000125',
  missile: '00000149',
  throw: '00000132',
  arrow: '00000147',
  small: '00000143',
  medium: '00000121',
  large: '00000142',
  splash: '00000153',
};

export class Audio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.buffers = {};
    this.noise = this.makeNoise();
  }

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  async decode(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async load() {
    await Promise.all(Object.entries(SFX).map(async ([name, id]) => {
      this.buffers[name] = await this.decode(sfxUrl(id));
    }));
  }

  play(buffer, gain = 1) {
    if (!buffer) return false;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.buffer = buffer;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseBurst(duration, freq, gain, sweepTo = freq) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration);
  }

  tone(freq, duration, gain = 0.2, type = 'square', slideTo = freq) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  launch(kind) { if (!this.play(this.buffers[kind], 0.8)) this.noiseBurst(0.35, 3000, 0.35, 600); }
  explosion(size) {
    if (this.play(this.buffers[size], 0.9)) return;
    const r = { small: 14, medium: 26, large: 38 }[size] ?? 26;
    this.noiseBurst(0.4 + r / 80, 1800, 1.0, 80);
    this.tone(90, 0.4 + r / 120, 0.5, 'sine', 30);
  }
  splash() { if (!this.play(this.buffers.splash, 0.8)) this.noiseBurst(0.6, 900, 0.5, 200); }
  bounce() { this.tone(300, 0.06, 0.12, 'triangle', 180); }
  select() { this.tone(880, 0.05, 0.08, 'square', 1100); }
  // The turn clock: a soft tick each second, then a louder tick-tock from 10.
  clock(sec) {
    if (sec > 10) this.tone(1500, 0.03, 0.025, 'sine', 1100);
    else this.tone(sec % 2 ? 1300 : 950, 0.06, 0.09, 'triangle', sec % 2 ? 1000 : 750);
  }
  turn() { this.tone(660, 0.08, 0.1, 'triangle', 880); setTimeout(() => this.tone(990, 0.12, 0.1, 'triangle', 990), 80); }
}
