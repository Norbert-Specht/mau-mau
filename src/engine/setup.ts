/* ==========================================================================
   Game setup
   Creating a game, dealing a round, and starting the next round.
   ========================================================================== */

import { createDeck } from './cards';
import { shuffle } from './rng';
import type { Rules } from './rules';
import type { GameState, Player } from './types';

/** The deck has 32 cards; at least one must remain to start the discard pile. */
const DECK_SIZE = 32;

/**
 * Creates a new game and deals the first round.
 * @param players - players in seat order (2 or more)
 * @param rules - active rules
 * @param seed - RNG seed; the same seed and players give the same deal
 * @returns the initial GameState
 * @throws if there are too few players or too many cards would be dealt
 */
export function createGame(players: Player[], rules: Rules, seed: number): GameState {
  if (players.length < 2) throw new Error('Mau-Mau needs at least 2 players');
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Player ids must be unique');
  }
  // Need one card for the discard pile and at least one to draw.
  if (players.length * rules.handSize > DECK_SIZE - 2) {
    throw new Error('Too many cards would be dealt for a 32-card deck');
  }

  const state: GameState = {
    players: players.map((p) => ({ id: p.id, name: p.name })),
    hands: [],
    drawPile: [],
    discardPile: [],
    current: 0,
    direction: 1,
    pendingDraw: 0,
    wishedSuit: null,
    phase: 'playing',
    drawnCardId: null,
    mauCalled: false,
    round: 1,
    startSeat: 0,
    scores: players.map(() => 0),
    lastRoundPoints: null,
    roundWinner: null,
    matchWinners: null,
    rngSeed: seed | 0,
    moveCount: 0,
  };
  dealRound(state, rules);
  return state;
}

/**
 * Starts the next round after a round has ended. The starting seat rotates.
 * @param state - a state in phase "roundOver" (not modified)
 * @param rules - active rules
 * @returns a new state with fresh hands, or the same state if not in "roundOver"
 */
export function startNextRound(state: GameState, rules: Rules): GameState {
  if (state.phase !== 'roundOver') return state;
  const next = structuredClone(state);
  next.round += 1;
  next.startSeat = (next.startSeat + 1) % next.players.length;
  dealRound(next, rules);
  return next;
}

/**
 * Starts a fresh match with the same players (scores reset).
 * @param state - any state (not modified)
 * @param rules - active rules
 * @returns a new state for round 1, seeded from the current RNG state
 */
export function startNewMatch(state: GameState, rules: Rules): GameState {
  return createGame(state.players, rules, state.rngSeed);
}

/**
 * Shuffles a full deck, deals hands and flips the starting card. Mutates state.
 * @param state - state to deal into
 * @param rules - active rules
 * @returns nothing
 */
function dealRound(state: GameState, rules: Rules): void {
  const shuffled = shuffle(createDeck(), state.rngSeed);
  state.rngSeed = shuffled.seed;
  const drawPile = shuffled.items;
  const n = state.players.length;

  // Deal one card at a time around the table, starting at the start seat.
  const hands = state.players.map(() => [] as typeof drawPile);
  for (let i = 0; i < rules.handSize * n; i++) {
    hands[(state.startSeat + i) % n].push(drawPile.pop()!);
  }

  // Flip the starting card. A wild Jack would leave no suit to follow,
  // so it goes to the bottom of the pile and we flip again. Other starting
  // cards (7, 8) have no effect on the first player.
  let starter = drawPile.pop()!;
  while (rules.jackWild && starter.rank === 'J') {
    drawPile.unshift(starter);
    starter = drawPile.pop()!;
  }

  state.hands = hands;
  state.drawPile = drawPile;
  state.discardPile = [starter];
  state.current = state.startSeat;
  state.pendingDraw = 0;
  state.wishedSuit = null;
  state.phase = 'playing';
  state.drawnCardId = null;
  state.mauCalled = false;
  state.roundWinner = null;
}
