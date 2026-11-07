/* ==========================================================================
   Visibility
   What a single player is allowed to know. The host sends guests only
   their VisibleState and redacted events — never the full GameState.
   ========================================================================== */

import type { GameEvent, GameState, PlayerId, VisibleState } from './types';

/**
 * Builds the view of the game for one player.
 * @param state - full authoritative state
 * @param playerId - the viewer
 * @returns the viewer's VisibleState (other hands and the draw pile as counts)
 * @throws if the player is not in this game
 */
export function getVisibleState(state: GameState, playerId: PlayerId): VisibleState {
  const you = state.players.findIndex((p) => p.id === playerId);
  if (you < 0) throw new Error(`Unknown player: ${playerId}`);
  const isYourTurn = state.current === you;

  return structuredClone({
    you,
    players: state.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      cardCount: state.hands[seat].length,
    })),
    hand: state.hands[you],
    topCard: state.discardPile[state.discardPile.length - 1],
    discardPile: state.discardPile,
    drawPileCount: state.drawPile.length,
    current: state.current,
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    wishedSuit: state.wishedSuit,
    phase: state.phase,
    // Which card someone else just drew is private.
    drawnCardId: isYourTurn ? state.drawnCardId : null,
    mauCalled: state.mauCalled,
    round: state.round,
    scores: state.scores,
    lastRoundPoints: state.lastRoundPoints,
    roundWinner: state.roundWinner,
    matchWinners: state.matchWinners,
  });
}

/**
 * Removes private information from events for one viewer:
 * cards drawn by other players are hidden (only the count stays).
 * @param events - events from applyMove
 * @param viewerSeat - seat of the player who will receive them
 * @returns a redacted copy of the events
 */
export function redactEvents(events: GameEvent[], viewerSeat: number): GameEvent[] {
  return events.map((e) =>
    e.type === 'drew' && e.seat !== viewerSeat ? { ...e, cards: [] } : structuredClone(e),
  );
}
