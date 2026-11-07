/* ==========================================================================
   Game controller
   Owns the authoritative GameState for a table, applies moves through the
   engine, and plays the bots' turns after a short delay. The UI subscribes
   to updates. In step 3 the multiplayer host will reuse this same class.
   ========================================================================== */

import { chooseMove, type Difficulty } from '../bot/bot';
import {
  applyMove,
  createGame,
  getVisibleState,
  startNewMatch,
  startNextRound,
  type GameEvent,
  type GameState,
  type Move,
  type MoveError,
  type PlayerId,
  type Rules,
} from '../engine';

/** Delay before a bot moves, so humans can follow what happened. */
export const BOT_DELAY_MS = 700;

export type SeatConfig =
  | { kind: 'human'; id: PlayerId; name: string }
  | { kind: 'bot'; id: PlayerId; name: string; difficulty: Difficulty };

/**
 * Called after every change. `events` is empty for a fresh deal
 * (new round / new match), which the UI uses to play the deal animation.
 */
export type UpdateListener = (state: GameState, events: GameEvent[], isNewDeal: boolean) => void;

export class GameController {
  state: GameState;
  readonly rules: Rules;
  private readonly seats: SeatConfig[];
  private listeners: UpdateListener[] = [];
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  /**
   * Creates a table and deals the first round.
   * @param seats - players in seat order (humans and bots)
   * @param rules - active rules
   * @param seed - RNG seed for the deal
   */
  constructor(seats: SeatConfig[], rules: Rules, seed: number) {
    this.seats = seats;
    this.rules = rules;
    this.state = createGame(
      seats.map((s) => ({ id: s.id, name: s.name })),
      rules,
      seed,
    );
  }

  /**
   * Registers a listener and immediately sends it the current state as a new deal.
   * Also starts the bots if a bot is first to move.
   * @param listener - update callback
   * @returns a function that unsubscribes
   */
  subscribe(listener: UpdateListener): () => void {
    this.listeners.push(listener);
    listener(this.state, [], true);
    this.scheduleBot();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Submits a move (from a human, or a bot via scheduleBot).
   * @param move - the move
   * @returns null on success, or the engine's error code
   */
  submit(move: Move): MoveError | null {
    if (this.disposed) return 'round_over';
    const result = applyMove(this.state, move, this.rules);
    if (!result.ok) return result.error;
    this.state = result.state;
    this.emit(result.events, false);
    this.scheduleBot();
    return null;
  }

  /**
   * Deals the next round (after "roundOver").
   * @returns nothing
   */
  nextRound(): void {
    if (this.state.phase !== 'roundOver') return;
    this.state = startNextRound(this.state, this.rules);
    this.emit([], true);
    this.scheduleBot();
  }

  /**
   * Starts a new match with the same seats (after "matchOver").
   * @returns nothing
   */
  newMatch(): void {
    this.state = startNewMatch(this.state, this.rules);
    this.emit([], true);
    this.scheduleBot();
  }

  /**
   * Stops bot timers and drops listeners (when leaving the table).
   * @returns nothing
   */
  dispose(): void {
    this.disposed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.listeners = [];
  }

  /**
   * Sends an update to every listener.
   * @param events - events from the last move (empty for a new deal)
   * @param isNewDeal - true when cards were just dealt
   * @returns nothing
   */
  private emit(events: GameEvent[], isNewDeal: boolean): void {
    for (const listener of this.listeners) listener(this.state, events, isNewDeal);
  }

  /**
   * If it is a bot's turn, plays its move after BOT_DELAY_MS.
   * @returns nothing
   */
  private scheduleBot(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    const seat = this.seats[this.state.current];
    if (seat.kind !== 'bot') return;
    if (this.state.phase !== 'playing' && this.state.phase !== 'drawn') return;

    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const view = getVisibleState(this.state, seat.id);
      const move = chooseMove(view, this.rules, seat.difficulty);
      if (move) this.submit(move);
    }, BOT_DELAY_MS);
  }
}
