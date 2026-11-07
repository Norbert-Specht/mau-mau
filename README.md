# Mau-Mau

A browser-based Mau-Mau card game (German shedding game, 32-card deck).
Play against 1–3 bots or with friends over a shared link — no accounts, no backend.

**▶ Play: https://mau-mau-three.vercel.app**

## Status

| Step | What | Status |
|---|---|---|
| 1 | Project scaffold + pure game engine + Vitest tests | ✅ done |
| 2 | Local game vs. bots with Kenney card art | ✅ done |
| 3 | PeerJS multiplayer with shared links | ✅ done |
| 4 | Vercel deployment (auto-deploy from `main`) | ✅ done |

## Setup

Requires **Node 22** (see `.nvmrc` and `engines` in `package.json`). Vite and Vitest no longer support Node 16.

```bash
nvm use        # picks Node 22 from .nvmrc
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server, then open the printed localhost URL to play |
| `npm test` | Run all Vitest tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Deployment

The site is a static Vite build hosted on Vercel (project `mau-mau`, connected to this GitHub repo).

- **Every push to `main` deploys to production** at https://mau-mau-three.vercel.app. Pushes to other branches get preview URLs.
- Vercel detects Vite automatically: build command `npm run build`, output folder `dist/`. No `vercel.json` is needed.
- The Node version for builds comes from `"engines": { "node": "22.x" }` in `package.json`.
- There are no environment variables or secrets; multiplayer uses the free public PeerJS server.

Manual deploy from your machine (optional):

```bash
npx vercel           # preview deployment
npx vercel --prod    # production deployment
```

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
src/bot/      chooseMove(visibleState, rules, difficulty)
src/game/     Runs a table: controller (engine + bot turns), connection, saved profile
src/net/      Multiplayer: protocol, host (referee), guest, PeerJS transport, room links
src/ui/       DOM: setup screen, table view, card elements, animations, log text
src/i18n/     strings.ts — every UI string, in one place for translation
public/cards/ Kenney card PNGs (7–Ace of each suit + card back) and their license
tests/        Vitest tests for the engine, the bots, and host/guest sessions (fake network)
```

## How to play

- Pick your name, 1–3 opponents, bot strength, and (optionally) change the rules, then **Start game**.
- Tap a bright card to play it; dimmed cards don't fit. A **Bube** asks *Ich wünsche mir…* — pick a suit.
- Tap the draw pile or **Draw** if you can't (or don't want to) play. If the drawn card fits, play it or tap **Keep card**.
- Press **Mau!** before playing your second-to-last card, or you draw a penalty card.
- In multiplayer, only the host can deal the next round.
- The round ends when someone has no cards left (*Mau-Mau!*). With scoring on, a points table follows each round.

## Playing with friends

1. On the main menu, tap **Create game**. You get a link like `https://<site>/#room=k3m9xq2a` — tap **Copy link** and send it.
2. Friends open the link, enter a name and tap **Join**. No accounts, no login.
3. Optionally **Add bot** (any strength) to fill seats — up to 4 players in total. Then **Start game**.

How it works:

- The host's browser is the referee: it runs the engine and the bots. Guests only send move intents and only ever receive their own view (their hand, other players' card counts). Cards drawn by others are hidden.
- Connections are direct browser-to-browser (WebRTC via [PeerJS](https://peerjs.com/)). The free public PeerJS server is only used to find each other. PeerJS is loaded only when you play online, so games against bots work offline.
- Each browser keeps a random player id and name in localStorage. Reloading the page (or reopening the link) puts you back in your seat with the same cards.
- If a player drops out, they stay seated and are shown as offline; the game waits on their turn ("Waiting for … to reconnect"). Guests reconnect automatically after short connection losses.
- If the host closes their tab, everyone sees "The host closed the game".
- Player ids are never shared: inside the game everyone is known by a seat number, and the host always applies a guest's move to that guest's own seat.

Things to know:

- **The host's tab must stay open** for the whole game — closing or reloading it ends the game. Browsers also slow down background tabs, so bots move slower while the host's tab is hidden.
- PeerJS uses public STUN servers but no TURN relay, so on some strict networks (some company or mobile networks) a direct connection can't be made. Joining then shows a connection error.

## Bots

Bots see only what a human in their seat would see (`VisibleState`). They move after 700 ms so you can follow along, and always call Mau.

| Level | Strategy |
|---|---|
| Easy | Random legal card, random wish |
| Normal | Plays any other card before a Jack; wishes the suit it holds most of; plays 7s/8s when the next player has ≤ 2 cards; sheds high-point cards first |
| Hard | Normal + counts the cards it has seen, prefers cards opponents are unlikely to follow, and wishes suits that are mostly played out |

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

Card art: [Kenney "Playing Cards Pack"](https://kenney.nl/assets/playing-cards-pack), released under **CC0** (public domain). No attribution is required, but credit goes to Kenney. The original license text is in `public/cards/LICENSE-kenney.txt`. Only the 7–Ace cards of each suit and one card back are included.
