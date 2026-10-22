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
      { name: '돌덩이', shell: 'rock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 34, damage: 34, blast: 'large', sfx: 'throw' },
      { name: '튕기는 불돌', shell: 'fireRock', spin: true, speed: 0.95, gravity: 1, wind: 1.2, radius: 26, damage: 28, blast: 'medium', bounce: 1, sfx: 'throw' },
    ],
  },
  {
    id: 'crossbow', name: '크로스보우', defence: 2, movement: 4, angle: [0, 70],
    weapons: [
      { name: '화살', shell: 'arrow', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 14, damage: 38, blast: 'small', sfx: 'arrow' },
      { name: '화살 연사', shell: 'bolt', speed: 1.12, gravity: 0.8, wind: 0.5, radius: 12, damage: 16, blast: 'small', burst: 3, gap: 0.3, sfx: 'arrow' },
    ],
  },
  {
    id: 'cannon', name: '캐논', defence: 3, movement: 3, angle: [0, 90],
    weapons: [
      { name: '포탄', shell: 'ball', spin: true, speed: 1, gravity: 1, wind: 1, radius: 26, damage: 32, blast: 'medium', sfx: 'boom' },
      { name: '불덩이', shell: 'fireball', spin: true, speed: 0.92, gravity: 1.05, wind: 0.5, radius: 38, damage: 42, blast: 'large', sfx: 'boom' },
    ],
  },
  {
    id: 'carrot', name: '카롯', defence: 3, movement: 3, angle: [10, 85],
    weapons: [
      { name: '당근 미사일', shell: 'carrot', speed: 1.06, gravity: 1, wind: 1.3, radius: 22, damage: 30, blast: 'medium', sfx: 'missile' },
      { name: '당근 3발', shell: 'carrot', speed: 1.06, gravity: 1, wind: 1.3, radius: 16, damage: 16, blast: 'small', count: 3, spread: 5, sfx: 'missile' },
    ],
  },
  {
    id: 'laser', name: '레이저', defence: 2, movement: 3, angle: [0, 60],
    weapons: [
      { name: '레이저', shell: 'beam', speed: 1.25, gravity: 0.45, wind: 0.2, radius: 14, damage: 34, blast: 'small', sfx: 'arrow' },
      { name: '플라스마', shell: 'plasma', spin: true, speed: 1.1, gravity: 0.7, wind: 0.4, radius: 24, damage: 30, blast: 'medium', sfx: 'missile' },
    ],
  },
  {
    id: 'missile', name: '미사일', defence: 3, movement: 2, angle: [20, 90],
    weapons: [
      { name: '미사일', shell: 'bomb', spin: true, speed: 1, gravity: 1, wind: 0.8, radius: 28, damage: 36, blast: 'medium', sfx: 'missile' },
      { name: '소형 미사일 2발', shell: 'bombSmall', spin: true, speed: 1, gravity: 1, wind: 0.8, radius: 18, damage: 20, blast: 'small', burst: 2, gap: 0.35, sfx: 'missile' },
    ],
  },
  {
    id: 'duke', name: '듀크', defence: 5, movement: 1, angle: [30, 90],
    weapons: [
      { name: '드릴탄', shell: 'drill', spin: true, speed: 0.9, gravity: 1.1, wind: 0.6, radius: 30, damage: 38, blast: 'large', sfx: 'boom' },
      { name: '대형 드릴탄', shell: 'drillBig', spin: true, speed: 0.85, gravity: 1.15, wind: 0.5, radius: 42, damage: 46, blast: 'large', sfx: 'boom' },
    ],
  },
  {
    id: 'secwind', name: '세크윈드', defence: 1, movement: 5, angle: [0, 80],
    weapons: [
      { name: '제트탄', shell: 'jet', spin: true, speed: 1.15, gravity: 0.9, wind: 1.5, radius: 20, damage: 28, blast: 'medium', sfx: 'missile' },
      { name: '바람 구슬 3발', shell: 'orb', spin: true, speed: 1.1, gravity: 0.9, wind: 1.8, radius: 14, damage: 15, blast: 'small', count: 3, spread: 7, sfx: 'throw' },
    ],
  },
  {
    id: 'multi', name: '멀티 미사일', defence: 3, movement: 3, angle: [15, 85],
    weapons: [
      { name: '로켓 3발', shell: 'rocket', spin: true, speed: 1.02, gravity: 1, wind: 1, radius: 16, damage: 15, blast: 'small', count: 3, spread: 4, sfx: 'missile' },
      { name: '로켓 연사', shell: 'rocketSmall', spin: true, speed: 1.02, gravity: 1, wind: 1, radius: 14, damage: 12, blast: 'small', burst: 4, gap: 0.2, sfx: 'missile' },
    ],
  },
  {
    id: 'ion', name: '아이온 어태커', defence: 2, movement: 3, angle: [10, 80],
    weapons: [
      { name: '이온탄', shell: 'ion', spin: true, speed: 1.05, gravity: 0.85, wind: 0.6, radius: 22, damage: 30, blast: 'medium', sfx: 'arrow' },
      { name: '대형 이온탄', shell: 'ionBig', spin: true, speed: 0.95, gravity: 0.9, wind: 0.6, radius: 32, damage: 36, blast: 'large', sfx: 'arrow' },
    ],
  },
  {
    id: 'poseidon', name: '포세이돈', defence: 3, movement: 4, angle: [10, 85],
    weapons: [
      { name: '물고기 어뢰', shell: 'fish', spin: true, speed: 1, gravity: 1, wind: 1, radius: 24, damage: 32, blast: 'medium', sfx: 'throw' },
      { name: '튕기는 큰 어뢰', shell: 'fishBig', spin: true, speed: 0.95, gravity: 1, wind: 1, radius: 26, damage: 30, blast: 'medium', bounce: 2, sfx: 'throw' },
    ],
  },
  {
    id: 'mine', name: '마인 랜더', defence: 4, movement: 2, angle: [30, 90],
    weapons: [
      { name: '지뢰탄', shell: 'mine', spin: true, speed: 0.95, gravity: 1.05, wind: 0.9, radius: 30, damage: 34, blast: 'large', sfx: 'throw' },
      { name: '튕기는 지뢰', shell: 'blob', spin: true, speed: 0.9, gravity: 1.05, wind: 0.9, radius: 24, damage: 26, blast: 'medium', bounce: 2, sfx: 'throw' },
    ],
  },
  {
    id: 'super', name: '슈퍼탱크', defence: 5, movement: 4, angle: [0, 90], secret: true,
    weapons: [
      { name: '슈퍼 빔', shell: 'star', speed: 1.2, gravity: 0.6, wind: 0.3, radius: 30, damage: 48, blast: 'large', sfx: 'arrow' },
      { name: '슈퍼탄 3발', shell: 'superShell', spin: true, speed: 1.05, gravity: 1, wind: 0.6, radius: 28, damage: 30, blast: 'large', count: 3, spread: 6, sfx: 'boom' },
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
