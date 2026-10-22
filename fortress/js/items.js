// Items, the same set as taebo-games-worms (the icons are its pictures, see assets.js): each player gets a few per match and several can be
// stacked in one turn (dual + damage x2 hits four times as hard). They are used before firing.
export const ITEMS = [
  { id: 'dual', name: '2연발', color: '#ff8a3c', key: 'KeyQ', count: 2, info: '같은 각도·세기로 한 발 더 쏴요' },
  { id: 'double', name: '공격력 2배', color: '#ff5a5a', key: 'KeyW', count: 2, info: '이번 턴 데미지가 2배' },
  { id: 'power', name: '파워샷', color: '#ffd84a', key: 'KeyE', count: 3, info: '더 멀리 날아가고 데미지 1.3배' },
  { id: 'heal', name: '체력 회복', color: '#6be06b', key: 'KeyT', count: 1, info: '체력 +40' },
  { id: 'teleport', name: '순간이동', color: '#c58bff', key: 'KeyY', count: 1, info: '원하는 곳을 눌러 이동 (턴 끝)' },
];

export const POWER_SHOT = 1.3;
export const HEAL = 40;
