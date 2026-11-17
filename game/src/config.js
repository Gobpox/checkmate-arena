// CHECKMATE ARENA — balance data: the board, the pieces, the weapons, the upgrades.
// Everything numeric that shapes how a run feels lives here so the systems in
// game.js and pieces.js stay readable and the game is easy to retune.

// The board: 16 x 16 squares of 64 world units (1024 x 1024 world units).
export const BOARD = { squares: 16, sq: 64 };
export const WORLD = BOARD.squares * BOARD.sq;

// Player baseline (upgrades multiply or add onto these).
export const PLAYER = {
  radius: 15,
  hp: 100,
  speed: 265,          // world units per second
  sprintMult: 1.38,
  dashSpeed: 1150,     // burst speed while dashing
  dashTime: 0.16,      // seconds of dash
  dashCooldown: 2.2,   // seconds
  iframes: 0.6,        // invulnerable seconds after taking a hit
  magnet: 92,          // XP gem pickup radius
};

// Enemy pieces. `step` is the seconds between chess moves; `glide` is how long a
// move takes to travel; hp/dmg scale with the wave (see waveScale in game.js).
// glyph: the chess unicode sign drawn as the piece's body; each piece also has
// its own neon colour so its silhouette reads at a glance.
export const PIECES = {
  pawn: {
    glyph: '♟', name: 'Pawn', color: '#ff5d7a', radius: 15, hp: 22, dmg: 10,
    step: 1.15, glide: 0.30, xp: 1, score: 10,
  },
  knight: {
    glyph: '♞', name: 'Knight', color: '#ffb84d', radius: 16, hp: 40, dmg: 14,
    step: 1.55, glide: 0.34, xp: 2, score: 25,
  },
  bishop: {
    glyph: '♝', name: 'Bishop', color: '#4dc9ff', radius: 16, hp: 46, dmg: 12,
    step: 1.9, glide: 0.26, xp: 3, score: 40, shotEvery: 2.6, shotDmg: 9,
  },
  rook: {
    glyph: '♜', name: 'Rook', color: '#c792ff', radius: 19, hp: 120, dmg: 20,
    step: 2.3, glide: 0.30, xp: 4, score: 60,
  },
  queen: {
    glyph: '♛', name: 'Queen', color: '#ff4dd2', radius: 19, hp: 170, dmg: 18,
    step: 1.8, glide: 0.28, xp: 8, score: 150, shotEvery: 2.1, shotDmg: 11,
  },
  king: {
    glyph: '♚', name: 'King', color: '#ffd75e', radius: 30, hp: 1500, dmg: 26,
    step: 1.35, glide: 0.4, xp: 40, score: 1000,
  },
};

// Weapons. fireRate is shots per second; spread in radians; projectiles > 1
// fans them across the spread. `unlock` weapons drop from elites and the King.
export const WEAPONS = {
  blaster: {
    name: 'BASIC BLASTER', dmg: 12, fireRate: 5.0, projSpeed: 760, projectiles: 1,
    spread: 0.03, pierce: 0, aoe: 0, kick: 0, color: '#22e6ff', size: 4, life: 0.9,
  },
  laser: {
    name: 'RAPID LASER', dmg: 5, fireRate: 11.0, projSpeed: 980, projectiles: 1,
    spread: 0.05, pierce: 0, aoe: 0, kick: 0, color: '#0affc2', size: 3, life: 0.7,
  },
  shotgun: {
    name: 'SCATTERGUN', dmg: 8, fireRate: 1.6, projSpeed: 700, projectiles: 6,
    spread: 0.34, pierce: 0, aoe: 0, kick: 5, color: '#ffb84d', size: 3.5, life: 0.42,
  },
  railgun: {
    name: 'PIERCING RAILGUN', dmg: 55, fireRate: 1.15, projSpeed: 1350, projectiles: 1,
    spread: 0.0, pierce: 99, aoe: 0, kick: 7, color: '#c792ff', size: 5, life: 1.1,
  },
  launcher: {
    name: 'EXPLOSIVE LAUNCHER', dmg: 34, fireRate: 1.5, projSpeed: 560, projectiles: 1,
    spread: 0.02, pierce: 0, aoe: 86, kick: 4, color: '#ff5d7a', size: 6, life: 1.4,
  },
};
export const WEAPON_ORDER = ['blaster', 'laser', 'shotgun', 'railgun', 'launcher'];

