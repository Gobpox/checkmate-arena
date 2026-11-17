// CHECKMATE ARENA — the living pieces. Every enemy moves by the real rules of
// chess, in turns: it waits, telegraphs the square (or line) it will take, then
// glides, leaps or charges there. The player survives by reading the board —
// the square a piece threatens is shown before it moves.
import { BOARD, PIECES } from './config.js';

const SQ = BOARD.sq, N = BOARD.squares;
export const center = (cx, cy) => ({ x: (cx + 0.5) * SQ, y: (cy + 0.5) * SQ });
export const squareOf = (x, y) => ({
  cx: Math.max(0, Math.min(N - 1, Math.floor(x / SQ))),
  cy: Math.max(0, Math.min(N - 1, Math.floor(y / SQ))),
});
const inBoard = (cx, cy) => cx >= 0 && cy >= 0 && cx < N && cy < N;
const dist2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;

export function createEnemy(kind, cx, cy, scale, rng) {
  const base = PIECES[kind];
  const pos = center(cx, cy);
  return {
    kind, glyph: base.glyph, name: base.name, color: base.color,
    x: pos.x, y: pos.y, cx, cy, radius: base.radius,
    hp: Math.round(base.hp * scale.hp), maxHp: Math.round(base.hp * scale.hp),
    dmg: Math.round(base.dmg * scale.dmg), xp: base.xp, score: base.score,
    stepEvery: base.step * (0.9 + rng() * 0.25), glideTime: base.glide,
    stepT: 0.5 + rng() * base.step,          // time until it next moves
    state: 'spawn', stateT: 0.7,             // spawn-in, then idle/telegraph/glide
    fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, toCx: cx, toCy: cy,
    path: null,                               // squares a slider crosses (for telegraphs)
    shotT: base.shotEvery ? 1 + rng() * base.shotEvery : 0,
    flash: 0, hop: 0,                         // hit flash; knight leap height 0..1
    phase: 1, summonT: 5, beamT: 6, burstT: 4, // king-only timers
    dead: false,
  };
}

// All squares a piece could move to from (cx, cy), by its real chess pattern.
// Sliders return every square along their rays; `limit` caps a slider's reach.
function movesFor(kind, cx, cy, limit = 6) {
  const out = [];
  const ray = (dx, dy, max) => {
    for (let i = 1; i <= max; i++) {
      const x = cx + dx * i, y = cy + dy * i;
      if (!inBoard(x, y)) break;
      out.push({ cx: x, cy: y });
    }
  };
  switch (kind) {
    case 'pawn': {
      // Forward is whichever orthogonal direction closes on the player most;
      // game passes the player's square via movesForPawn below.
      break;
    }
    case 'knight':
      for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]])
        if (inBoard(cx + dx, cy + dy)) out.push({ cx: cx + dx, cy: cy + dy });
      break;
    case 'bishop':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(dx, dy, limit);
      break;
    case 'rook':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy, limit);
      break;
    case 'queen':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy, limit);
      break;
    case 'king':
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        if ((dx || dy) && inBoard(cx + dx, cy + dy)) out.push({ cx: cx + dx, cy: cy + dy });
      break;
  }
  return out;
}

