/* ==========================================================================
   Rule tests for applyMove
   Each block sets up an exact table position with makeState and checks one rule.
   Players are p0, p1, p2...; card codes are rank + suit letter (H D C S).
   ========================================================================== */

import { describe, expect, it } from 'vitest';
import { applyMove, makeRules } from '../../src/engine';
import { c, ids, makeState, ok, totalCards } from './helpers';

const rules = makeRules();

/* ---------------------------- Basic play ---------------------------- */

describe('matching suit or rank', () => {
  const s = makeState({ hands: ['9H 9S KC QC', 'AD AS'], discard: '10H' });

  it('allows a card of the same suit', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules));
    expect(r.state.discardPile.at(-1)).toEqual(c('9H'));
    expect(ids(r.state.hands[0])).toEqual(['9-spades', 'K-clubs', 'Q-clubs']);
    expect(r.state.current).toBe(1);
    expect(r.events).toEqual([
      { type: 'played', seat: 0, card: c('9H') },
      { type: 'turn', seat: 1 },
    ]);
  });

  it('allows a card of the same rank', () => {
    const t = makeState({ hands: ['10S KC QC', 'AD'], discard: '10H' });
    expect(applyMove(t, { type: 'play', player: 'p0', cardId: '10-spades' }, rules).ok).toBe(true);
  });

  it('rejects a card that matches neither', () => {
    expect(applyMove(s, { type: 'play', player: 'p0', cardId: 'K-clubs' }, rules)).toEqual({
      ok: false,
      error: 'card_not_playable',
    });
  });

  it('never modifies the input state', () => {
    const before = structuredClone(s);
    applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules);
    applyMove(s, { type: 'play', player: 'p0', cardId: 'K-clubs' }, rules);
    expect(s).toEqual(before);
  });
});

describe('move validation', () => {
  const s = makeState({ hands: ['9H KC QC', '9D AS'], discard: '10H' });

  it('rejects moves from the wrong player', () => {
    expect(applyMove(s, { type: 'play', player: 'p1', cardId: '9-diamonds' }, rules)).toEqual({
      ok: false,
      error: 'not_your_turn',
    });
    expect(applyMove(s, { type: 'draw', player: 'p1' }, rules).ok).toBe(false);
  });

  it('rejects unknown players, cards not in hand, and unknown move types', () => {
    expect(applyMove(s, { type: 'draw', player: 'nobody' }, rules)).toEqual({ ok: false, error: 'unknown_player' });
    expect(applyMove(s, { type: 'play', player: 'p0', cardId: 'A-spades' }, rules)).toEqual({
      ok: false,
      error: 'card_not_in_hand',
    });
    // Cast simulates a malformed message arriving from the network.
    const bogus = { type: 'cheat', player: 'p0' } as unknown as Parameters<typeof applyMove>[1];
    expect(applyMove(s, bogus, rules)).toEqual({ ok: false, error: 'unknown_move' });
  });

  it('rejects any move after the round is over', () => {
    const over = { ...s, phase: 'roundOver' as const };
    expect(applyMove(over, { type: 'draw', player: 'p0' }, rules)).toEqual({ ok: false, error: 'round_over' });
  });

  it('rejects passing without having drawn', () => {
    expect(applyMove(s, { type: 'pass', player: 'p0' }, rules)).toEqual({ ok: false, error: 'cannot_pass' });
  });

  it('counts successful moves only', () => {
    expect(ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules)).state.moveCount).toBe(1);
  });
});

/* ---------------------------- Sevens ---------------------------- */

