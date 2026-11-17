// CHECKMATE ARENA — rendering: a neon chessboard seen from above with a 2.5D
// lift (pieces float over their shadows; a leaping knight rises higher). All
// drawing is procedural canvas work — no image assets. Glow is faked with
// layered strokes instead of shadowBlur wherever it repeats, to keep the
// frame rate steady with dozens of pieces on the board.
import { BOARD, WORLD } from './config.js';

const SQ = BOARD.sq, N = BOARD.squares;

export function drawBoard(g, t) {
  // The squares: deep blue-black and pale slate, alternating, with a slow
  // breathing pulse travelling across the board so it never feels static.
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const light = (cx + cy) % 2 === 0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.7 + (cx + cy) * 0.55);
      g.fillStyle = light
        ? `rgb(${26 + pulse * 6}, ${34 + pulse * 7}, ${54 + pulse * 9})`
        : `rgb(${10 + pulse * 3}, ${13 + pulse * 3}, ${24 + pulse * 5})`;
      g.fillRect(cx * SQ, cy * SQ, SQ, SQ);
    }
  }
  // Grid lines.
  g.strokeStyle = 'rgba(34, 230, 255, 0.13)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    g.moveTo(i * SQ, 0); g.lineTo(i * SQ, WORLD);
    g.moveTo(0, i * SQ); g.lineTo(WORLD, i * SQ);
  }
  g.stroke();
  // The arena wall: a bright double frame.
  g.strokeStyle = 'rgba(34, 230, 255, 0.85)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, WORLD - 3, WORLD - 3);
  g.strokeStyle = 'rgba(180, 92, 255, 0.4)'; g.lineWidth = 9;
  g.strokeRect(-4, -4, WORLD + 8, WORLD + 8);
}

function squareGlow(g, cx, cy, color, alpha, fill = true) {
  const x = cx * SQ, y = cy * SQ;
  if (fill) { g.fillStyle = color; g.globalAlpha = alpha * 0.22; g.fillRect(x + 2, y + 2, SQ - 4, SQ - 4); }
  g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = 2;
  g.strokeRect(x + 2.5, y + 2.5, SQ - 5, SQ - 5);
  g.globalAlpha = 1;
}

// Telegraphs: the squares and lines the pieces are about to take, plus the
// King's beam warnings. Drawn under everything that moves.
export function drawTelegraphs(g, S) {
  for (const e of S.enemies) {
    if (e.state !== 'telegraph') continue;
    const pulse = 0.55 + 0.45 * Math.sin(S.t * 18);
    if (e.path) for (const s of e.path) squareGlow(g, s.cx, s.cy, e.color, 0.35 * pulse);
    squareGlow(g, e.toCx, e.toCy, e.color, pulse);
  }
  for (const b of S.beams) {
    const warn = b.t > 0;
    g.save();
    g.globalAlpha = warn ? 0.16 + 0.1 * Math.sin(S.t * 20) : 0.5;
    g.fillStyle = warn ? '#ff3b5c' : '#ff7847';
    const c = (b.cy + 0.5) * SQ, r = (b.cx + 0.5) * SQ;
    if (b.kind === 'cross' || b.kind === 'both') {
      g.fillRect(0, b.cy * SQ + 6, WORLD, SQ - 12);
      g.fillRect(b.cx * SQ + 6, 0, SQ - 12, WORLD);
    }
    if (b.kind === 'diag' || b.kind === 'both') {
      g.translate(r, c); g.rotate(Math.PI / 4);
      g.fillRect(-WORLD, -SQ / 2 + 6, WORLD * 2, SQ - 12);
      g.rotate(-Math.PI / 2);
      g.fillRect(-WORLD, -SQ / 2 + 6, WORLD * 2, SQ - 12);
    }
    g.restore();
  }
}

function ellipse(g, x, y, rx, ry, color, alpha) {
  g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
}

export function drawGems(g, S) {
  for (const gem of S.gems) {
    const bob = Math.sin(S.t * 4 + gem.x * 0.05) * 3;
    g.save();
    g.translate(gem.x, gem.y + bob);
    g.rotate(Math.PI / 4);
    g.fillStyle = gem.big ? '#b45cff' : '#22e6ff';
    const s = gem.big ? 8 : 5.5;
    g.fillRect(-s / 2, -s / 2, s, s);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(-s / 4, -s / 4, s / 2, s / 2);
    g.restore();
  }
}

export function drawPickups(g, S) {
  for (const p of S.pickups) {
    const bob = Math.sin(S.t * 3 + p.x) * 4;
    g.save();
    g.translate(p.x, p.y + bob);
    g.strokeStyle = p.color; g.lineWidth = 2;
    g.fillStyle = 'rgba(6,10,20,0.85)';
    g.beginPath(); g.roundRect(-21, -21, 42, 42, 9); g.fill(); g.stroke();
    g.fillStyle = p.color; g.font = '900 21px "Segoe UI", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.initial, 0, 1);
    g.font = '700 9px "Segoe UI", sans-serif';
    g.fillText(p.label, 0, 32);
    g.restore();
  }
}

