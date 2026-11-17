// CHECKMATE ARENA — bootstrap: build the pieces (input, audio, game), wire the
// menu buttons and settings sliders, and start. With ?shot=<scene> in the URL
// it stages a frozen screenshot scene instead of a live run (see shots.js).
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { makeRng } from './rng.js';
import { shotFromUrl } from './shots.js';

const canvas = document.getElementById('game');
const shot = shotFromUrl();
const rng = makeRng(shot ? shot.seed * 7919 + 13 : (Date.now() & 0xffffff));
const input = createInput(canvas);
const audio = createAudio();
const game = createGame({ canvas, input, audio, rng });

const $ = id => document.getElementById(id);
function showOnly(id) {
  for (const s of ['menu', 'howto', 'settingsscreen', 'pausescreen', 'levelup', 'gameover'])
    $(s).classList.toggle('on', s === id);
}

// Menu wiring.
$('play').addEventListener('click', () => game.startRun());
$('how').addEventListener('click', () => showOnly('howto'));
$('howback').addEventListener('click', () => showOnly('menu'));
$('settings').addEventListener('click', () => showOnly('settingsscreen'));
$('setback').addEventListener('click', () => showOnly('menu'));
$('resume').addEventListener('click', () => game.resumeGame());
$('restart2').addEventListener('click', () => game.startRun());
$('quitmenu').addEventListener('click', () => game.toMenu());
$('again').addEventListener('click', () => game.startRun());
$('gomenu').addEventListener('click', () => game.toMenu());
addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Settings sliders.
$('volmusic').addEventListener('input', e => audio.setMusic(e.target.value / 100));
$('volsfx').addEventListener('input', e => audio.setSfx(e.target.value / 100));
$('volshake').addEventListener('input', e => game.setShakeScale(e.target.value / 100));

// Automated playtests (and only they) can peek at live state: ?debug=1
// exposes the state object so a headless driver can assert on it.
if (new URLSearchParams(location.search).has('debug')) window.__arena = game.S;

if (shot) {
  // Frozen scene for the maker's screenshots: stage it, let fonts and the
  // first frames settle, then flag readiness for the capture tool.
  game.begin();
  game.stage(shot.shot, rng);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.dataset.shotReady = shot.shot;
  }));
} else {
  game.begin();
}