describe('7: next player draws 2', () => {
  const s = makeState({ hands: ['7H KC QC', 'AS KS'], discard: '10H', draw: '9C 9D 9S 8S' });

  it('sets a pending penalty of 2 for the next player', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '7-hearts' }, rules));
    expect(r.state.pendingDraw).toBe(2);
    expect(r.state.current).toBe(1);
  });

  it('the next player draws 2 and their turn ends', () => {
    const after7 = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '7-hearts' }, rules)).state;
    const r = ok(applyMove(after7, { type: 'draw', player: 'p1' }, rules));
    expect(r.state.hands[1]).toHaveLength(4);
    expect(r.state.pendingDraw).toBe(0);
    expect(r.state.current).toBe(0);
    expect(r.events[0]).toMatchObject({ type: 'drew', seat: 1, count: 2, reason: 'seven' });
  });

  it('only a 7 may be played while a penalty is pending', () => {
    const t = makeState({ hands: ['KC', 'AH 10H JS'], discard: '7H', current: 1, pendingDraw: 2 });
    expect(applyMove(t, { type: 'play', player: 'p1', cardId: 'A-hearts' }, rules).ok).toBe(false);
    expect(applyMove(t, { type: 'play', player: 'p1', cardId: 'J-spades', wish: 'clubs' }, rules).ok).toBe(false);
  });

  it('after the penalty is taken, the 7 is a normal card again', () => {
    const t = makeState({ hands: ['KH QC', 'AS'], discard: '7H', current: 0, pendingDraw: 0 });
    expect(applyMove(t, { type: 'play', player: 'p0', cardId: 'K-hearts' }, rules).ok).toBe(true);
  });

  it('has no effect when sevenDrawTwo is off', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '7-hearts' }, makeRules({ sevenDrawTwo: false })));
    expect(r.state.pendingDraw).toBe(0);
  });
});

describe('7-stacking', () => {
  const s = makeState({
    hands: ['7H KC', '7S AS', '7D QD', 'KD QS'],
    discard: '10H',
    draw: '9C 9D 9S 8S 8C 8D 10C',
  });

  it('accumulates the penalty: 7, 7, 7 → next player draws 6', () => {
    let st = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '7-hearts', mau: true }, rules)).state;
    st = ok(applyMove(st, { type: 'play', player: 'p1', cardId: '7-spades', mau: true }, rules)).state;
    st = ok(applyMove(st, { type: 'play', player: 'p2', cardId: '7-diamonds', mau: true }, rules)).state;
    expect(st.pendingDraw).toBe(6);
    expect(st.current).toBe(3);
    const r = ok(applyMove(st, { type: 'draw', player: 'p3' }, rules));
    expect(r.state.hands[3]).toHaveLength(8);
    expect(r.state.pendingDraw).toBe(0);
    expect(r.state.current).toBe(0);
  });

  it('cannot stack when sevenStacking is off', () => {
    const noStack = makeRules({ sevenStacking: false });
    const st = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '7-hearts', mau: true }, noStack)).state;
    expect(applyMove(st, { type: 'play', player: 'p1', cardId: '7-spades' }, noStack)).toEqual({
      ok: false,
      error: 'card_not_playable',
    });
  });
});

/* ---------------------------- Eights ---------------------------- */

describe('8: next player is skipped', () => {
  it('skips one player in a 3-player game', () => {
    const s = makeState({ hands: ['8H KC', 'AS', 'QD'], discard: '10H' });
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '8-hearts', mau: true }, rules));
    expect(r.state.current).toBe(2);
    expect(r.events).toContainEqual({ type: 'skipped', seat: 1 });
  });

  it('gives the same player another turn in a 2-player game', () => {
    const s = makeState({ hands: ['8H KC QC', 'AS'], discard: '10H' });
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '8-hearts' }, rules));
    expect(r.state.current).toBe(0);
  });

  it('wraps around the table', () => {
    const s = makeState({ hands: ['AS', 'KD', '8H QC'], discard: '10H', current: 2 });
    expect(ok(applyMove(s, { type: 'play', player: 'p2', cardId: '8-hearts', mau: true }, rules)).state.current).toBe(1);
  });

  it('has no effect when eightSkips is off', () => {
    const s = makeState({ hands: ['8H KC', 'AS', 'QD'], discard: '10H' });
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '8-hearts', mau: true }, makeRules({ eightSkips: false })));
    expect(r.state.current).toBe(1);
  });
});

/* ---------------------------- Jacks ---------------------------- */

