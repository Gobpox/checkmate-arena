// CHECKMATE ARENA — the game itself: state, waves, combat, progression and UI.
// The pieces' chess brains live in pieces.js, the drawing in render.js, the
// numbers in config.js; this file wires them into a run: menu -> waves ->
// level-ups -> the King every tenth wave -> checkmate (game over) -> restart.
import {
  BOARD, WORLD, PLAYER, PIECES, WEAPONS, WEAPON_ORDER, UPGRADES,
  waveRecipe, isBossWave, waveScale,
} from './config.js';
import { createEnemy, updateEnemy, squareOf } from './pieces.js';
import { drawWorld } from './render.js';

const SQ = BOARD.sq, N = BOARD.squares;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGame({ canvas, input, audio, rng }) {
  const g = canvas.getContext('2d');
  const S = {
    mode: 'menu', // menu | playing | levelup | paused | dying | over
    t: 0, runTime: 0, wave: 0, kills: 0, score: 0,
    player: null, enemies: [], bullets: [], shots: [], gems: [], pickups: [],
    particles: [], floaters: [], beams: [], spawnQueue: [], spawnT: 0,
    intermission: 0, boss: null, shake: 0, shakeScale: 1, camX: WORLD / 2, camY: WORLD / 2,
    lastGemSound: 0, overStats: null,
  };

  // ------------------------------------------------------------ player ----
  function freshPlayer() {
    return {
      x: WORLD / 2, y: WORLD / 2, radius: PLAYER.radius, aim: -Math.PI / 2,
      hp: PLAYER.hp, maxHp: PLAYER.hp, level: 1, xp: 0, xpNeed: xpForLevel(1),
      speedMult: 1, dmgMult: 1, rateMult: 1, extraProj: 0, crit: 0.05, leech: 0,
      boom: 0, pierce: 0, armor: 1, magnetMult: 1, dashCdMult: 1,
      weapons: new Set(['blaster']), weapon: 'blaster', weaponColor: WEAPONS.blaster.color,
      fireT: 0, iframes: 0, dashT: 0, dashCd: 0, dashCdMax: PLAYER.dashCooldown,
      dashDx: 0, dashDy: 0, trail: [], dead: false,
    };
  }
  function xpForLevel(lv) { return 8 + (lv - 1) * 6; }

  function reset() {
    S.player = freshPlayer();
    S.enemies = []; S.bullets = []; S.shots = []; S.gems = []; S.pickups = [];
    S.particles = []; S.floaters = []; S.beams = []; S.spawnQueue = [];
    S.boss = null; S.wave = 0; S.kills = 0; S.score = 0; S.runTime = 0;
    S.intermission = 1.2; S.shake = 0;
  }

  // ------------------------------------------------------------- waves ----
  function nextWave() {
    S.wave++;
    const w = S.wave;
    if (isBossWave(w)) {
      banner(`WAVE ${w} — THE KING ARRIVES`);
      audio.boss();
      const king = spawnPiece('king', N >> 1, 1);
      S.boss = king;
      const cycle = w / 10;
      for (let i = 0; i < 2; i++) spawnPiece('rook', (N >> 1) - 2 + i * 4, 1);
      for (let i = 0; i < 1 + cycle; i++) spawnPiece('knight', 2 + i * 3, 0);
      for (let i = 0; i < 3; i++) spawnPiece('pawn', 3 + i * 5, 0);
    } else {
      banner(`WAVE ${w}`);
      const recipe = waveRecipe(w);
      const queue = [];
      for (const [kind, count] of Object.entries(recipe))
        for (let i = 0; i < count; i++) queue.push(kind);
      // Shuffle so kinds interleave instead of arriving in blocks.
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      S.spawnQueue = queue;
      S.spawnT = 0.5;
    }
    updateHud();
  }

  function spawnPiece(kind, cx, cy) {
    const scale = waveScale(S.wave);
    if (kind === 'king') scale.hp *= 1 + (S.wave / 10 - 1) * 0.9;
    const e = createEnemy(kind, clamp(cx, 0, N - 1), clamp(cy, 0, N - 1), scale, rng);
    S.enemies.push(e);
    burst(e.x, e.y, e.color, 10, 130);
    return e;
  }

  function spawnFromQueue() {
    const kind = S.spawnQueue.shift();
    const psq = squareOf(S.player.x, S.player.y);
    let cx = 0, cy = 0, tries = 0;
    do { // an edge square, never on top of the player
      const side = Math.floor(rng() * 4);
      cx = side === 0 ? 0 : side === 1 ? N - 1 : Math.floor(rng() * N);
      cy = side === 2 ? 0 : side === 3 ? N - 1 : Math.floor(rng() * N);
      tries++;
    } while (tries < 12 && Math.abs(cx - psq.cx) + Math.abs(cy - psq.cy) < 4);
    spawnPiece(kind, cx, cy);
  }

  // ------------------------------------------------------- piece world ----
  const world = {
    player: null, rng,
    onTelegraph() {},
    onMoveStart(e) { if (e.kind === 'rook' || e.kind === 'king') audio.step(); },
    onLand(e) {
      burst(e.x, e.y + 8, e.color, e.kind === 'knight' ? 10 : 5, 90);
      if (e.kind === 'knight') { // a knight's landing cracks the square
        const d = Math.hypot(S.player.x - e.x, S.player.y - e.y);
        if (d < 74) hurtPlayer(8, e.x, e.y);
      }
    },
    playerOnPath(e) {
      const p = S.player;
      return Math.hypot(p.x - e.x, p.y - e.y) < e.radius + p.radius + 18;
    },
    touchPlayer(e) { touchPlayer(e); },
    addShot(x, y, dx, dy, dmg) {
      S.shots.push({ x, y, dx, dy, dmg, speed: 330, life: 3.2 });
    },
    summonGuards(phase) {
      if (S.enemies.length > 38) return;
      const k = S.boss; if (!k) return;
      const kinds = phase === 1 ? ['pawn', 'pawn', 'pawn']
        : phase === 2 ? ['pawn', 'pawn', 'knight'] : ['knight', 'bishop', 'pawn', 'pawn'];
      for (const kind of kinds) {
        const cx = clamp(k.cx + Math.floor(rng() * 5) - 2, 0, N - 1);
        const cy = clamp(k.cy + Math.floor(rng() * 5) - 2, 0, N - 1);
        spawnPiece(kind, cx, cy);
      }
      banner('THE KING SUMMONS HIS COURT');
    },
    kingBeams(e, kind) {
      S.beams.push({ cx: e.cx, cy: e.cy, kind, t: 0.95, fired: false });
      audio.step();
    },
    onBurst(e) { burst(e.x, e.y, '#ff4dd2', 18, 220); audio.explode(false); },
  };

  // ------------------------------------------------------------ combat ----
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, v = (0.25 + rng() * 0.75) * speed;
      S.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.35 + rng() * 0.4, maxLife: 0.75, color, size: 2 + rng() * 4,
      });
    }
    if (S.particles.length > 420) S.particles.splice(0, S.particles.length - 420);
  }
  function floater(x, y, text, color) {
    S.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  function fireWeapons(dt) {
    const p = S.player;
    p.fireT -= dt;
    const wantFire = input.firing || input.touchAim;
    if (!wantFire || p.fireT > 0) return;
    const w = WEAPONS[p.weapon];
    p.fireT = 1 / (w.fireRate * p.rateMult);
    const count = w.projectiles + p.extraProj;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * w.spread * 2;
      const a = p.aim + off + (rng() - 0.5) * w.spread * 0.4;
      S.bullets.push({
        x: p.x + Math.cos(p.aim) * 20, y: p.y + Math.sin(p.aim) * 20,
        dx: Math.cos(a), dy: Math.sin(a), speed: w.projSpeed,
        dmg: w.dmg, pierce: w.pierce + p.pierce, aoe: Math.max(w.aoe, p.boom ? 52 : 0),
        aoeDmg: p.boom ? w.dmg * 0.45 : w.dmg * 0.7,
        color: w.color, size: w.size, life: w.life, hitSet: null,
      });
    }
    if (w.kick) { p.x -= Math.cos(p.aim) * w.kick; p.y -= Math.sin(p.aim) * w.kick; }
    audio.shoot(p.weapon);
  }

  function damageEnemy(e, dmg, isCrit, srcX, srcY) {
    e.hp -= dmg;
    e.flash = 1;
    if (isCrit) floater(e.x, e.y - 26, `${Math.round(dmg)}!`, '#ffd75e');
    if (e.hp <= 0 && !e.dead) killEnemy(e);
    else {
      audio.hit();
      // A nudge of knockback on light pieces sells the hit.
      if (e.kind === 'pawn' || e.kind === 'knight') {
        const a = Math.atan2(e.y - srcY, e.x - srcX);
        e.x += Math.cos(a) * 3; e.y += Math.sin(a) * 3;
      }
    }
  }

  function explodeAt(x, y, radius, dmg, color) {
    burst(x, y, color, 16, 260);
    S.shake = Math.min(1, S.shake + 0.25);
    for (const e of S.enemies) {
      if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.radius)
        damageEnemy(e, dmg, false, x, y);
    }
  }

  function killEnemy(e) {
    e.dead = true;
    S.kills++;
    S.score += e.score;
    const p = S.player;
    if (p.leech) p.hp = Math.min(p.maxHp, p.hp + p.leech);
    burst(e.x, e.y, e.color, e.kind === 'king' ? 60 : 16, e.kind === 'king' ? 320 : 200);
    burst(e.x, e.y, '#ffffff', 5, 140);
    audio.explode(e.kind === 'king' || e.kind === 'queen');
    if (e.kind === 'king') {
      S.shake = 1; S.boss = null;
      floater(e.x, e.y - 40, 'CHECKMATE!', '#ffd75e');
      dropWeapon(e.x, e.y);
      healOrb(e.x, e.y);
    } else if (e.kind === 'queen' && rng() < 0.4) dropWeapon(e.x, e.y);
    // XP: split the value into gems of 5 and 1.
    let v = e.xp;
    while (v >= 5) { S.gems.push({ x: e.x + (rng() - 0.5) * 22, y: e.y + (rng() - 0.5) * 22, v: 5, big: true }); v -= 5; }
    while (v > 0) { S.gems.push({ x: e.x + (rng() - 0.5) * 26, y: e.y + (rng() - 0.5) * 26, v: 1, big: false }); v--; }
  }

  function dropWeapon(x, y) {
    const missing = WEAPON_ORDER.filter(k => k !== 'blaster' && !S.player.weapons.has(k));
    if (!missing.length) { healOrb(x, y); return; }
    const kind = missing[Math.floor(rng() * missing.length)];
    const w = WEAPONS[kind];
    S.pickups.push({
      x, y, kind, color: w.color, heal: false,
      initial: w.name.split(' ').map(s => s[0]).slice(0, 2).join(''),
      label: w.name,
    });
  }
  function healOrb(x, y) {
    S.pickups.push({ x, y, kind: null, heal: true, color: '#0affc2', initial: '+', label: 'REPAIR +35' });
  }

  function touchPlayer(e) {
    const p = S.player;
    if (p.dead || p.iframes > 0 || p.dashT > 0) return;
    if (e.touchT && e.touchT > S.t) return;
    e.touchT = S.t + 0.7;
    hurtPlayer(e.dmg, e.x, e.y);
  }

  function hurtPlayer(dmg, srcX, srcY) {
    const p = S.player;
    if (p.dead || p.iframes > 0 || p.dashT > 0 || S.mode !== 'playing') return;
    const dealt = Math.max(1, Math.round(dmg * p.armor));
    p.hp -= dealt;
    p.iframes = PLAYER.iframes;
    S.shake = Math.min(1, S.shake + 0.3);
    $('vignette').style.opacity = 0.9;
    const a = Math.atan2(p.y - srcY, p.x - srcX);
    p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14;
    floater(p.x, p.y - 24, `-${dealt}`, '#ff3b5c');
    audio.hurt();
    if (p.hp <= 0) { p.hp = 0; die(); }
    updateHud();
  }

  function die() {
    const p = S.player;
    p.dead = true;
    S.mode = 'dying';
    S.deathT = 1.0;
    burst(p.x, p.y, '#22e6ff', 46, 300);
    burst(p.x, p.y, '#ffffff', 20, 200);
    S.shake = 1;
    audio.explode(true);
    audio.gameover();
  }

  // -------------------------------------------------------------- loop ----
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S.mode === 'playing' || S.mode === 'dying') step(dt);
    else if (S.mode === 'menu' || S.mode === 'over') S.t += dt;
    render();
  }

  function step(dt) {
    S.t += dt;
    const p = S.player;
    world.player = p;

    if (S.mode === 'dying') {
      S.deathT -= dt;
      updateParticles(dt);
      if (S.deathT <= 0) showGameOver();
      return;
    }
    S.runTime += dt;

    // --- player movement (WASD / arrows / left stick) ---
    let mx = 0, my = 0;
    if (input.held('w', 'arrowup')) my -= 1;
    if (input.held('s', 'arrowdown')) my += 1;
    if (input.held('a', 'arrowleft')) mx -= 1;
    if (input.held('d', 'arrowright')) mx += 1;
    if (input.moveX || input.moveY) { mx = input.moveX; my = input.moveY; }
    const mlen = Math.hypot(mx, my);
    if (mlen > 0.01) { mx /= Math.max(1, mlen); my /= Math.max(1, mlen); }
    const sprint = input.held('shift') ? PLAYER.sprintMult : 1;
    if (p.dashCd > 0) p.dashCd -= dt;
    if ((input.held(' ') || input.dashPressed) && p.dashCd <= 0 && p.dashT <= 0) {
      input.dashPressed = false;
      p.dashT = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown * p.dashCdMult; p.dashCdMax = p.dashCd;
      const dx = mlen > 0.01 ? mx : Math.cos(p.aim), dy = mlen > 0.01 ? my : Math.sin(p.aim);
      p.dashDx = dx; p.dashDy = dy;
      audio.dash();
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashDx * PLAYER.dashSpeed * dt;
      p.y += p.dashDy * PLAYER.dashSpeed * dt;
      p.trail.push({ x: p.x, y: p.y, life: 0.5 });
    } else {
      p.x += mx * PLAYER.speed * p.speedMult * sprint * dt;
      p.y += my * PLAYER.speed * p.speedMult * sprint * dt;
    }
    p.x = clamp(p.x, p.radius, WORLD - p.radius);
    p.y = clamp(p.y, p.radius, WORLD - p.radius);
    for (const tr of p.trail) tr.life -= dt * 2.4;
    p.trail = p.trail.filter(tr => tr.life > 0);
    if (p.iframes > 0) p.iframes -= dt;

    // --- aim: mouse in world space, or the right stick ---
    if (input.touchAim) p.aim = Math.atan2(input.aimY, input.aimX);
    else {
      const wx = S.camX + (input.mouseX - innerWidth / 2), wy = S.camY + (input.mouseY - innerHeight / 2);
      p.aim = Math.atan2(wy - p.y, wx - p.x);
    }

    fireWeapons(dt);

    // --- weapon switching ---
    const digit = ['1', '2', '3', '4', '5'].findIndex(k => input.keys.has(k));
    if (digit >= 0) selectWeapon(WEAPON_ORDER[digit]);
    if (input.keys.has('q')) { input.keys.delete('q'); cycleWeapon(); }

    // --- waves ---
    if (S.intermission > 0) {
      S.intermission -= dt;
      if (S.intermission <= 0 && S.enemies.length === 0 && S.spawnQueue.length === 0) nextWave();
    } else if (S.spawnQueue.length) {
      S.spawnT -= dt;
      if (S.spawnT <= 0 && S.enemies.length < 30) { spawnFromQueue(); S.spawnT = 0.55; }
    } else if (S.enemies.length === 0 && S.mode === 'playing') {
      // Wave cleared: a small repair, a breath, then the next wave.
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.12);
      audio.waveclear();
      banner(`WAVE ${S.wave} CLEARED`);
      S.intermission = 2.2;
    }

    // --- enemies ---
    for (const e of S.enemies) updateEnemy(e, dt, world);
    separateEnemies();
    // Contact reach carries a margin: the player spawns on a grid crossing
    // (512,512), so a piece gliding to that square's centre stops ~45 units
    // away — outside a strict radii sum, close enough to strike.
    for (const e of S.enemies) { // contact with the player
      if (e.state !== 'spawn' && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius + 18) touchPlayer(e);
    }
    S.enemies = S.enemies.filter(e => !e.dead);

    // --- king beams: t counts down through the warning (t > 0) into the
    // fired flash (t <= 0); the beam is removed once t passes -0.25. ---
    for (const b of S.beams) {
      b.t -= dt;
      if (!b.fired && b.t <= 0) {
        b.fired = true;
        audio.explode(false); S.shake = Math.min(1, S.shake + 0.35);
        const psq = squareOf(p.x, p.y);
        const onCross = psq.cx === b.cx || psq.cy === b.cy;
        const onDiag = Math.abs(psq.cx - b.cx) === Math.abs(psq.cy - b.cy);
        if ((b.kind === 'cross' && onCross) || (b.kind === 'diag' && onDiag) || (b.kind === 'both' && (onCross || onDiag)))
          hurtPlayer(22, (b.cx + 0.5) * SQ, (b.cy + 0.5) * SQ);
      }
    }
    S.beams = S.beams.filter(b => b.t > -0.25);

    // --- bullets ---
    for (const b of S.bullets) {
      b.x += b.dx * b.speed * dt; b.y += b.dy * b.speed * dt; b.life -= dt;
      if (b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) { b.life = 0; continue; }
      for (const e of S.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        if (b.hitSet && b.hitSet.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.size + 2) {
          const crit = rng() < p.crit;
          damageEnemy(e, b.dmg * p.dmgMult * (crit ? 2 : 1), crit, b.x - b.dx * 10, b.y - b.dy * 10);
          burst(b.x, b.y, b.color, 3, 120);
          if (b.aoe) explodeAt(b.x, b.y, b.aoe, b.aoeDmg * p.dmgMult, b.color);
          if (b.pierce > 0) { b.pierce--; (b.hitSet ??= new Set()).add(e); }
          else { b.life = 0; }
          break;
        }
      }
    }
    S.bullets = S.bullets.filter(b => b.life > 0);

    // --- enemy shots ---
    for (const s of S.shots) {
      s.x += s.dx * s.speed * dt; s.y += s.dy * s.speed * dt; s.life -= dt;
      if (Math.hypot(s.x - p.x, s.y - p.y) < p.radius + 7) { hurtPlayer(s.dmg, s.x - s.dx * 8, s.y - s.dy * 8); s.life = 0; }
      if (s.x < 0 || s.y < 0 || s.x > WORLD || s.y > WORLD) s.life = 0;
    }
    S.shots = S.shots.filter(s => s.life > 0);

    // --- gems & pickups ---
    const magnetR = PLAYER.magnet * p.magnetMult;
    for (const gem of S.gems) {
      const d = Math.hypot(p.x - gem.x, p.y - gem.y);
      if (d < magnetR) {
        const pull = 560 * dt;
        gem.x += (p.x - gem.x) / (d || 1) * pull; gem.y += (p.y - gem.y) / (d || 1) * pull;
      }
      if (d < p.radius + 12) {
        gem.got = true;
        p.xp += gem.v;
        if (S.t - S.lastGemSound > 0.07) { audio.gem(); S.lastGemSound = S.t; }
      }
    }
    S.gems = S.gems.filter(x => !x.got);
    for (const pk of S.pickups) {
      if (Math.hypot(p.x - pk.x, p.y - pk.y) < p.radius + 24) {
        pk.got = true;
        if (pk.heal) { p.hp = Math.min(p.maxHp, p.hp + 35); floater(p.x, p.y - 26, '+35 HP', '#0affc2'); }
        else {
          p.weapons.add(pk.kind); selectWeapon(pk.kind);
          floater(p.x, p.y - 26, WEAPONS[pk.kind].name, '#ffd75e');
          audio.levelup();
        }
        updateHud();
      }
    }
    S.pickups = S.pickups.filter(x => !x.got);

    // --- level up ---
    if (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed; p.level++; p.xpNeed = xpForLevel(p.level);
      openLevelUp();
    }

    updateParticles(dt);
    updateCamera(dt);
    updateHud();
    const v = $('vignette');
    if (v.style.opacity > 0) v.style.opacity = Math.max(p.hp < p.maxHp * 0.3 ? 0.35 : 0, v.style.opacity - dt * 1.6);
  }

  function separateEnemies() {
    const list = S.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'glide' || a.state === 'telegraph') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'glide' || b.state === 'telegraph') continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.radius + b.radius + 2;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
          const sa = squareOf(a.x, a.y); a.cx = sa.cx; a.cy = sa.cy;
          const sb = squareOf(b.x, b.y); b.cx = sb.cx; b.cy = sb.cy;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (const pt of S.particles) {
      pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92;
    }
    S.particles = S.particles.filter(pt => pt.life > 0);
    for (const f of S.floaters) { f.life -= dt; f.y -= 34 * dt; }
    S.floaters = S.floaters.filter(f => f.life > 0);
  }

  function updateCamera(dt) {
    const p = S.player;
    S.camX = clamp(p.x, innerWidth / 2, WORLD - innerWidth / 2);
    S.camY = clamp(p.y, innerHeight / 2, WORLD - innerHeight / 2);
    if (innerWidth >= WORLD) S.camX = WORLD / 2;
    if (innerHeight >= WORLD) S.camY = WORLD / 2;
    S.shake = Math.max(0, S.shake - dt * 2.6);
  }

  function render() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, w, h);
    const shAmp = S.shake * S.shake * 15 * S.shakeScale;
    const shX = shAmp * (rng() - 0.5) * 2, shY = shAmp * (rng() - 0.5) * 2;
    g.save();
    g.translate(w / 2 - S.camX + shX, h / 2 - S.camY + shY);
    drawWorld(g, S);
    g.restore();
  }

  // --------------------------------------------------------------- UI -----
  let bannerT = null;
  function banner(text) {
    const b = $('banner');
    b.textContent = text; b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.remove('show'), 2100);
    $('status').textContent = text;
  }

  function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  function updateHud() {
    const p = S.player; if (!p) return;
    $('hpfill').style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
    $('hptext').textContent = `HP ${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('xpfill').style.width = `${clamp(p.xp / p.xpNeed * 100, 0, 100)}%`;
    $('xptext').textContent = `LEVEL ${p.level}`;
    $('wave').textContent = S.wave;
    $('kills').textContent = S.kills;
    $('time').textContent = fmtTime(S.runTime);
    const w = WEAPONS[p.weapon];
    $('wname').textContent = w.name;
    $('winfo').textContent = `DMG ${Math.round(w.dmg * p.dmgMult)} · SPD ${(w.fireRate * p.rateMult).toFixed(1)}/s · OWNED ${p.weapons.size}/5`;
    if (S.boss && !S.boss.dead) {
      $('bossbar').classList.add('on');
      $('bossfill').style.width = `${clamp(S.boss.hp / S.boss.maxHp * 100, 0, 100)}%`;
    } else $('bossbar').classList.remove('on');
  }

  function selectWeapon(kind) {
    const p = S.player;
    if (!kind || !p.weapons.has(kind)) return;
    p.weapon = kind; p.weaponColor = WEAPONS[kind].color; p.fireT = Math.min(p.fireT, 0.12);
    updateHud();
  }
  function cycleWeapon() {
    const owned = WEAPON_ORDER.filter(k => S.player.weapons.has(k));
    const i = owned.indexOf(S.player.weapon);
    selectWeapon(owned[(i + 1) % owned.length]);
  }

  function openLevelUp() {
    S.mode = 'levelup';
    audio.levelup();
    const p = S.player;
    const pool = [...UPGRADES];
    const cards = [];
    // Sometimes offer a new weapon among the upgrades.
    const missing = WEAPON_ORDER.filter(k => k !== 'blaster' && !p.weapons.has(k));
    if (missing.length && rng() < 0.45) {
      const kind = missing[Math.floor(rng() * missing.length)];
      cards.push({ weapon: kind, icon: '🔫', name: WEAPONS[kind].name, desc: 'A new weapon joins your arsenal.' });
    }
    while (cards.length < 3 && pool.length) {
      const i = Math.floor(rng() * pool.length);
      cards.push(pool.splice(i, 1)[0]);
    }
    const wrap = $('cards');
    wrap.innerHTML = '';
    cards.forEach((c, i) => {
      const el = document.createElement('button');
      el.className = 'card';
      el.innerHTML = `<div class="ic">${c.icon}</div><h4>${c.name}</h4><p>${c.desc}</p><div class="key">PRESS ${i + 1}</div>`;
      el.addEventListener('click', () => chooseUpgrade(c));
      wrap.appendChild(el);
    });
    S.pendingCards = cards;
    $('lvltitle').textContent = `LEVEL ${p.level} — CHOOSE ONE UPGRADE`;
    show('levelup');
  }

  function chooseUpgrade(c) {
    const p = S.player;
    if (c.weapon) { p.weapons.add(c.weapon); selectWeapon(c.weapon); }
    else c.apply(p);
    hideAll();
    $('hud').classList.add('on');
    S.mode = 'playing';
    updateHud();
  }

  function show(id) {
    for (const s of ['menu', 'howto', 'settingsscreen', 'pausescreen', 'levelup', 'gameover'])
      $(s).classList.toggle('on', s === id);
  }
  function hideAll() { show('__none__'); }

  function showGameOver() {
    S.mode = 'over';
    S.overStats = { kills: S.kills, wave: S.wave, level: S.player.level, time: fmtTime(S.runTime), score: S.score };
    $('overstats').innerHTML =
      `KILLS <b>${S.overStats.kills}</b> · WAVE <b>${S.overStats.wave}</b><br>` +
      `LEVEL <b>${S.overStats.level}</b> · TIME <b>${S.overStats.time}</b> · SCORE <b>${S.overStats.score}</b>`;
    $('hud').classList.remove('on');
    show('gameover');
  }

  // ---------------------------------------------------------- controls ----
  function startRun() {
    audio.unlock();
    reset();
    hideAll();
    $('hud').classList.add('on');
    if (input.usingTouch) $('touch').classList.add('on');
    S.mode = 'playing';
    updateHud();
  }
  function pauseGame() {
    if (S.mode !== 'playing') return;
    S.mode = 'paused';
    show('pausescreen');
  }
  function resumeGame() {
    if (S.mode !== 'paused') return;
    hideAll(); $('hud').classList.add('on');
    S.mode = 'playing';
  }
  function toMenu() {
    reset();
    S.mode = 'menu';
    $('hud').classList.remove('on');
    show('menu');
  }

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (S.mode === 'playing') pauseGame();
      else if (S.mode === 'paused') resumeGame();
    }
    if (S.mode === 'levelup' && ['1', '2', '3'].includes(k)) {
      const c = S.pendingCards[Number(k) - 1];
      if (c) chooseUpgrade(c);
    }
    if (S.mode === 'over' && k === 'r') startRun();
    if (S.mode === 'menu' && k === 'enter') startRun();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

  return {
    S, startRun, pauseGame, resumeGame, toMenu, showGameOver,
    setShakeScale(v) { S.shakeScale = v; },
    begin() { reset(); S.mode = 'menu'; show('menu'); requestAnimationFrame(frame); },
    // Deterministic scene staging for the maker's screenshots (shots.js).
    stage(kind, seedRng) { stageScene(kind, seedRng); },
  };

  function stageScene(kind) {
    reset();
    const p = S.player;
    hideAll();
    if (kind === 'menu') {
      S.mode = 'menu'; show('menu');
      // A quiet court idles behind the menu, near the middle of the board
      // where the menu's dim overlay still lets their colours through.
      spawnPiece('knight', 4, 6); spawnPiece('queen', 11, 6); spawnPiece('pawn', 6, 11); spawnPiece('bishop', 10, 11);
      for (const e of S.enemies) { e.state = 'idle'; e.stepT = 99; }
      S.camX = WORLD / 2; S.camY = WORLD / 2;
    } else if (kind === 'play' || kind === 'boss') {
      S.mode = 'playing'; $('hud').classList.add('on');
      S.wave = kind === 'play' ? 6 : 10;
      p.level = kind === 'play' ? 4 : 9; p.weapons.add('laser'); p.weapon = 'laser'; p.weaponColor = WEAPONS.laser.color;
      p.x = WORLD / 2; p.y = WORLD / 2 + 60; p.aim = -0.7;
      const spots = kind === 'play'
        ? [['pawn', 6, 6], ['pawn', 7, 5], ['pawn', 9, 6], ['knight', 5, 9], ['bishop', 10, 9], ['rook', 11, 5], ['pawn', 8, 4]]
        : [['king', 8, 5], ['rook', 6, 5], ['rook', 10, 5], ['knight', 5, 8], ['bishop', 11, 8], ['pawn', 7, 9], ['pawn', 9, 9]];
      for (const [k2, cx, cy] of spots) {
        const e = spawnPiece(k2, cx, cy);
        e.state = 'idle'; e.stepT = 99;
        if (k2 === 'king') S.boss = e;
      }
      if (kind === 'boss') {
        p.y = WORLD / 2 + 110;
        S.beams.push({ cx: 8, cy: 5, kind: 'both', t: 1.2, fired: false });
      }
      for (let i = 0; i < 7; i++)
        S.bullets.push({ x: p.x + 30 + i * 26, y: p.y - 22 - i * 13, dx: 0.92, dy: -0.39, speed: 0, dmg: 1, pierce: 0, aoe: 0, color: '#0affc2', size: 3, life: 9 });
      for (let i = 0; i < 5; i++) S.gems.push({ x: p.x - 90 + i * 34, y: p.y + 66 + (i % 2) * 16, v: i ? 1 : 5, big: !i });
      burst(p.x + 130, p.y - 60, '#ff5d7a', 16, 180);
      S.camX = clamp(p.x, innerWidth / 2, WORLD - innerWidth / 2);
      S.camY = clamp(p.y, innerHeight / 2, WORLD - innerHeight / 2);
      updateHud();
    } else if (kind === 'over') {
      S.mode = 'playing';
      S.wave = 12; S.kills = 148; S.runTime = 754; p.level = 11;
      die();
      S.mode = 'over';
      showGameOver();
    }
    S.t = 1.4;
    render();
  }
}
