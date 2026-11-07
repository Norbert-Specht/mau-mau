/* ==========================================================================
   Table connection
   The table UI only talks to this interface. Locally it wraps a
   GameController; in step 3 a network version will implement the same
   interface for guests, so the UI does not need to know the difference.
   ========================================================================== */

import { getVisibleState, redactEvents, type GameEvent, type Move, type Rules, type VisibleState } from '../engine';
import type { GameController } from './controller';

/** Receives the viewer's state, the (redacted) events that led to it, and whether cards were just dealt. */
export type ViewListener = (view: VisibleState, events: GameEvent[], isNewDeal: boolean) => void;

export interface TableConnection {
  readonly playerId: string;
  readonly rules: Rules;
  /** Starts updates; the listener immediately gets the current view. Returns an unsubscribe function. */
  subscribe(listener: ViewListener): () => void;
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
    subscribe(listener) {
      return controller.subscribe((state, events, isNewDeal) => {
        const view = getVisibleState(state, playerId);
        listener(view, redactEvents(events, view.you), isNewDeal);
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
