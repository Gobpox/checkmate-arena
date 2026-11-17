# CHECKMATE ARENA

[![make.fun best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/Gobpox/checkmate-arena/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/Gobpox/checkmate-arena/reward.svg)](https://make.fun/bounty/best-game-01)

**The pieces are alive. Survive the board.**

CHECKMATE ARENA is a neon arena shooter on a 16×16 chessboard where every
enemy is a living chess piece that moves by the real rules of chess. Pawns
march and capture diagonally, knights leap in an L and crack the square they
land on, bishops slide and snipe along diagonals, rooks charge whole ranks
and files, queens do all of it at once — and every tenth wave **the Neon
King** arrives with his court, painting the board with beam warnings before
he fires.

## How to play

- **Move** — WASD / arrow keys (or the left touch stick)
- **Aim & fire** — mouse, hold to shoot (or the right touch stick)
- **Dash** — Space / Shift sprint, with a burst of invulnerability
- **Survive waves** — pieces spawn at the board's edge; the square a piece
  is about to take lights up before it moves, so read the board and be
  somewhere else
- **Level up** — collect the XP gems pieces drop and pick 1 of 3 upgrades:
  damage, fire rate, new projectiles, lifesteal, crit, explosives, armour…
- **Win new weapons** — queens sometimes drop one, the King always does:
  Rapid Laser, Scatter Cannon, Rail Lance and Nova Launcher join the Basic
  Blaster (switch with 1–5 or Q)
- **Boss waves** — every 10th wave. The King summons his court, and from
  two-thirds health he sweeps the board with rank/file and diagonal beams;
  below one-third he adds radial bursts. Kill him for a **CHECKMATE!**

## Tech

One static page, no build step, no network calls, no external assets:
plain ES modules and a `<canvas>`. All art is drawn in code (neon glyphs,
telegraphed squares, particles) and all audio is synthesized live with
WebAudio — a minor-key sequencer loop plus per-weapon sound effects. The
game is deterministic-scene friendly: `game/index.html?shot=menu|play|boss|over`
stages the frozen scenes the screenshots in `screenshots/` were captured
from, and `?debug=1` exposes live state for automated playtests.

Run it locally with any static server, e.g. `node serve.ts`, then open
`http://localhost:8080`.

## Layout

- `game/` — the game itself (`index.html` + `src/` modules: config, chess
  piece AI, game loop, renderer, input, synthesized audio)
- `screenshots/` — real browser captures of the menu, mid-wave play, the
  King boss fight and the game-over screen
- `main.ts` — the make.fun handover program: copies `game/` and
  `screenshots/` to the output directory and writes the dossier
- `vendor/makefun-game.ts` — the kit's dossier builder, vendored unchanged

An entry to make.fun's [best-game-01](https://make.fun/bounty/best-game-01)
bounty. MIT licensed — see `LICENSE`.
