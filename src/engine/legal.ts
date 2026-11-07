/* ==========================================================================
   Move legality
   Shared by the referee (applyMove), the UI (dimming cards) and the bots.
   Works on VisibleState so bots and guests can use it without hidden info.
   ========================================================================== */

import type { Card, Suit } from './cards';
import type { Rules } from './rules';
import type { VisibleState } from './types';

/** The parts of the table that decide whether a card may be played. */
export interface PlayContext {
  topCard: Card;
  wishedSuit: Suit | null;
  pendingDraw: number;
}

/**
 * Checks whether one card may be played on the current table.
 * @param card - the card the player wants to play
 * @param ctx - top card, wished suit and pending 7-penalty
 * @param rules - active rules
 * @returns true if the play is legal
 */
export function canPlayCard(card: Card, ctx: PlayContext, rules: Rules): boolean {
  // An open 7-penalty can only be answered by stacking another 7.
  // (pendingDraw is only ever > 0 when sevenDrawTwo is on.)
  if (ctx.pendingDraw > 0) return rules.sevenStacking && card.rank === '7';

  if (rules.jackWild && card.rank === 'J') {
    // A wild Jack fits on anything — except on another Jack, unless allowed.
    return ctx.topCard.rank !== 'J' || rules.jackOnJack;
  }

  // After a Jack, only the wished suit counts; the Jack's own suit/rank don't.
  if (ctx.wishedSuit) return card.suit === ctx.wishedSuit;

  return card.suit === ctx.topCard.suit || card.rank === ctx.topCard.rank;
}

/**
 * Is this card a wild Jack under the active rules (i.e. needs a suit wish)?
 * @param card - any card
 * @param rules - active rules
 * @returns true for a Jack when jackWild is on
 */
export function isWildJack(card: Card, rules: Rules): boolean {
  return rules.jackWild && card.rank === 'J';
}

/**
 * Lists the viewer's cards that may legally be played right now.
 * @param view - the viewer's visible state
 * @param rules - active rules
 * @returns playable cards (empty if it is not the viewer's turn)
 */
export function getPlayableCards(view: VisibleState, rules: Rules): Card[] {
  if (view.current !== view.you) return [];
  if (view.phase !== 'playing' && view.phase !== 'drawn') return [];
  const ctx: PlayContext = {
    topCard: view.topCard,
    wishedSuit: view.wishedSuit,
    pendingDraw: view.pendingDraw,
  };
  // After drawing a wild Jack, only that Jack may be played.
  const candidates =
    view.phase === 'drawn' ? view.hand.filter((c) => c.id === view.drawnCardId) : view.hand;
  return candidates.filter((c) => canPlayCard(c, ctx, rules));
}

/**
 * Can the viewer draw right now? (Drawing is allowed once per turn, before playing.)
 * @param view - the viewer's visible state
 * @returns true if a draw move would be accepted
 */
export function canDraw(view: VisibleState): boolean {
  return view.current === view.you && view.phase === 'playing';
}