describe('Jack (Bube): wild with a suit wish', () => {
  const s = makeState({ hands: ['JC KS QS', 'AD KD 9S'], discard: '10H' });

  it('can be played on any suit and sets the wished suit', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: 'J-clubs', wish: 'diamonds' }, rules));
    expect(r.state.wishedSuit).toBe('diamonds');
    expect(r.events[0]).toEqual({ type: 'played', seat: 0, card: c('JC'), wish: 'diamonds' });
  });

  it('requires a wish', () => {
    expect(applyMove(s, { type: 'play', player: 'p0', cardId: 'J-clubs' }, rules)).toEqual({
      ok: false,
      error: 'wish_required',
    });
  });

  it('rejects an invalid wish', () => {
    const bad = { type: 'play', player: 'p0', cardId: 'J-clubs', wish: 'stars' } as unknown as Parameters<typeof applyMove>[1];
    expect(applyMove(s, bad, rules)).toEqual({ ok: false, error: 'invalid_wish' });
  });

  it('forces the next player to follow the wished suit', () => {
    const st = ok(applyMove(s, { type: 'play', player: 'p0', cardId: 'J-clubs', wish: 'diamonds' }, rules)).state;
    // Spades and clubs no longer count, even though the Jack is a club.
    expect(applyMove(st, { type: 'play', player: 'p1', cardId: '9-spades' }, rules).ok).toBe(false);
    const r = ok(applyMove(st, { type: 'play', player: 'p1', cardId: 'A-diamonds' }, rules));
    expect(r.state.wishedSuit).toBeNull();
  });

  it('can be the winning card without a wish', () => {
    const t = makeState({ hands: ['JC', 'AD'], discard: '10H' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: 'J-clubs' }, rules));
    expect(r.state.phase).toBe('roundOver');
  });

  it('may not be played on another Jack by default', () => {
    const t = makeState({ hands: ['JH KS', 'AD'], discard: 'JC', wishedSuit: 'hearts' });
    expect(applyMove(t, { type: 'play', player: 'p0', cardId: 'J-hearts', wish: 'spades' }, rules)).toEqual({
      ok: false,
      error: 'card_not_playable',
    });
  });

  it('may be played on another Jack when jackOnJack is on', () => {
    const t = makeState({ hands: ['JH KS', 'AD'], discard: 'JC', wishedSuit: 'diamonds' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: 'J-hearts', wish: 'spades', mau: true }, makeRules({ jackOnJack: true })));
    expect(r.state.wishedSuit).toBe('spades');
  });

  it('is a normal card when jackWild is off', () => {
    const plain = makeRules({ jackWild: false });
    expect(applyMove(s, { type: 'play', player: 'p0', cardId: 'J-clubs', wish: 'hearts' }, plain).ok).toBe(false);
    const t = makeState({ hands: ['JH KS', 'AD'], discard: '10H' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: 'J-hearts', wish: 'spades', mau: true }, plain));
    expect(r.state.wishedSuit).toBeNull();
  });
});

/* ---------------------------- Drawing ---------------------------- */

describe('drawing', () => {
  it('draws 1 and ends the turn if the drawn card does not fit', () => {
    const s = makeState({ hands: ['KC', 'AS'], discard: '10H', draw: '9S 8D' });
    const r = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules));
    expect(ids(r.state.hands[0])).toEqual(['K-clubs', '8-diamonds']);
    expect(r.state.current).toBe(1);
    expect(r.events).toEqual([
      { type: 'drew', seat: 0, count: 1, reason: 'normal', cards: [c('8D')] },
      { type: 'passed', seat: 0 },
      { type: 'turn', seat: 1 },
    ]);
  });

  it('lets the player play the drawn card if it fits', () => {
    const s = makeState({ hands: ['KC QC', 'AS'], discard: '10H', draw: '9S 9H' });
    const drawn = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    expect(drawn.phase).toBe('drawn');
    expect(drawn.drawnCardId).toBe('9-hearts');
    expect(drawn.current).toBe(0);
    // Cannot draw again in the same turn.
    expect(applyMove(drawn, { type: 'draw', player: 'p0' }, rules)).toEqual({ ok: false, error: 'already_drew' });
    const r = ok(applyMove(drawn, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules));
    expect(r.state.current).toBe(1);
    expect(r.state.phase).toBe('playing');
  });

  it('only the drawn card may be played after drawing', () => {
    const s = makeState({ hands: ['KH QC', 'AS'], discard: '10H', draw: '9S 9H' });
    const drawn = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    expect(applyMove(drawn, { type: 'play', player: 'p0', cardId: 'K-hearts' }, rules)).toEqual({
      ok: false,
      error: 'only_drawn_card',
    });
  });

  it('lets the player pass instead of playing the drawn card', () => {
    const s = makeState({ hands: ['KC QC', 'AS'], discard: '10H', draw: '9S 9H' });
    const drawn = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    const r = ok(applyMove(drawn, { type: 'pass', player: 'p0' }, rules));
    expect(r.state.current).toBe(1);
    expect(r.state.hands[0]).toHaveLength(3);
  });

  it('ends the turn immediately when playDrawnCard is off', () => {
    const s = makeState({ hands: ['KC QC', 'AS'], discard: '10H', draw: '9S 9H' });
    const r = ok(applyMove(s, { type: 'draw', player: 'p0' }, makeRules({ playDrawnCard: false })));
    expect(r.state.phase).toBe('playing');
    expect(r.state.current).toBe(1);
  });

  it('passes the turn if there is nothing left to draw at all', () => {
    const s = makeState({ hands: ['KC', 'AS'], discard: '10H', draw: '' });
    const r = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules));
    expect(r.state.hands[0]).toHaveLength(1);
    expect(r.state.current).toBe(1);
  });
});

