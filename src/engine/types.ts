/* ==========================================================================
   Engine types
   GameState is the full, authoritative state (only the host/referee has it).
   VisibleState is what one player is allowed to see.
   All of these are plain JSON-friendly objects so they can go over the wire.
   ========================================================================== */

import type { Card, Suit } from './cards';

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
}

/**
 * - playing:   current player may play, draw, or call Mau
 * - drawn:     current player drew a wild Jack, which is played automatically
 *              once they name a suit (the only allowed move is playing it)
 * - roundOver: someone emptied their hand; waiting for the next round
 * - matchOver: scored match finished
 */
export type Phase = 'playing' | 'drawn' | 'roundOver' | 'matchOver';

export interface GameState {
  players: Player[];
  /** hands[seat] — seat order matches players[]. */
  hands: Card[][];
  /** Face-down pile. The last element is the top card. */
  drawPile: Card[];
  /** Face-up pile. The last element is the top card. */
  discardPile: Card[];
  /** Seat index of the player whose turn it is. */
  current: number;
  /** Turn order: 1 = clockwise, -1 = counter-clockwise. No card reverses it yet. */
  direction: 1 | -1;
  /** Cards the current player must draw because of 7s (0 = none). */
  pendingDraw: number;
  /** Suit wished for by the last Jack, or null. */
  wishedSuit: Suit | null;
  phase: Phase;
  /** Id of the drawn wild Jack waiting for a suit (phase "drawn"), otherwise null. */
  drawnCardId: string | null;
  /** Whether the current player has called "Mau" this turn. */
  mauCalled: boolean;
  /** 1-based round number. */
  round: number;
  /** Seat that started the current round (rotates each round). */
  startSeat: number;
  /** Cumulative scores by seat (only grows when rules.scoring is on). */
  scores: number[];
  /** Points each seat took in the last finished round, or null. */
  lastRoundPoints: number[] | null;
  roundWinner: number | null;
  /** Seats with the lowest total when a scored match ends (ties possible). */
  matchWinners: number[] | null;
  /** RNG state for the next shuffle. */
  rngSeed: number;
  /** Count of successful moves; useful for ordering network updates. */
  moveCount: number;
}

/* ---------------------------- Moves ---------------------------- */

export type Move =
  /** Play a card. `wish` is required for a wild Jack (unless it is the last card). */
  | { type: 'play'; player: PlayerId; cardId: string; wish?: Suit; mau?: boolean }
  /** Draw: takes the pending 7-penalty if any, otherwise one card. */
  | { type: 'draw'; player: PlayerId }
  /** Call "Mau" (the UI's Mau! button). */
  | { type: 'mau'; player: PlayerId };

/* ---------------------------- Events ---------------------------- */

export type DrawReason = 'normal' | 'seven' | 'mau';

export type GameEvent =
  | { type: 'played'; seat: number; card: Card; wish?: Suit }
  /** `cards` is emptied by redactEvents for everyone except the drawer. */
  | { type: 'drew'; seat: number; count: number; reason: DrawReason; cards: Card[] }
  | { type: 'skipped'; seat: number }
  | { type: 'mau'; seat: number }
  | { type: 'passed'; seat: number }
  | { type: 'reshuffled'; count: number }
  | { type: 'turn'; seat: number }
  | { type: 'roundOver'; winner: number; points: number[]; scores: number[] }
  | { type: 'matchOver'; winners: number[]; scores: number[] };

/* ---------------------------- Results ---------------------------- */

export type MoveError =
  | 'unknown_player'
  | 'unknown_move'
  | 'round_over'
  | 'not_your_turn'
  | 'card_not_in_hand'
  | 'only_drawn_card'
  | 'card_not_playable'
  | 'wish_required'
  | 'invalid_wish'
  | 'already_drew';

export type MoveResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: MoveError };

/* ---------------------------- Visible state ---------------------------- */

export interface VisiblePlayer {
  id: PlayerId;
  name: string;
  cardCount: number;
}

/** Everything one player may know. Other hands are counts; the draw pile is a count. */
export interface VisibleState {
  /** The viewer's own seat. */
  you: number;
  players: VisiblePlayer[];
  hand: Card[];
  topCard: Card;
  /** All face-up cards since the last reshuffle (public knowledge). */
  discardPile: Card[];
  drawPileCount: number;
  current: number;
  direction: 1 | -1;
  pendingDraw: number;
  wishedSuit: Suit | null;
  phase: Phase;
  /** Only set when it is the viewer's turn and they just drew. */
  drawnCardId: string | null;
  mauCalled: boolean;
  round: number;
  scores: number[];
  lastRoundPoints: number[] | null;
  roundWinner: number | null;
  matchWinners: number[] | null;
}
