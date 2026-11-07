/* ==========================================================================
   applyMove — the referee
   Validates a move against the full state and rules. On success it returns
   a NEW state plus the events that happened; the input state is never
   modified. On failure it returns an error code and changes nothing.
   ========================================================================== */

import { handPoints, isSuit, type Card } from './cards';
import { canPlayCard, isWildJack, type PlayContext } from './legal';
import { shuffle } from './rng';
import { SEVEN_PENALTY, type Rules } from './rules';
import type { DrawReason, GameEvent, GameState, Move, MoveError, MoveResult } from './types';

/**
 * Applies one move.
 * @param state - current authoritative state (not modified)
 * @param move - the move a player wants to make
 * @param rules - active rules
 * @returns { ok: true, state, events } or { ok: false, error }
 */
export function applyMove(state: GameState, move: Move, rules: Rules): MoveResult {
  const seat = state.players.findIndex((p) => p.id === move.player);
  if (seat < 0) return fail('unknown_player');
  if (state.phase === 'roundOver' || state.phase === 'matchOver') return fail('round_over');
  if (seat !== state.current) return fail('not_your_turn');

  // Work on a deep copy so a rejected move can never leave half-applied changes.
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  let error: MoveError | null;

  switch (move.type) {
    case 'mau':
      error = callMau(s, seat, events);
      break;
    case 'play':
      error = playCard(s, seat, move, rules, events);
      break;
    case 'draw':
      error = drawTurn(s, seat, rules, events);
      break;
    case 'pass':
      error = passTurn(s, seat, events);
      break;
    default:
      error = 'unknown_move';
  }

  if (error) return fail(error);
  s.moveCount += 1;
  return { ok: true, state: s, events };
}

/* ---------------------------- Move handlers ---------------------------- */
/* Each handler mutates the cloned state and returns an error or null.    */

/**
 * Records a "Mau" call for the current player's turn.
 * @param s - cloned state
 * @param seat - acting seat
 * @param events - event list to append to
 * @returns null (calling Mau is always allowed on your turn)
 */
function callMau(s: GameState, seat: number, events: GameEvent[]): MoveError | null {
  if (!s.mauCalled) {
    s.mauCalled = true;
    events.push({ type: 'mau', seat });
  }
  return null;
}

/**
 * Plays a card from the current player's hand and applies its effect.
 * @param s - cloned state
 * @param seat - acting seat
 * @param move - the play move
 * @param rules - active rules
 * @param events - event list to append to
 * @returns an error code, or null on success
 */
function playCard(
  s: GameState,
  seat: number,
  move: Extract<Move, { type: 'play' }>,
  rules: Rules,
  events: GameEvent[],
): MoveError | null {
  const hand = s.hands[seat];
  const index = hand.findIndex((c) => c.id === move.cardId);
  if (index < 0) return 'card_not_in_hand';
  if (s.phase === 'drawn' && move.cardId !== s.drawnCardId) return 'only_drawn_card';

  const card = hand[index];
  if (!canPlayCard(card, playContext(s), rules)) return 'card_not_playable';

  const wild = isWildJack(card, rules);
  const isLastCard = hand.length === 1;
  if (move.wish !== undefined && !isSuit(move.wish)) return 'invalid_wish';
  // A wish is pointless on the winning card, so it is optional there.
  if (wild && !isLastCard && !move.wish) return 'wish_required';

  // --- Validation done; from here on the move happens. ---

  // The Mau! button may be pressed together with the card.
  if (move.mau) callMau(s, seat, events);

  hand.splice(index, 1);
  s.discardPile.push(card);
  s.phase = 'playing';
  s.drawnCardId = null;
  // Any card clears an earlier wish; a wild Jack sets a new one.
  s.wishedSuit = wild ? (move.wish ?? null) : null;
  events.push(wild && move.wish ? { type: 'played', seat, card, wish: move.wish } : { type: 'played', seat, card });

  if (hand.length === 0) {
    endRound(s, seat, rules, events);
    return null;
  }

  // Forgot to call Mau on the way down to one card → penalty draw.
  if (hand.length === 1 && rules.mauRequired && !s.mauCalled) {
    drawCards(s, seat, rules.mauPenalty, 'mau', events);
  }

  let steps = 1;
  if (rules.sevenDrawTwo && card.rank === '7') {
    // Stacked 7s accumulate: 2, 4, 6, ...
    s.pendingDraw += SEVEN_PENALTY;
  }
  if (rules.eightSkips && card.rank === '8') {
    steps = 2;
    events.push({ type: 'skipped', seat: seatAfter(s, seat, 1) });
  }
  advanceTurn(s, steps, events);
  return null;
}

/**
 * Handles a draw: either takes the whole pending 7-penalty (ending the turn),
 * or draws one card which may be played immediately if the rules allow.
 * @param s - cloned state
 * @param seat - acting seat
 * @param rules - active rules
 * @param events - event list to append to
 * @returns an error code, or null on success
 */