/* ---------------------------- Reshuffle ---------------------------- */

describe('reshuffling the discard pile', () => {
  it('reshuffles all but the top card when the draw pile is empty', () => {
    const s = makeState({ hands: ['KC', 'AS'], discard: '7S 8S 9S 10H', draw: '' });
    const r = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules));
    expect(r.state.discardPile).toEqual([c('10H')]);
    // 3 cards reshuffled, 1 drawn, 2 left.
    expect(r.state.drawPile).toHaveLength(2);
    expect(r.state.hands[0]).toHaveLength(2);
    expect(r.events).toContainEqual({ type: 'reshuffled', count: 3 });
    expect(totalCards(r.state)).toBe(totalCards(s));
  });

  it('reshuffles mid-penalty when the pile runs out', () => {
    const s = makeState({ hands: ['KC', 'AS'], discard: '8C 9C 10C 7H', draw: '9D', pendingDraw: 2 });
    const r = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules));
    expect(r.state.hands[0]).toHaveLength(3);
    expect(r.state.discardPile).toEqual([c('7H')]);
    expect(r.state.drawPile).toHaveLength(2);
  });

  it('is reproducible from the RNG seed', () => {
    const s = makeState({ hands: ['KC', 'AS'], discard: '7S 8S 9S 9D 8D 10H', draw: '' });
    const a = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    const b = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    expect(a.drawPile).toEqual(b.drawPile);
    expect(a.rngSeed).not.toBe(s.rngSeed);
  });
});

/* ---------------------------- Mau ---------------------------- */

