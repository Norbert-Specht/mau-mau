/* ==========================================================================
   Table connection
   The table UI only talks to this interface. Locally it wraps a
   GameController; in multiplayer the host and guests each provide their
   own implementation, so the UI does not need to know the difference.
   ========================================================================== */

import { getVisibleState, redactEvents, type GameEvent, type Move, type Rules, type VisibleState } from '../engine';
import type { GameController } from './controller';

/** Extra table information that is not part of the game state itself. */
export interface TableMeta {
  /** connected[seat]: false while a human player is offline. Bots are always connected. */
  connected: boolean[];
}

/** Receives the viewer's state, the (redacted) events that led to it, and whether cards were just dealt. */
export type ViewListener = (view: VisibleState, events: GameEvent[], isNewDeal: boolean, meta: TableMeta) => void;

/** Network problems the table should tell the player about (null = all good). */
export type ConnectionNotice = 'reconnecting' | 'hostLeft' | null;

export interface TableConnection {
  readonly playerId: string;
  readonly rules: Rules;
  /** Only the host (or a local game) may deal the next round / start a new match. */
  readonly canControlRounds: boolean;
  /** Starts updates; the listener immediately gets the current view. Returns an unsubscribe function. */
  subscribe(listener: ViewListener): () => void;
  /** Optional: connection notices (multiplayer guests only). Returns an unsubscribe function. */
  subscribeNotice?(listener: (notice: ConnectionNotice) => void): () => void;
  /** Sends a move. The UI only offers legal moves, so errors are ignored here. */
  submit(move: Move): void;
  nextRound(): void;
  newMatch(): void;
  /** Leaves the table and stops everything behind it. */
  close(): void;
}

/**
 * Wraps a local GameController as a TableConnection for one human seat.
 * @param controller - the game controller (owns the full state)
 * @param playerId - the human player watching this table
 * @returns the connection
 */
export function localConnection(controller: GameController, playerId: string): TableConnection {
  return {
    playerId,
    rules: controller.rules,
    canControlRounds: true,
    subscribe(listener) {
      return controller.subscribe((state, events, isNewDeal) => {
        const view = getVisibleState(state, playerId);
        const meta = { connected: state.players.map(() => true) };
        listener(view, redactEvents(events, view.you), isNewDeal, meta);
      });
    },
    submit(move) {
      controller.submit(move);
    },
    nextRound() {
      controller.nextRound();
    },
    newMatch() {
      controller.newMatch();
    },
    close() {
      controller.dispose();
    },
  };
}
