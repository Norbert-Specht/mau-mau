/* ==========================================================================
   Visible state, legal-move helpers, and a whole-game simulation
   ========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canDraw,
  createGame,
  getPlayableCards,
  getVisibleState,
  makeRules,
  nextRandom,
  redactEvents,
  startNextRound,
  type GameState,
  type Move,
  type Rules,
} from '../../src/engine';
import { ids, makeState, ok, totalCards } from './helpers';

const rules = makeRules();

describe('getVisibleState', () => {
  const s = makeState({ hands: ['9H KC', 'AS QS QD'], discard: '8H 10H', draw: '7C 7D' });

  it('shows your own hand but only counts for others and the draw pile', () => {
    const v = getVisibleState(s, 'p1');
    expect(v.you).toBe(1);
    expect(ids(v.hand)).toEqual(['A-spades', 'Q-spades', 'Q-diamonds']);
    expect(v.players).toEqual([
      { id: 'p0', name: 'Player 0', cardCount: 2 },
      { id: 'p1', name: 'Player 1', cardCount: 3 },
    ]);
    expect(v.drawPileCount).toBe(2);
    expect(v.topCard.id).toBe('10-hearts');
    // No field anywhere leaks another hand or the draw pile.
    const json = JSON.stringify(v);
    expect(json).not.toContain('K-clubs');
    expect(json).not.toContain('7-clubs');
  });

  it('hides which card another player just drew', () => {
    const t = makeState({ hands: ['KC QC', 'AS'], discard: '10H', draw: 'JH' });
    const drawn = ok(applyMove(t, { type: 'draw', player: 'p0' }, rules)).state;
    expect(getVisibleState(drawn, 'p0').drawnCardId).toBe('J-hearts');
    expect(getVisibleState(drawn, 'p1').drawnCardId).toBeNull();
  });

  it('returns a copy that cannot change the real state', () => {
    const v = getVisibleState(s, 'p0');
    v.hand.pop();
    expect(s.hands[0]).toHaveLength(2);
  });

  it('throws for an unknown player', () => {
    expect(() => getVisibleState(s, 'zz')).toThrow();
  });
});

describe('redactEvents', () => {
  it("hides other players' drawn cards but keeps the count", () => {
    const t = makeState({ hands: ['KC', 'AS'], discard: '10H', draw: '8D' });
    const { events } = ok(applyMove(t, { type: 'draw', player: 'p0' }, rules));
    expect(redactEvents(events, 0)[0]).toMatchObject({ type: 'drew', count: 1, cards: [{ id: '8-diamonds' }] });
    expect(redactEvents(events, 1)[0]).toMatchObject({ type: 'drew', count: 1, cards: [] });
  });
});

describe('legal-move helpers', () => {
  it('lists playable cards for the player whose turn it is', () => {
    const s = makeState({ hands: ['9H 10S JC KC', 'AS'], discard: '10H' });
    expect(ids(getPlayableCards(getVisibleState(s, 'p0'), rules))).toEqual(['9-hearts', '10-spades', 'J-clubs']);
    expect(getPlayableCards(getVisibleState(s, 'p1'), rules)).toEqual([]);
    expect(canDraw(getVisibleState(s, 'p0'))).toBe(true);
  });

  it('only lists the drawn Jack while it waits for a suit', () => {
    const s = makeState({ hands: ['KH QC', 'AS'], discard: '10H', draw: 'JD' });
    const v = getVisibleState(ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state, 'p0');
    expect(ids(getPlayableCards(v, rules))).toEqual(['J-diamonds']);
    expect(canDraw(v)).toBe(false);
  });
});

/* ---------------------------- Simulation ---------------------------- */

/**
 * Picks a random legal move from a player's visible state (a minimal "bot").
 * @param s - full state
 * @param rules - active rules
 * @param seed - RNG state
 * @returns the move and the next RNG state
 */
function randomMove(s: GameState, rules: Rules, seed: number): { move: Move; seed: number } {
  const player = s.players[s.current].id;
  const view = getVisibleState(s, player);
  const playable = getPlayableCards(view, rules);
  const [r, next] = nextRandom(seed);
  if (playable.length === 0) {
    return { move: { type: 'draw', player }, seed: next };
  }
  const card = playable[Math.floor(r * playable.length)];
  // Call Mau most of the time, so the penalty path also gets exercised.
  return { move: { type: 'play', player, cardId: card.id, wish: 'hearts', mau: r < 0.8 }, seed: next };
}

describe('full games with random legal moves', () => {
  const variants: [string, Rules][] = [
    ['default rules', rules],
    ['all toggles flipped', makeRules({ sevenStacking: false, eightSkips: false, jackOnJack: true, playDrawnCard: false, mauRequired: false })],
    ['scored match', makeRules({ scoring: true, roundsPerMatch: 3 })],
  ];

  for (const [label, r] of variants) {
    it(`always keeps 32 unique cards and finishes (${label})`, () => {
      for (let game = 0; game < 60; game++) {
        const players = Array.from({ length: 2 + (game % 3) }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
        let s = createGame(players, r, game);
        let seed = game * 7919;
        let moves = 0;
        while (s.phase !== 'matchOver' && moves < 5000) {
          if (s.phase === 'roundOver') {
            if (!r.scoring) break;
            s = startNextRound(s, r);
          }
          const pick = randomMove(s, r, seed);
          seed = pick.seed;
          s = ok(applyMove(s, pick.move, r)).state;
          moves++;
          const all = [...s.drawPile, ...s.discardPile, ...s.hands.flat()].map((card) => card.id);
          expect(new Set(all).size).toBe(32);
          expect(totalCards(s)).toBe(32);
        }
        expect(moves).toBeLessThan(5000);
      }
    });
  }
});
