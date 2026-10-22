// Which resource id is what. The files carry no names, so this table was put together by
// looking at every converted sprite. Ids are the file names inside Resource.zip.

// Tanks are drawn in five ground slopes; index 2 is level ground. Each list is
// [slope 0, 1, 2, 3, 4].
export const TANKS = {
  cannon: {
    idle: ['FDFAC540', 'FDFACE1C', 'FDFAD720', 'FDFADF3C', 'FDFAE700'],
    walk: ['FE0177D4', 'FE01D324', 'FE022F8C', 'FE028124', 'FE02D3B8'],
    hit: ['FDFC92FC', 'FDFCBF28', 'FDFCEC1C', 'FDFD1334', 'FDFD39E8'],
  },
  carrot: {
    idle: ['FE07C3A4', 'FE07CC40', 'FE07D498', 'FE07DAF4', 'FE07E300'],
    walk: ['FE055A68', 'FE05B1B8', 'FE060678', 'FE064248', 'FE0696E0'],
    hit: ['FE084EB8', 'FE087924', 'FE08A234', 'FE08C0A0', 'FE08E7BC'],
  },
  catapult: {
    idle: ['FE15BC14', 'FE15C85C', 'FE15D374', 'FE15DC0C', 'FE15E638'],
    walk: ['FE1BBEAC', 'FE1C3474', 'FE1CA31C', 'FE1CF684', 'FE1D59D4'],
    hit: ['FE171CC4', 'FE1758DC', 'FE179034', 'FE17BA7C', 'FE17ECB0'],
  },
  crossbow: {
    idle: ['FE25FE6C', 'FE260680', 'FE260E1C', 'FE2613CC', 'FE261B38'],
    hit: ['FE27524C', 'FE277A90', 'FE27A07C', 'FE27BD84', 'FE27E280'],
  },
};

// Maps: the destructible ground (1200 px wide, transparent = air) and the picture behind it.
// The pairing follows the map select previews; it is a best guess where they are ambiguous.
export const MAPS = [
  { id: 'culture', name: 'The Culture', ground: 'FD00B8E0', back: 'FD5D7FA0' },
  { id: 'heaven', name: 'The Heaven', ground: 'FD0C8E18', back: 'FD1AB370' },
  { id: 'broken-city', name: 'The Broken City', ground: 'FD01FEB0', back: 'FD3C1988' },
  { id: 'pirate-ship', name: 'The Pirate Ship', ground: 'FD091D50', back: 'FD73C3B0' },
  { id: 'yamato-ship', name: 'The Yamato Ship', ground: 'FD0F85E8', back: 'FD30F780' },
  { id: 'fantastic-land', name: 'The Fantastic Land', ground: 'FD070B30', back: 'FDA04BD0' },
  { id: 'sphinx', name: 'The Sphinx', ground: 'FD0D8B38', back: 'FD525D98' },
  { id: 'cave', name: 'The Cave', ground: 'FD035C18', back: 'FD68A1A8' },
  { id: 'satellite', name: 'The Artificial Satellite', ground: 'FDE3B2E0', back: 'FD9529C8' },
  { id: 'night', name: 'The Night', ground: 'FD0097A0', back: 'FD473B90' },
  { id: 'log-bridge', name: 'The Single Log Bridge', ground: 'FD0B8850', back: 'FD7EE5B8' },
  { id: 'sky', name: 'The Sky', ground: 'FD0575D8', back: 'FD25D578' },
];

// Bottom panel (angle dial, FIRE, four item slots, WIND, DELAY), one per player colour.
export const PANELS = ['FDAB6DD8', 'FDAB7B48', 'FDAB88A0', 'FDAB9510', 'FDABA260', 'FDABAED0', 'FDABBC60',
  'FDABCA30', 'FDABD6B8', 'FDABE420', 'FDABF1E0', 'FDABFEF8', 'FDAC0C70'];

// Turn timer numbers 00..20, white with a dark outline (32x20).
export const TIMER_DIGITS = Array.from({ length: 21 }, (_, i) => (0xfdb25cdc + i * 0x508).toString(16).toUpperCase());