// Level-up upgrades: three random cards are offered from this pool each level.
// apply(p) mutates the player's derived stats in game.js. `icon` is drawn on the
// card; stacks shows how many times it may be taken (Infinity = always offered).
export const UPGRADES = [
  { id: 'dmg',   icon: '⚔',  name: '+20% Damage',        desc: 'Every weapon hits a fifth harder.',        apply: p => { p.dmgMult *= 1.20; } },
  { id: 'rate',  icon: '⚡',  name: '+15% Attack Speed',  desc: 'All weapons fire faster.',                 apply: p => { p.rateMult *= 1.15; } },
  { id: 'speed', icon: '👟',  name: '+18% Move Speed',    desc: 'Outrun the steps of the pieces.',          apply: p => { p.speedMult *= 1.18; } },
  { id: 'proj',  icon: '✦',   name: '+1 Projectile',      desc: 'Every shot fires one more projectile.',    apply: p => { p.extraProj += 1; } },
  { id: 'hp',    icon: '❤',   name: '+25 Max HP & Heal',  desc: 'Raise max HP by 25 and heal 25 now.',      apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'leech', icon: '🩸',  name: 'Life Steal',         desc: 'Heal 0.6 HP for every kill.',              apply: p => { p.leech += 0.6; } },
  { id: 'crit',  icon: '🎯',  name: '+12% Crit Chance',   desc: 'Crits deal double damage.',                apply: p => { p.crit += 0.12; } },
  { id: 'boom',  icon: '💥',  name: 'Explosive Rounds',   desc: 'Your shots burst for splash damage.',      apply: p => { p.boom += 30; } },
  { id: 'pierce',icon: '➶',   name: 'Piercing Rounds',    desc: 'Projectiles pass through +1 enemy.',       apply: p => { p.pierce += 1; } },
  { id: 'dash',  icon: '💨',  name: '-25% Dash Cooldown', desc: 'Dash again much sooner.',                  apply: p => { p.dashCdMult *= 0.75; } },
  { id: 'magnet',icon: '🧲',  name: '+60% XP Magnet',     desc: 'Gems fly to you from much further.',       apply: p => { p.magnetMult *= 1.6; } },
  { id: 'armor', icon: '🛡',  name: '-12% Damage Taken',  desc: 'A neon ward softens every hit.',           apply: p => { p.armor *= 0.88; } },
];

// Wave recipe: which pieces a wave fields, before the boss wave (every 10th)
// replaces the recipe with the King and his court. Counts scale gently with
// the wave number inside game.js so difficulty ramps without spikes.
export function waveRecipe(wave) {
  if (wave <= 3) return { pawn: 4 + wave * 2 };
  if (wave <= 6) return { pawn: 8 + wave, knight: 1 + (wave - 3) };
  if (wave <= 9) return { pawn: 10 + wave, knight: 3, bishop: wave - 5, rook: wave - 7 };
  const cycle = wave - 10; // after the first boss: everything, growing
  return {
    pawn: 14 + cycle * 2, knight: 4 + (cycle >> 1), bishop: 4 + (cycle >> 1),
    rook: 3 + (cycle >> 2), queen: 1 + (cycle >> 2),
  };
}
export const BOSS_EVERY = 10;
export function isBossWave(wave) { return wave % BOSS_EVERY === 0; }

// HP / damage growth per wave for ordinary pieces (the King scales harder).
export function waveScale(wave) {
  return { hp: 1 + (wave - 1) * 0.16, dmg: 1 + (wave - 1) * 0.07 };
}
