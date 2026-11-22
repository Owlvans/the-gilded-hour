# The Gilded Hour — a heist in three rooms

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Owlvans/the-gilded-hour/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Owlvans/the-gilded-hour/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
![license](https://img.shields.io/badge/license-MIT-blue)

A complete, original top-down heist game that plays offline in a desktop
browser from its own files. One thief, one golden clock, three rooms, and a
getaway van with the engine running.

**Play it:** serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) — no build step, no network.

## The job

Lift the main loot in each room to open its exit, then reach the exit. Three
rooms, one screen each:

1. **The Gallery** — learn the cones. Two guards, one camera, the golden clock.
2. **The Counting House** — three guards, two cameras, the cash vault.
3. **The Vault Floor** — open floor, three cameras, a rover. The vents are the
   safe way across. Then the van.

## The rules of the house

- **Guards** patrol with vision cones. Their awareness fills while they see
  you; at full they chase your *last known* position, then search it.
- **Cameras** sweep arcs and feed the same alarm meter. **E** fires an EMP
  burst (2 per run) that kills every camera for 8 seconds.
- **The alarm meter** rises while anyone sees you and decays while you hide.
  At 100 the house locks down: guards converge, the exit seals.
- A guard that touches you gives a half-second fair-caught warning first.
- **Q** tosses a marble; the clink pulls nearby guards to look. **Shift**
  sneaks — slower, harder to spot. **Space** grabs loot and slips into vents.

## Controls

WASD / arrows — move · Shift — sneak · Q — marble · E — EMP · Space — grab / vent

## Screenshots

All four under `screenshots/` are real renders of this game's own code,
staged by `game/src/shots.js` (each scene plays the real rules forward from a
fresh world with a scripted autopilot, so the same script always gives the
same frame). `1-cover.png` is the Gallery mid-crossing: the thief, a guard
cone, a camera cone, the loot pedestal and the alarm meter in one frame.

## Files

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `game/` — the game as static files: `index.html` plus ES modules under
  `src/` (`config.js`, `levels.js`, `ai.js`, `render.js`, `audio.js`,
  `main.js`, `shots.js`). All art is drawn on canvas; all sound is
  synthesized Web Audio. No libraries, no network.
- `vendor/makefun-game.ts` — the kit's library, unchanged.
- `screenshots/` — the four staged screenshots.

## Referral

Built for make.fun's `best-heist-game-20261122-0559` bounty. Referral code:
`kh59vrea`.