function drawTurn(s: GameState, seat: number, rules: Rules, events: GameEvent[]): MoveError | null {
  if (s.phase === 'drawn') return 'already_drew';

  if (s.pendingDraw > 0) {
    const count = s.pendingDraw;
    s.pendingDraw = 0;
    drawCards(s, seat, count, 'seven', events);
    advanceTurn(s, 1, events);
    return null;
  }

  const [drawn] = drawCards(s, seat, 1, 'normal', events);
  if (drawn && rules.playDrawnCard && canPlayCard(drawn, playContext(s), rules)) {
    // Let the player decide: play this card or pass.
    s.phase = 'drawn';
    s.drawnCardId = drawn.id;
    return null;
  }

  // Nothing playable (or the deck is completely empty): the turn ends.
  events.push({ type: 'passed', seat });
  advanceTurn(s, 1, events);
  return null;
}

/**
 * Ends the turn without playing the card just drawn.
 * @param s - cloned state
 * @param seat - acting seat
 * @param events - event list to append to
 * @returns 'cannot_pass' unless the player just drew a playable card
 */
function passTurn(s: GameState, seat: number, events: GameEvent[]): MoveError | null {
  if (s.phase !== 'drawn') return 'cannot_pass';
  events.push({ type: 'passed', seat });
  advanceTurn(s, 1, events);
  return null;
}

/* ---------------------------- Helpers ---------------------------- */

/**
 * Draws up to `count` cards for a seat, reshuffling the discard pile into the
 * draw pile when it runs out. Draws fewer if no cards are left at all.
 * @param s - state to mutate
 * @param seat - the seat drawing
 * @param count - how many cards to draw
 * @param reason - why (shown in the event log)
 * @param events - event list to append to
 * @returns the cards actually drawn
 */
function drawCards(
  s: GameState,
  seat: number,
  count: number,
  reason: DrawReason,
  events: GameEvent[],
): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) reshuffle(s, events);
    const card = s.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }
  s.hands[seat].push(...drawn);
  if (drawn.length > 0) events.push({ type: 'drew', seat, count: drawn.length, reason, cards: drawn });
  return drawn;
}

/**
 * Turns the discard pile (all but the top card) into a new shuffled draw pile.
 * @param s - state to mutate
 * @param events - event list to append to
 * @returns nothing (does nothing if only the top card is left)
 */
function reshuffle(s: GameState, events: GameEvent[]): void {
  if (s.discardPile.length <= 1) return;
  const top = s.discardPile.pop()!;
  const shuffled = shuffle(s.discardPile, s.rngSeed);
  s.rngSeed = shuffled.seed;
  s.drawPile = shuffled.items;
  s.discardPile = [top];
  events.push({ type: 'reshuffled', count: s.drawPile.length });
}

/**
 * Finishes the round: scores the remaining hands and sets the phase.
 * @param s - state to mutate
 * @param winner - seat that emptied their hand
 * @param rules - active rules
 * @param events - event list to append to
 * @returns nothing
 */
function endRound(s: GameState, winner: number, rules: Rules, events: GameEvent[]): void {
  const points = s.hands.map((hand, seat) => (seat === winner ? 0 : handPoints(hand)));
  s.lastRoundPoints = points;
  s.roundWinner = winner;
  s.pendingDraw = 0;
  s.drawnCardId = null;
  s.mauCalled = false;
  if (rules.scoring) s.scores = s.scores.map((total, seat) => total + points[seat]);
  events.push({ type: 'roundOver', winner, points, scores: s.scores.slice() });

  if (rules.scoring && s.round >= rules.roundsPerMatch) {
    const best = Math.min(...s.scores);
    s.matchWinners = s.scores.flatMap((score, seat) => (score === best ? [seat] : []));
    s.phase = 'matchOver';
    events.push({ type: 'matchOver', winners: s.matchWinners, scores: s.scores.slice() });
  } else {
    s.phase = 'roundOver';
  }
}

/**
 * Moves the turn on by `steps` seats (2 when an 8 skips someone).
 * @param s - state to mutate
 * @param steps - seats to move forward in the current direction
 * @param events - event list to append to
 * @returns nothing
 */
function advanceTurn(s: GameState, steps: number, events: GameEvent[]): void {
  s.current = seatAfter(s, s.current, steps);
  s.phase = 'playing';
  s.drawnCardId = null;
  s.mauCalled = false;
  events.push({ type: 'turn', seat: s.current });
}

/**
 * Seat index `steps` positions after `seat` in the current direction.
 * @param s - state (for player count and direction)
 * @param seat - starting seat
 * @param steps - how far to move
 * @returns the resulting seat index
 */
function seatAfter(s: GameState, seat: number, steps: number): number {
  const n = s.players.length;
  // Add n before % so negative directions wrap correctly.
  return (((seat + s.direction * steps) % n) + n) % n;
}

/**
 * Extracts what canPlayCard needs from the full state.
 * @param s - state
 * @returns the play context
 */
function playContext(s: GameState): PlayContext {
  return {
    topCard: s.discardPile[s.discardPile.length - 1],
    wishedSuit: s.wishedSuit,
    pendingDraw: s.pendingDraw,
  };
}

/**
 * Builds a failed MoveResult.
 * @param error - the error code
 * @returns the failure result
 */
function fail(error: MoveError): MoveResult {
  return { ok: false, error };
}
