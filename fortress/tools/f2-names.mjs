// Which resource id is what. The files carry no names, so this table was put together by
// looking at every converted sprite. Ids are the file names inside Resource.zip.

// Tanks are drawn in five ground slopes; index 2 is level ground. Each list is
// [slope 0, 1, 2, 3, 4]. The twelve of the character select screen plus the super tank (it is
// not on that screen; the ? card picks it now and then). `walk` is left out where no matching
// set was found.
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
  laser: {
    idle: ['FE354A48', 'FE3551A4', 'FE3558C0', 'FE355E9C', 'FE3565A8'],
    walk: ['FE3774F0', 'FE381870', 'FE38B41C', 'FE393FDC', 'FE39AEE0'],
    hit: ['FE36C48C', 'FE36E938', 'FE370CA4', 'FE372A58', 'FE374D74'],
  },
  ion: {
    idle: ['FE7162B0', 'FE716A74', 'FE717288', 'FE7179E8', 'FE71801C'],
    hit: ['FE730A28', 'FE733054', 'FE735810', 'FE737C58', 'FE739B3C'],
  },
  multi: {
    idle: ['FE7FDA88', 'FE7FE364', 'FE7FED14', 'FE7FF5AC', 'FE7FFE48'],
    walk: ['FE821458', 'FE82E40C', 'FE83E8B0', 'FE84BD10', 'FE857C48'],
    hit: ['FE8138C4', 'FE816470', 'FE819430', 'FE81BF90', 'FE81E9F4'],
  },
  missile: {
    idle: ['FE942C80', 'FE943798', 'FE944264', 'FE944A80', 'FE94535C'],
    hit: ['FE960FC4', 'FE96471C', 'FE967CF8', 'FE96A4E4', 'FE96D110'],
  },
  duke: {
    idle: ['FEA714F8', 'FEA7209C', 'FEA72B64', 'FEA733F0', 'FEA73F44'],
    walk: ['FEA8E20C', 'FEA99C3C', 'FEAA6334', 'FEAB0230', 'FEAB9D40'],
    hit: ['FEA7D7AC', 'FEA810A8', 'FEA845E0', 'FEA87074', 'FEA8A878'],
  },
  poseidon: {
    idle: ['FEB92110', 'FEB92A60', 'FEB9347C', 'FEB93D70', 'FEB9460C'],
    hit: ['FEBA0FC8', 'FEBA3FD0', 'FEBA737C', 'FEBAA250', 'FEBACFE4'],
  },
  mine: {
    idle: ['FECADDE0', 'FECAEB70', 'FECAF6D4', 'FECAFF74', 'FECB0B20'],
    walk: ['FECC9338', 'FECD82A0', 'FECE6E34', 'FECF2FA0', 'FECFE6B4'],
    hit: ['FECB7014', 'FECBB27C', 'FECBEA20', 'FECC1598', 'FECC4F34'],
  },
  super: {
    idle: ['FEE11574', 'FEE11F20', 'FEE12800', 'FEE130D4', 'FEE13B54'],
    walk: ['FEE2CC6C', 'FEE3B024', 'FEE48BA8', 'FEE55C98', 'FEE63AF0'],
    hit: ['FEE1E084', 'FEE21150', 'FEE23D90', 'FEE2691C', 'FEE29D84'],
  },
  secwind: {
    idle: ['FEF4BF70', 'FEF4C900', 'FEF4D120', 'FEF4D7E0', 'FEF4DFBC'],
    hit: ['FEF54B64', 'FEF57C4C', 'FEF5A7C4', 'FEF5C964', 'FEF5F090'],
  },
};

// Shells, pointing right (rotated in flight) or spinning in place.
export const SHELLS = {
  ball: 'FDE63E74', redBean: 'FDE644BC', missiles: 'FDE648E4', fireball: 'FDE84F04', carrot: 'FDE7799C', rock: 'FDE7EEA0',
  fireRock: 'FDE832D4', arrow: 'FDE8E598', bolt: 'FDE95598',
  beam: 'FDEB9A68', plasma: 'FDEB8D90', ion: 'FDEAC808', ionBig: 'FDEB2960', rocket: 'FDE6B0CC',
  rocketSmall: 'FDE648E4', bomb: 'FDEA5DE0', bombSmall: 'FDE9E660', drill: 'FDF10AE8', drillBig: 'FDEFD5C0',
  fish: 'FDEBD2CC', fishBig: 'FDEC2490', mine: 'FDEC9FD8', blob: 'FDF1810C', star: 'FDF1A1E8',
  superShell: 'FDF294D4', jet: 'FDF3C9E4', orb: 'FDE969E0',
};

// Name plates (white, as on the original game screens) and the character select screen with
// its twelve tank cards and the ? card.
export const TANK_NAMES = {
  cannon: 'FDC2A93C', carrot: 'FDC52D5C', catapult: 'FDC518CC', crossbow: 'FDC52214', laser: 'FDC9D488',
  ion: 'FDC9EC58', multi: 'FDC9C6C0', missile: 'FDC9B978', duke: 'FDC53AA4', poseidon: 'FDC2CCEC',
  mine: 'FDC9DFD0', secwind: 'FDC9F9A0',
};
export const SELECT_SCREEN = 'FDC210AC';

// Explosions by size, and the splash when something drops into the water.
export const BLASTS = { small: 'FE46F67C', medium: 'FE451404', large: 'FE49711C', splash: 'FE5A5CA8' };

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
