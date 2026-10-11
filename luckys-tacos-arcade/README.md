# Lucky's Tacos: Arcade Attack — Phase 1

A mobile-first, Galaga-inspired arcade shooter built with **Phaser 3**, **TypeScript** and **Vite**.
You pilot the Taco Cruiser and defend the taco stand from waves of angry ingredients.

## Run it locally

```bash
cd luckys-tacos-arcade
npm install
npm run dev        # http://localhost:5173 (also printed on your LAN IP for phone testing)
```

Other scripts:

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run build`     | Typecheck + production build into `dist/`          |
| `npm run preview`   | Serve the production build (http://localhost:4173) |
| `npm test`          | Unit tests (Vitest) for the game logic             |
| `npm run typecheck` | TypeScript only                                    |

To play on a phone, run `npm run dev` and open the "Network" URL Vite prints from a phone on the same Wi-Fi.

## How to play

- **Touch:** drag anywhere on the screen to slide the ship (relative drag, so your finger never covers it).
- **Keyboard:** ← → or A / D. Space / Enter starts, R restarts after game over.
- The ship **fires automatically**.
- You have **3 lives**. Being hit gives a short invulnerable respawn.
- Points: Onion Ogre 50, Bell Pepper Bandit 80, Chili Commander 150 (takes 2 hits). **Diving enemies score double.**
- Clearing a wave starts the next one, faster and with more divers.
- The high score is saved in the browser's `localStorage`.

## Project layout

```
src/
  main.ts                 Phaser game config (360x640 portrait, scales to fit any screen)
  config/
    theme.ts              Brand palette (red, yellow, cream, dark) and fonts
    gameConfig.ts         All gameplay tuning numbers
  scenes/
    BootScene.ts          Draws all sprites procedurally (no image files yet)
    MenuScene.ts          Title, score table, high score, start
    GameScene.ts          Gameplay loop: shooting, collisions, lives, waves
    GameOverScene.ts      Results, new-high-score badge, play again / menu
  entities/               Player, Enemy, EnemyFormation (entry, sway, dives), Hud, Starfield
  systems/
    ScoreManager.ts       Score, lives, high score (pure TS, unit tested)
    waves.ts              Wave definitions and difficulty ramp (pure TS, unit tested)
    InputController.ts    Unified touch + keyboard input
  services/
    gameEvents.ts         Typed event bus: run:start, wave:start, wave:cleared,
                          enemy:destroyed, player:hit, run:end
    rewards.ts            RewardsProvider interface (no-op in Phase 1)
tests/                    Vitest unit tests
```

### Extension points for later phases

Phase 1 deliberately does **not** include any loyalty, ticket or merchant features. Two seams are in place for them:

1. **`gameEvents`**: subscribe from any module without touching scene code:
   ```ts
   import { gameEvents } from './services/gameEvents';
   gameEvents.on('run:end', (summary) => { /* send to backend, issue a QR ticket, ... */ });
   ```
   A failing handler is caught and logged so it can't crash gameplay.
2. **`setRewardsProvider()`**: replace the no-op provider. Whatever `onRunComplete()` returns
   (`{ headline, detail }`) is shown on the Game Over screen.

Sprites are generated in `BootScene` under fixed texture keys; real artwork can replace them by loading
images with the same keys.

### Debug hook

Opening the game with `?debug` exposes the Phaser instance as `window.__LUCKY_GAME__` for automated
smoke tests. Without it, nothing is exposed.