describe('Mau call (optional rule, off by default)', () => {
  const mauRules = makeRules({ mauRequired: true });
  const s = makeState({ hands: ['9H KC', 'AS QS'], discard: '10H', draw: '8C 8D' });

  it('has no penalty with the default rules', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules));
    expect(r.state.hands[0]).toHaveLength(1);
    expect(r.events.some((e) => e.type === 'drew')).toBe(false);
  });

  it('penalizes going down to one card without calling Mau', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, mauRules));
    expect(r.state.hands[0]).toHaveLength(2);
    expect(r.events).toContainEqual({ type: 'drew', seat: 0, count: 1, reason: 'mau', cards: [c('8D')] });
  });

  it('no penalty when Mau is pressed before playing', () => {
    const called = ok(applyMove(s, { type: 'mau', player: 'p0' }, mauRules));
    expect(called.events).toEqual([{ type: 'mau', seat: 0 }]);
    expect(called.state.current).toBe(0);
    const r = ok(applyMove(called.state, { type: 'play', player: 'p0', cardId: '9-hearts' }, mauRules));
    expect(r.state.hands[0]).toHaveLength(1);
  });

  it('no penalty when Mau is pressed together with the card', () => {
    const r = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts', mau: true }, mauRules));
    expect(r.state.hands[0]).toHaveLength(1);
    expect(r.events[0]).toEqual({ type: 'mau', seat: 0 });
  });

  it('a Mau call only lasts for the current turn', () => {
    // p0 calls Mau too early (3 cards → 2), then forgets on the next turn (2 → 1).
    const t = makeState({ hands: ['9H 10H KH', 'AH QS QD'], discard: '10C', draw: '8C 8D 7C' });
    let st = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '10-hearts', mau: true }, mauRules)).state;
    expect(st.hands[0]).toHaveLength(2);
    expect(st.mauCalled).toBe(false);
    st = ok(applyMove(st, { type: 'play', player: 'p1', cardId: 'A-hearts' }, mauRules)).state;
    const r = ok(applyMove(st, { type: 'play', player: 'p0', cardId: '9-hearts' }, mauRules));
    expect(r.events.some((e) => e.type === 'drew' && e.reason === 'mau')).toBe(true);
    expect(r.state.hands[0]).toHaveLength(2);
  });

  it('applies after playing the card just drawn', () => {
    const t = makeState({ hands: ['KC', 'AS'], discard: '10H', draw: '9H' });
    const drawn = ok(applyMove(t, { type: 'draw', player: 'p0' }, mauRules)).state;
    const r = ok(applyMove(drawn, { type: 'play', player: 'p0', cardId: '9-hearts' }, mauRules));
    expect(r.state.hands[0]).toHaveLength(2);
  });

  it('uses the configured penalty size, and can be turned off', () => {
    const two = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, makeRules({ mauRequired: true, mauPenalty: 2 })));
    expect(two.state.hands[0]).toHaveLength(3);
    const off = ok(applyMove(s, { type: 'play', player: 'p0', cardId: '9-hearts' }, makeRules({ mauRequired: false })));
    expect(off.state.hands[0]).toHaveLength(1);
  });

  it('is not needed for the winning card', () => {
    const t = makeState({ hands: ['9H', 'AS'], discard: '10H' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '9-hearts' }, mauRules));
    expect(r.state.phase).toBe('roundOver');
    expect(r.state.hands[0]).toHaveLength(0);
  });
});

/* ---------------------------- Round end and scoring ---------------------------- */

describe('round end', () => {
  it('ends the round when a hand is empty, even on a 7 or 8', () => {
    const t = makeState({ hands: ['7H', 'AS'], discard: '10H' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '7-hearts' }, rules));
    expect(r.state.phase).toBe('roundOver');
    expect(r.state.roundWinner).toBe(0);
    expect(r.state.pendingDraw).toBe(0);
    expect(applyMove(r.state, { type: 'draw', player: 'p1' }, rules).ok).toBe(false);
  });

  it('reports round points but leaves scores alone when scoring is off', () => {
    const t = makeState({ hands: ['9H', 'JS AS', 'QD 7C'], discard: '10H' });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '9-hearts' }, rules));
    expect(r.state.lastRoundPoints).toEqual([0, 31, 10]);
    expect(r.state.scores).toEqual([0, 0, 0]);
  });
});

describe('scoring across rounds', () => {
  const scored = makeRules({ scoring: true, roundsPerMatch: 3 });

  it('adds the points left in each hand to the running totals', () => {
    const t = makeState({ hands: ['9H', 'JS AS', 'QD 7C'], discard: '10H', scores: [5, 0, 40] });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '9-hearts' }, scored));
    expect(r.state.scores).toEqual([5, 31, 50]);
    expect(r.state.phase).toBe('roundOver');
    expect(r.events).toContainEqual({ type: 'roundOver', winner: 0, points: [0, 31, 10], scores: [5, 31, 50] });
  });

  it('ends the match after the last round; lowest total wins', () => {
    const t = makeState({ hands: ['9H', 'KS', 'QD'], discard: '10H', scores: [30, 20, 20], round: 3 });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '9-hearts' }, scored));
    // Final: [30, 24, 23] → seat 2 wins.
    expect(r.state.phase).toBe('matchOver');
    expect(r.state.matchWinners).toEqual([2]);
  });

  it('reports ties as multiple winners', () => {
    const t = makeState({ hands: ['9H', 'KS', 'KD'], discard: '10H', scores: [30, 20, 20], round: 3 });
    const r = ok(applyMove(t, { type: 'play', player: 'p0', cardId: '9-hearts' }, scored));
    expect(r.state.matchWinners).toEqual([1, 2]);
  });
});
