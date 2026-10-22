import { musicUrl } from './assets.js';

// Background music: starts as soon as the page opens and keeps going through menus and games,
// switching to another random track when a game starts. Browsers only allow sound after the
// first tap or key press, so if the first try is blocked it starts on that first touch.
// One audio element is reused for every track, so once a tap has unlocked it, later track
// changes play without needing another tap (iPhone included). Off is remembered per device.
const KEY = 'fortress-music';
const VOLUME = 0.3;

export class Music {
  constructor(tracks) {
    this.tracks = tracks;
    this.el = new Audio();
    this.el.loop = true;
    this.el.volume = VOLUME;
    this.wanted = false;
    try { this.on = localStorage.getItem(KEY) !== 'off'; } catch { this.on = true; }
    const unlock = () => { if (this.wanted && this.on && this.el.paused) this.resume(); };
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, true);
    // Phones keep playing in the background otherwise.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.el.pause();
      else if (this.wanted && this.on) this.resume();
    });
  }

  get available() { return this.tracks.length > 0; }

  resume() {
    if (!this.available) return;
    if (!this.el.src) this.el.src = this.pick();
    this.el.play().catch(() => {});
  }

  pick() {
    const others = this.tracks.length > 1 ? this.tracks.filter((t) => !this.el.src.endsWith(musicUrl(t))) : this.tracks;
    return musicUrl(others[Math.floor(Math.random() * others.length)]);
  }

  // Plays whatever is loaded (or a random track); call when the page opens.
  start() {
    this.wanted = true;
    if (this.on) this.resume();
  }

  // A new random track, for the start of a game.
  next() {
    this.wanted = true;
    if (!this.available) return;
    this.el.src = this.pick();
    if (this.on) this.el.play().catch(() => {});
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (!this.on) this.el.pause();
    else if (this.wanted) this.resume();
    return this.on;
  }
}
