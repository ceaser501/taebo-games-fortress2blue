// The four tanks and their two attacks. `speed`, `gravity` and `wind` scale the shared
// physics; `radius` is the crater, `damage` what a direct hit takes off (100 = full energy).
//   shell   sprite in manifest.shells; `spin` turns it in flight instead of pointing it
//   count   shells fired at once, `spread` degrees apart
//   burst   shells fired one after another, `gap` seconds apart
//   bounce  times it bounces off the ground before going off
//   blast   explosion sprite size (small / medium / large)
//   sfx     launch sound in audio.js
export const TANKS = [
  {
    id: 'cannon', name: '캐논',
    weapons: [
      { name: '포탄', shell: 'ball', spin: true, speed: 1, gravity: 1, wind: 1, radius: 26, damage: 32, blast: 'medium', sfx: 'boom' },
      { name: '불덩이', shell: 'fireball', spin: false, speed: 0.92, gravity: 1.05, wind: 0.5, radius: 38, damage: 42, blast: 'large', sfx: 'boom' },
    ],
  },
  {
    id: 'carrot', name: '카롯',
    weapons: [
      { name: '당근 미사일', shell: 'carrot', speed: 1.06, gravity: 1, wind: 1.3, radius: 22, damage: 30, blast: 'medium', sfx: 'missile' },
      { name: '당근 3발', shell: 'carrot', speed: 1.06, gravity: 1, wind: 1.3, radius: 16, damage: 16, blast: 'small', count: 3, spread: 5, sfx: 'missile' },
    ],
  },
  {
    id: 'catapult', name: '카타펄트',
    weapons: [
      { name: '돌덩이', shell: 'rock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 34, damage: 34, blast: 'large', sfx: 'throw' },
      { name: '튕기는 불돌', shell: 'fireRock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 26, damage: 28, blast: 'medium', bounce: 1, sfx: 'throw' },
    ],
  },
  {
    id: 'crossbow', name: '크로스보우',
    weapons: [
      { name: '화살', shell: 'arrow', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 14, damage: 38, blast: 'small', sfx: 'arrow' },
      { name: '화살 연사', shell: 'bolt', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 12, damage: 16, blast: 'small', burst: 3, gap: 0.3, sfx: 'arrow' },
    ],
  },
];

export const tankById = (id) => TANKS.find((t) => t.id === id) ?? TANKS[0];
