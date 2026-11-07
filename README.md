# Mau-Mau

A browser-based Mau-Mau card game (German shedding game, 32-card deck).
Play against 1–3 bots or with friends over a shared link — no accounts, no backend.

## Status

| Step | What | Status |
|---|---|---|
| 1 | Project scaffold + pure game engine + Vitest tests | ✅ done |
| 2 | Local game vs. bots with Kenney card art | ⏳ next |
| 3 | PeerJS multiplayer with shared links | — |
| 4 | Vercel deployment (auto-deploy from `main`) | — |

## Setup

Requires **Node 22** (see `.nvmrc`). Vite and Vitest no longer support Node 16.

```bash
nvm use        # picks Node 22 from .nvmrc
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run all Vitest tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

Deployment instructions will be added in step 4.

## Project layout

```
src/engine/   Pure game engine — no DOM, no network
  cards.ts      Deck, suits, ranks, point values
  rng.ts        Seeded RNG (Mulberry32) and shuffle
  rules.ts      Rules config and defaults
  types.ts      GameState, Move, GameEvent, VisibleState
  legal.ts      Which cards can be played (shared by referee, UI and bots)
  setup.ts      createGame, startNextRound, startNewMatch
  applyMove.ts  The referee: validates and applies moves
  visible.ts    getVisibleState, redactEvents (hide private info)
tests/engine/ Vitest tests for every rule, plus random full-game simulations
```

## Engine API

```ts
import { createGame, applyMove, getVisibleState, makeRules } from './src/engine';

const rules = makeRules({ scoring: true });
let state = createGame([{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }], rules, 1234);

const result = applyMove(state, { type: 'play', player: 'a', cardId: '7-hearts', mau: false }, rules);
if (result.ok) state = result.state;       // result.events describes what happened
else console.log(result.error);            // e.g. 'card_not_playable', 'not_your_turn'

const view = getVisibleState(state, 'b');  // what Ben may see
```

Moves: `play` (with `wish` for a Jack, optional `mau: true`), `draw`, `pass` (only after drawing a playable card), `mau`.
The same seed always produces the same game, which keeps tests reproducible.

## Rules config

All rules live in one object (`src/engine/rules.ts`) and can be toggled.

| Field | Default | Meaning |
|---|---|---|
| `handSize` | `5` | Cards dealt per player |
| `sevenDrawTwo` | `true` | A 7 makes the next player draw 2 |
| `sevenStacking` | `true` | A 7 can be answered with a 7; the penalty accumulates (2, 4, 6…) |
| `eightSkips` | `true` | An 8 skips the next player |
| `jackWild` | `true` | A Jack (Bube) fits on anything; the player wishes a suit ("Ich wünsche mir…") |
| `jackOnJack` | `false` | Allow a Jack on a Jack |
| `playDrawnCard` | `true` | After drawing 1, the drawn card may be played if it fits |
| `mauRequired` | `true` | Must call "Mau" when going down to one card |
| `mauPenalty` | `1` | Cards drawn for forgetting "Mau" |
| `scoring` | `false` | Score leftover cards across rounds; lowest total wins |
| `roundsPerMatch` | `5` | Rounds in a scored match |

Fixed behavior:

- Match the top card by suit or rank. After a Jack, only the wished suit counts.
- While a 7-penalty is open, only another 7 may be played; drawing takes the whole penalty and ends the turn.
- You may draw instead of playing even if you could play.
- When the draw pile is empty, the discard pile (except the top card) is reshuffled into a new draw pile.
- If the starting card is a Jack, it goes under the draw pile and a new card is flipped. A starting 7 or 8 has no effect.
- The winning card needs no Mau call and no wish.
- Scoring: Jack 20, Ace 11, Ten 10, King 4, Queen 3, 7–9 face value.

## Asset license

Card art (from step 2): [Kenney "Playing Cards Pack"](https://kenney.nl/assets/playing-cards-pack), released under **CC0** (public domain). No attribution is required, but credit goes to Kenney.
