// The tanks and their two attacks: the twelve of the original character select screen plus the
// super tank, which only the ? card picks, and only now and then.
//
// Tank stats (1-5, shown as bars on the select screen):
//   defence   takes less damage (5 = 70% of a hit, 1 = 110%)
//   movement  how far it can drive in a turn
//   angle     the barrel's [lowest, highest] angle
// Attack fields: `speed`, `gravity` and `wind` scale the shared physics; `radius` is the crater,
// `damage` what a direct hit takes off (100 = full energy).
//   shell   sprite in manifest.shells; `spin` plays its frames in place instead of turning it
//           along the flight
//   count   shells fired at once, `spread` degrees apart
//   burst   shells fired one after another, `gap` seconds apart
//   bounce  times it bounces off the ground before going off
//   blast   explosion sprite size (small / medium / large)
//   sfx     launch sound in audio.js
export const TANKS = [
  {
    id: 'catapult', name: '카타펄트', defence: 3, movement: 2, angle: [20, 80],
    weapons: [
      { name: '짱돌', shell: 'rock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 34, damage: 34, blast: 'large', sfx: 'throw' },
      { name: '불덩어리 돌', shell: 'fireRock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 28, damage: 32, blast: 'large', sfx: 'throw' },
    ],
  },
  {
    id: 'crossbow', name: '크로스보우', defence: 2, movement: 4, angle: [0, 70],
    weapons: [
      { name: '화살', shell: 'arrow', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 14, damage: 34, blast: 'small', sfx: 'arrow' },
      { name: '독화살', shell: 'poisonArrow', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 12, damage: 42, blast: 'small', sfx: 'arrow' },
    ],
  },
  {
    id: 'cannon', name: '캐논', defence: 3, movement: 3, angle: [0, 90],
    weapons: [
      { name: '검콩', shell: 'ball', spin: true, speed: 1, gravity: 1, wind: 1, radius: 30, damage: 34, blast: 'medium', sfx: 'boom' },
      { name: '빨콩', shell: 'redBean', spin: true, speed: 1, gravity: 1, wind: 1, radius: 22, damage: 40, blast: 'medium', sfx: 'boom' },
    ],
  },
  {
    id: 'carrot', name: '캐롯', defence: 3, movement: 3, angle: [10, 85],
    weapons: [
      { name: '탱크포', shell: 'shell', speed: 1.04, gravity: 1, wind: 1, radius: 24, damage: 32, blast: 'medium', sfx: 'missile' },
      { name: '녹색 포탄 3발', shell: 'greenShell', speed: 1.04, gravity: 1, wind: 1.1, radius: 16, damage: 16, blast: 'small', count: 3, spread: 5, sfx: 'missile' },
    ],
  },
  {
    id: 'duke', name: '듀크', defence: 5, movement: 1, angle: [30, 90],
    weapons: [
      { name: '탱크포', shell: 'dukeShell', speed: 0.95, gravity: 1.05, wind: 0.8, radius: 30, damage: 36, blast: 'large', sfx: 'boom' },
      { name: '독가스탄', shell: 'gas', spin: true, speed: 0.9, gravity: 1.05, wind: 1, radius: 40, damage: 30, blast: 'large', sfx: 'throw' },
    ],
  },
  {
    id: 'missile', name: '미사일', defence: 3, movement: 2, angle: [20, 45],
    weapons: [
      { name: '빨간 미사일', shell: 'redMissile', speed: 1.05, gravity: 1, wind: 0.8, radius: 30, damage: 38, blast: 'large', sfx: 'missile' },
      { name: '녹색 유도탄', shell: 'guided', speed: 1.05, gravity: 1, wind: 0.6, radius: 18, damage: 24, blast: 'small', sfx: 'missile' },
    ],
  },
  {
    id: 'multi', name: '멀티 미사일', defence: 3, movement: 3, angle: [15, 85],
    weapons: [
      { name: '로켓 3발', shell: 'rocket', speed: 1.02, gravity: 1, wind: 1, radius: 16, damage: 15, blast: 'small', count: 3, spread: 4, sfx: 'missile' },
      { name: '로켓 9발', shell: 'rocketSmall', speed: 1.02, gravity: 1, wind: 1, radius: 12, damage: 7, blast: 'small', count: 9, spread: 3, sfx: 'missile' },
    ],
  },
  {
    id: 'laser', name: '레이저', defence: 2, movement: 3, angle: [0, 60],
    weapons: [
      { name: '레이저탄', shell: 'laser', speed: 1.2, gravity: 0.5, wind: 0.2, radius: 14, damage: 34, blast: 'small', sfx: 'arrow' },
      { name: '레이저 연사', shell: 'laser', speed: 1.2, gravity: 0.5, wind: 0.2, radius: 12, damage: 18, blast: 'small', burst: 2, gap: 0.25, sfx: 'arrow' },
    ],
  },
  {
    id: 'mine', name: '마인 랜더', defence: 4, movement: 2, angle: [30, 90],
    weapons: [
      { name: '유탄', shell: 'grenade', spin: true, speed: 0.95, gravity: 1.05, wind: 0.9, radius: 28, damage: 32, blast: 'medium', sfx: 'throw' },
      { name: '지뢰 2개', shell: 'mine', spin: true, speed: 0.9, gravity: 1.05, wind: 0.9, radius: 22, damage: 22, blast: 'medium', count: 2, spread: 6, bounce: 1, sfx: 'throw' },
    ],
  },
  {
    id: 'ion', name: '아이온 어태커', defence: 2, movement: 3, angle: [10, 80],
    weapons: [
      { name: '에너지탄', shell: 'energy', speed: 1.05, gravity: 0.85, wind: 0.6, radius: 22, damage: 30, blast: 'medium', sfx: 'arrow' },
      { name: '위성탄', shell: 'comet', speed: 0.95, gravity: 0.9, wind: 0.6, radius: 34, damage: 38, blast: 'large', sfx: 'arrow' },
    ],
  },
  {
    id: 'poseidon', name: '포세이돈', defence: 3, movement: 4, angle: [10, 85],
    weapons: [
      { name: '물덩어리', shell: 'water', spin: true, speed: 1, gravity: 1, wind: 1, radius: 30, damage: 30, blast: 'medium', sfx: 'throw' },
      { name: '큰 물덩어리', shell: 'water', spin: true, speed: 0.92, gravity: 1.05, wind: 1, radius: 40, damage: 36, blast: 'large', sfx: 'throw' },
    ],
  },
  {
    id: 'secwind', name: '세크윈드', defence: 1, movement: 5, angle: [0, 80],
    weapons: [
      { name: '에너지탄', shell: 'swirl', spin: true, speed: 1.1, gravity: 0.9, wind: 1.2, radius: 20, damage: 30, blast: 'medium', sfx: 'arrow' },
      { name: '회전 에너지탄 2발', shell: 'ring', spin: true, speed: 1.1, gravity: 0.9, wind: 1.2, radius: 16, damage: 20, blast: 'small', count: 2, spread: 6, sfx: 'arrow' },
    ],
  },
  {
    id: 'super', name: '슈퍼탱크', defence: 5, movement: 4, angle: [0, 90], secret: true,
    weapons: [
      { name: '3연발 미사일', shell: 'superMissile', speed: 1.05, gravity: 1, wind: 0.8, radius: 26, damage: 26, blast: 'large', burst: 3, gap: 0.3, sfx: 'missile' },
      { name: '9연발 유도탄', shell: 'superGuided', speed: 1.05, gravity: 1, wind: 0.6, radius: 14, damage: 9, blast: 'small', count: 9, spread: 3, sfx: 'missile' },
    ],
  },
];

// The tanks on the select screen (everything but the secret one).
export const PICKABLE = TANKS.filter((t) => !t.secret);

// The ? card: any of the twelve, or the super tank about one time in 25.
export function randomTank() {
  if (Math.random() < 0.04) return TANKS.find((t) => t.secret);
  return PICKABLE[Math.floor(Math.random() * PICKABLE.length)];
}

export const tankById = (id) => TANKS.find((t) => t.id === id) ?? TANKS[0];