// Choose the move that hunts the player: the reachable square closest to the
// player's square, with a little randomness so pieces do not move in lockstep.
function chooseHuntMove(e, psq, rng, limit) {
  const moves = movesFor(e.kind, e.cx, e.cy, limit);
  if (!moves.length) return null;
  let best = null, bestScore = Infinity;
  for (const m of moves) {
    const s = dist2(m, psq) + rng() * 2.2;
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// The squares between a slider's start and target, for telegraph lines and for
// charge damage while it travels.
function pathSquares(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  while (x !== x1 || y !== y1) { x += dx; y += dy; out.push({ cx: x, cy: y }); }
  return out;
}

function startMove(e, target, world, glideScale = 1) {
  e.fromX = e.x; e.fromY = e.y;
  e.toCx = target.cx; e.toCy = target.cy;
  const c = center(target.cx, target.cy);
  e.toX = c.x; e.toY = c.y;
  const squares = Math.max(Math.abs(target.cx - e.cx), Math.abs(target.cy - e.cy));
  e.path = (e.kind === 'bishop' || e.kind === 'rook' || e.kind === 'queen') && squares > 1
    ? pathSquares(e.cx, e.cy, target.cx, target.cy) : null;
  e.glideDur = Math.max(0.14, e.glideTime * glideScale * (squares > 1 ? 1 + squares * 0.16 : 1));
  e.state = 'telegraph';
  e.stateT = e.kind === 'pawn' || e.kind === 'knight' ? 0.32 : 0.45;
  world.onTelegraph(e);
}

function pawnMove(e, psq, world) {
  // The pawn's "forward" is the orthogonal direction that most reduces the
  // distance to the player; its captures are the two diagonals off that step.
  const dx = psq.cx - e.cx, dy = psq.cy - e.cy;
  const fwd = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  const caps = [
    { cx: e.cx + fwd.x + fwd.y, cy: e.cy + fwd.y + fwd.x },
    { cx: e.cx + fwd.x - fwd.y, cy: e.cy + fwd.y - fwd.x },
  ];
  for (const c of caps) if (c.cx === psq.cx && c.cy === psq.cy) { startMove(e, c, world); return; }
  const ahead = { cx: e.cx + fwd.x, cy: e.cy + fwd.y };
  // Head-on, the pawn lunges straight onto the player's square — that lunge
  // IS its attack. (An earlier version sidestepped instead, which left
  // pawns orbiting an idle player forever without ever touching them.)
  if (inBoard(ahead.cx, ahead.cy)) { startMove(e, ahead, world); return; }
  const side = caps.find(c => inBoard(c.cx, c.cy));
  if (side) startMove(e, side, world);
}

// One enemy's turn of the clock. `world` gives it the player, the enemy list
// (for separation), and callbacks for shots, summons and effects.
export function updateEnemy(e, dt, world) {
  const { player, rng } = world;
  if (e.flash > 0) e.flash -= dt * 6;
  e.stateT -= dt;

  if (e.state === 'spawn') {
    if (e.stateT <= 0) { e.state = 'idle'; e.stepT = 0.3 + rng() * 0.5; }
    return;
  }

  if (e.state === 'telegraph') {
    if (e.stateT <= 0) { e.state = 'glide'; e.stateT = e.glideDur; world.onMoveStart(e); }
    return;
  }

  if (e.state === 'glide') {
    const t = 1 - Math.max(0, e.stateT) / e.glideDur;
    const ease = t * t * (3 - 2 * t);
    e.x = e.fromX + (e.toX - e.fromX) * ease;
    e.y = e.fromY + (e.toY - e.fromY) * ease;
    e.hop = e.kind === 'knight' ? Math.sin(t * Math.PI) : 0;
    // A charging slider hurts whatever it crosses.
    if (e.path && world.playerOnPath(e)) world.touchPlayer(e, 1);
    if (e.stateT <= 0) {
      e.cx = e.toCx; e.cy = e.toCy; e.x = e.toX; e.y = e.toY; e.hop = 0;
      e.state = 'idle'; e.stepT = e.stepEvery * (0.85 + rng() * 0.4);
      world.onLand(e);
    }
    return;
  }

  // idle: drift a hair toward the player so pieces feel alive between steps,
  // count down to the next chess move, and use any ranged attack it owns.
  const psq = squareOf(player.x, player.y);
  e.stepT -= dt;
  if (e.stepT <= 0) {
    if (e.kind === 'pawn') pawnMove(e, psq, world);
    else if (e.kind === 'rook') {
      // A rook that lines up with the player charges the whole line.
      const aligned = psq.cx === e.cx || psq.cy === e.cy;
      const m = aligned && dist2(e, psq) <= 49 ? { cx: psq.cx, cy: psq.cy } : chooseHuntMove(e, psq, rng, 5);
      if (m) startMove(e, m, world, aligned ? 0.55 : 1);
    } else if (e.kind === 'queen') {
      const m = chooseHuntMove(e, psq, rng, 5);
      if (m) startMove(e, m, world, 0.9);
    } else if (e.kind === 'king') {
      const m = chooseHuntMove(e, psq, rng, 1);
      if (m) startMove(e, m, world, 1);
    } else {
      const m = chooseHuntMove(e, psq, rng, e.kind === 'bishop' ? 5 : 6);
      if (m) startMove(e, m, world, 1);
    }
    if (e.state === 'idle') e.stepT = 0.4; // no legal move: wait and retry
  }

  // Ranged attacks.
  if (e.kind === 'bishop' || e.kind === 'queen') {
    e.shotT -= dt;
    if (e.shotT <= 0) {
      e.shotT = PIECES[e.kind].shotEvery * (0.85 + rng() * 0.4);
      if (e.kind === 'bishop') {
        // Only along its diagonals, as a bishop should.
        const dx = player.x - e.x, dy = player.y - e.y;
        if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 90) {
          const a = Math.atan2(dy, dx);
          world.addShot(e.x, e.y, Math.cos(a), Math.sin(a), e.dmg > 12 ? 11 : 9);
        }
      } else {
        // The queen fires a three-shot fan at the player.
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        for (const off of [-0.22, 0, 0.22]) world.addShot(e.x, e.y, Math.cos(a + off), Math.sin(a + off), 11);
      }
    }
  }

  if (e.kind === 'king') updateKing(e, dt, world);
}

// The King's phases: below 2/3 HP he paints rank/file and diagonal beams on
// the board; below 1/3 he also fires radial bursts and steps faster. He
// summons a court throughout — pawns first, then heavier guards.
function updateKing(e, dt, world) {
  const frac = e.hp / e.maxHp;
  e.phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  e.summonT -= dt;
  if (e.summonT <= 0) {
    e.summonT = e.phase === 3 ? 5.5 : 7.5;
    world.summonGuards(e.phase);
  }
  if (e.phase >= 2) {
    e.beamT -= dt;
    if (e.beamT <= 0) {
      e.beamT = e.phase === 3 ? 4.2 : 5.5;
      world.kingBeams(e, e.phase === 3 ? 'both' : (world.rng() < 0.5 ? 'cross' : 'diag'));
    }
  }
  if (e.phase >= 3) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burstT = 3.4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + world.rng() * 0.2;
        world.addShot(e.x, e.y, Math.cos(a), Math.sin(a), 12);
      }
      world.onBurst(e);
    }
  }
}
