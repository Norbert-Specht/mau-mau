/* ==========================================================================
   Test helpers
   Short card codes ("7H", "10S", "JC") and a builder for hand-made states,
   so each rule can be tested from an exact table position.
   ========================================================================== */

import {
  makeCard,
  type Card,
  type GameState,
  type MoveResult,
  type Rank,
  type Suit,
} from '../../src/engine';

const SUIT_CODES: Record<string, Suit> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };

/**
 * Parses a short card code like "7H", "10S", "JC", "AD".
 * @param code - rank followed by a one-letter suit (H, D, C, S)
 * @returns the Card
 */
export function c(code: string): Card {
  const suit = SUIT_CODES[code.slice(-1)];
  const rank = code.slice(0, -1) as Rank;
  if (!suit) throw new Error(`Bad card code: ${code}`);
  return makeCard(suit, rank);
}

/**
 * Parses a space-separated list of card codes.
 * @param codes - e.g. "7H 8H JC"
 * @returns the cards, in order
 */
export function cards(codes: string): Card[] {
  return codes.trim() ? codes.trim().split(/\s+/).map(c) : [];
}

export interface StateSpec {
  /** One string of card codes per seat. */
  hands: string[];
  /** Discard pile, bottom to top (the last code is the top card). */
  discard: string;
  /** Draw pile, bottom to top (the last code is drawn first). Defaults to a few filler cards. */
  draw?: string;
  current?: number;
  pendingDraw?: number;
  wishedSuit?: Suit | null;
  scores?: number[];
  round?: number;
}

/**
 * Builds a GameState from a compact description. Not a full 32-card deck —
 * tests only need the cards that matter for the rule under test.
 * @param spec - the table position
 * @returns a GameState with players p0, p1, ...
 */
export function makeState(spec: StateSpec): GameState {
  const players = spec.hands.map((_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
  return {
    players,
    hands: spec.hands.map(cards),
    drawPile: cards(spec.draw ?? '9C 9D 9S'),
    discardPile: cards(spec.discard),
    current: spec.current ?? 0,
    direction: 1,
    pendingDraw: spec.pendingDraw ?? 0,
    wishedSuit: spec.wishedSuit ?? null,
    phase: 'playing',
    drawnCardId: null,
    mauCalled: false,
    round: spec.round ?? 1,
    startSeat: 0,
    scores: spec.scores ?? players.map(() => 0),
    lastRoundPoints: null,
    roundWinner: null,
    matchWinners: null,
    rngSeed: 42,
    moveCount: 0,
  };
}

/**
 * Asserts a move succeeded and returns its result, for terse tests.
 * @param result - the MoveResult
 * @returns the success branch
 * @throws if the move was rejected
 */
export function ok(result: MoveResult): Extract<MoveResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected move to succeed, got ${result.error}`);
  return result;
}

/**
 * Card ids of a hand, for readable assertions.
 * @param hand - cards
 * @returns their ids
 */
export function ids(hand: Card[]): string[] {
  return hand.map((card) => card.id);
}

/**
 * Counts every card in a state (hands + both piles).
 * @param s - state
 * @returns total number of cards
 */
export function totalCards(s: GameState): number {
  return s.hands.reduce((n, h) => n + h.length, 0) + s.drawPile.length + s.discardPile.length;
}