function drawPieceBody(g, e, t) {
  const lift = 7 + (e.hop || 0) * 42 + (e.state === 'spawn' ? (1 - Math.max(0, e.stateT) / 0.7) * 10 : 0);
  ellipse(g, e.x, e.y + e.radius * 0.72, e.radius * 0.95, e.radius * 0.34, '#000', 0.42);
  // A coloured base ring, like a chess piece's foot.
  g.strokeStyle = e.color; g.globalAlpha = 0.75; g.lineWidth = 2.5;
  g.beginPath(); g.ellipse(e.x, e.y + e.radius * 0.66, e.radius * 0.8, e.radius * 0.27, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  // The glyph itself.
  const flash = e.flash > 0.4;
  g.font = `${e.radius * 2.15}px "Segoe UI Symbol", "Noto Sans Symbols 2", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = flash ? '#ffffff' : e.color;
  g.globalAlpha = e.state === 'spawn' ? 0.4 + 0.6 * (1 - Math.max(0, e.stateT) / 0.7) : 1;
  g.fillText(e.glyph, e.x, e.y - lift);
  g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
  if (!flash) g.fillText(e.glyph, e.x, e.y - lift - 1.5);
  g.globalAlpha = 1;
  // HP bar once hurt (the King's lives in the HUD instead).
  if (e.hp < e.maxHp && e.kind !== 'king') {
    const w = e.radius * 1.9, frac = Math.max(0, e.hp / e.maxHp);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(e.x - w / 2, e.y - lift - e.radius - 13, w, 5);
    g.fillStyle = frac > 0.4 ? '#0affc2' : '#ff3b5c';
    g.fillRect(e.x - w / 2, e.y - lift - e.radius - 13, w * frac, 5);
  }
}

export function drawPlayer(g, S) {
  const p = S.player;
  if (p.dead) return;
  ellipse(g, p.x, p.y + 12, 17, 6.5, '#000', 0.45);
  for (const tr of p.trail) {
    g.globalAlpha = tr.life * 0.35; g.fillStyle = '#22e6ff';
    g.beginPath(); g.arc(tr.x, tr.y, 11 * tr.life + 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const blink = p.iframes > 0 && Math.floor(S.t * 16) % 2 === 0;
  // A soft glow pool so the player reads instantly anywhere on the board.
  const glow = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, 34);
  glow.addColorStop(0, 'rgba(34,230,255,0.30)');
  glow.addColorStop(1, 'rgba(34,230,255,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(p.x, p.y, 34, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.aim);
  // The barrel, in the current weapon's colour, with a nose cone at its base.
  g.fillStyle = p.weaponColor;
  g.fillRect(9, -3.5, 19, 7);
  g.beginPath(); g.moveTo(4, -9); g.lineTo(16, 0); g.lineTo(4, 9); g.closePath(); g.fill();
  g.restore();
  g.save();
  g.translate(p.x, p.y - 4);
  g.globalAlpha = blink ? 0.35 : 1;
  // A ringed neon core: the player's "white piece".
  g.strokeStyle = '#22e6ff'; g.lineWidth = 3.5;
  g.beginPath(); g.arc(0, 0, 15.5, S.t * 2.2, S.t * 2.2 + Math.PI * 1.5); g.stroke();
  g.strokeStyle = '#b45cff';
  g.beginPath(); g.arc(0, 0, 15.5, S.t * 2.2 + Math.PI, S.t * 2.2 + Math.PI * 1.6); g.stroke();
  g.fillStyle = '#eaffff';
  g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#22e6ff';
  g.beginPath(); g.arc(0, 0, 4.2, 0, Math.PI * 2); g.fill();
  g.restore();
  // Dash cooldown pip.
  if (p.dashCd > 0) {
    g.fillStyle = 'rgba(255,215,94,0.8)';
    g.fillRect(p.x - 12, p.y + 18, 24 * (1 - p.dashCd / p.dashCdMax), 3);
  }
}

export function drawProjectiles(g, S) {
  for (const b of S.bullets) {
    g.strokeStyle = b.color; g.lineWidth = b.size; g.lineCap = 'round';
    g.beginPath(); g.moveTo(b.x - b.dx * 13, b.y - b.dy * 13); g.lineTo(b.x, b.y); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(b.x, b.y, b.size * 0.45, 0, Math.PI * 2); g.fill();
  }
  for (const s of S.shots) {
    g.fillStyle = '#ff4dd2';
    g.beginPath(); g.arc(s.x, s.y, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(s.x, s.y, 2.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,77,210,0.4)'; g.lineWidth = 2;
    g.beginPath(); g.arc(s.x, s.y, 10 + Math.sin(S.t * 12 + s.x) * 2, 0, Math.PI * 2); g.stroke();
  }
}

export function drawParticles(g, S) {
  for (const pt of S.particles) {
    g.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    g.fillStyle = pt.color;
    g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  g.globalAlpha = 1;
  g.font = '700 13px "Segoe UI", sans-serif'; g.textAlign = 'center';
  for (const f of S.floaters) {
    g.globalAlpha = Math.max(0, f.life / f.maxLife);
    g.fillStyle = f.color;
    g.fillText(f.text, f.x, f.y);
  }
  g.globalAlpha = 1;
}

export function drawWorld(g, S) {
  drawBoard(g, S.t);
  drawTelegraphs(g, S);
  drawGems(g, S);
  drawPickups(g, S);
  // Pieces sorted by y so lower pieces overlap higher ones (the 2.5D trick).
  const sorted = [...S.enemies].sort((a, b) => a.y - b.y);
  for (const e of sorted) drawPieceBody(g, e, S.t);
  drawPlayer(g, S);
  drawProjectiles(g, S);
  drawParticles(g, S);
}
