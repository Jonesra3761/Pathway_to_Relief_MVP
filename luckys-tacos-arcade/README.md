# Lucky's Tacos Arcade

A mobile-first game collection built with **Phaser 3**, **TypeScript** and **Vite**. Players land on a
game-select lobby and pick one of:

| Game              | Type                              | Credits            |
| ----------------- | --------------------------------- | ------------------ |
| **Arcade Attack** | Galaga-inspired shooter (Phase 1) | Free play          |
| **Taco Slots**    | 3-reel, 5-line slot machine       | Uses play credits  |
| **Taco 21**       | Blackjack against the dealer      | Uses play credits  |

In Arcade Attack you pilot the Taco Cruiser and defend the taco stand from waves of angry ingredients.

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

## Play credits

Taco Slots and Taco 21 share one **play-credit wallet** (`src/systems/CreditWallet.ts`, accessed through
`getWallet()` in `src/services/wallet.ts`). It is saved in the browser's `localStorage`.

- New players start with 100 credits. When the balance drops below a game's minimum bet, a
  **FREE REFILL** button tops it up with another 100.
- Credits are whole numbers, never go negative, and **have no cash value**. Nothing can be bought or
  redeemed in this phase.
- Every change carries a reason (`starter`, `refill`, `bet`, `payout`, `refund`, plus reserved
  `purchase` and `promo`) so a future "credits per purchase" integration can call
  `getWallet().deposit(n, 'purchase')` without touching game code.
- Each settled round emits a `casino:round` event (`{ game, wagered, returned }`) for future reporting.

## How to play Arcade Attack

- **Touch:** drag anywhere on the screen to slide the ship (relative drag, so your finger never covers it).
- **Keyboard:** ← → or A / D. Space / Enter starts, R restarts after game over.
- The ship **fires automatically**.
- You have **3 lives**. Being hit gives a short invulnerable respawn.
- Points: Onion Ogre 50, Bell Pepper Bandit 80, Chili Commander 150 (takes 2 hits). **Diving enemies score double.**
- Clearing a wave starts the next one, faster and with more divers.
- The high score is saved in the browser's `localStorage`.

## How to play Taco Slots

- 3 reels, 3 rows, **5 paylines** always on: the three rows plus both diagonals.
- Choose a line bet of 1, 2 or 5 with − / +, so the total bet is 5, 10 or 25. Tap **SPIN** (or press Space).
- Three of a kind on a line pays the line bet × the symbol's pay: Lucky Taco 400, Hot Sauce 60,
  Chili 25, Avocado 12, Lime 8, Onion 5. Wins on different lines add up.
- The **Lucky Taco is wild** and stands in for any symbol; three Tacos on a line is the jackpot.
- **PAYS** opens the paytable and the payline shapes.
- The math is verified by enumerating every reel combination in `tests/slots.test.ts`: about
  **94.8% average return**, and about 31% of spins pay something.

## How to play Taco 21 (blackjack)

- Pick a chip (2, 4, 10 or 20) and tap **DEAL**. Then **HIT**, **STAND**, **DOUBLE** or **SPLIT**.
- House rules: 6-deck shoe; **blackjack pays 3 to 2**; **dealer stands on soft 17**; the dealer peeks for
  blackjack with an Ace or ten showing.
- Double on any first two cards, including after a split (except split Aces).
- Split one pair per round. Split Aces get one card each, and 21 on a split hand pays 1:1, not 3:2.
- No insurance, surrender or re-split.
- The back button is hidden during a hand so a stake can't be abandoned by accident. If the browser
  is closed mid-hand, that hand's stake is refunded the next time Taco 21 opens.

## Project layout

```
src/
  main.ts                 Phaser game config (360x640 portrait, scales to fit any screen)
  games/
    registry.ts           The list of games the lobby shows (with an `enabled` flag per game)
    slots/                Taco Slots: pure math module, textures, scene
    blackjack/            Taco 21: pure rules engine, textures, scene
  config/
    theme.ts              Brand palette (red, yellow, cream, dark) and fonts
    gameConfig.ts         All gameplay tuning numbers
  scenes/
    BootScene.ts          Draws shared sprites procedurally (no image files yet)
    LobbyScene.ts         Game-select screen built from the registry
    MenuScene.ts          Arcade Attack title, score table, high score, start
    GameScene.ts          Gameplay loop: shooting, collisions, lives, waves
    GameOverScene.ts      Results, new-high-score badge, play again / menu
  entities/               Player, Enemy, EnemyFormation (entry, sway, dives), Hud, Starfield
  systems/
    ScoreManager.ts       Score, lives, high score (pure TS, unit tested)
    CreditWallet.ts       Play-credit balance shared by the credit games (unit tested)
    waves.ts              Wave definitions and difficulty ramp (pure TS, unit tested)
    InputController.ts    Unified touch + keyboard input
  services/
    gameEvents.ts         Typed event bus: run:start, wave:start, wave:cleared,
                          enemy:destroyed, player:hit, run:end, casino:round
    wallet.ts             App-wide CreditWallet instance
    rewards.ts            RewardsProvider interface (no-op in Phase 1)
tests/                    Vitest unit tests
```

### Extension points for later phases

Loyalty, ticket, purchase and merchant features are deliberately **not** built yet. These seams are in place for them:

1. **`gameEvents`**: subscribe from any module without touching scene code:
   ```ts
   import { gameEvents } from './services/gameEvents';
   gameEvents.on('run:end', (summary) => { /* send to backend, issue a QR ticket, ... */ });
   ```
   A failing handler is caught and logged so it can't crash gameplay.
2. **`getWallet().deposit(n, 'purchase')`**: the hook for granting credits per purchase.
3. **`GAMES` in `src/games/registry.ts`**: a merchant dashboard can later drive each game's `enabled` flag.
4. **`setRewardsProvider()`**: replace the no-op provider. Whatever `onRunComplete()` returns
   (`{ headline, detail }`) is shown on the Game Over screen.

Sprites are generated in `BootScene` under fixed texture keys; real artwork can replace them by loading
images with the same keys.

### Debug hook

Opening the game with `?debug` exposes the Phaser instance as `window.__LUCKY_GAME__` for automated
smoke tests. Without it, nothing is exposed.
