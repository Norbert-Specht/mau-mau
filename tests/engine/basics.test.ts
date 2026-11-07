/* ==========================================================================
   Cards, RNG and game setup
   ========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createGame,
  handPoints,
  makeRules,
  nextRandom,
  shuffle,
  startNextRound,
} from '../../src/engine';
import { cards, totalCards } from './helpers';

const twoPlayers = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Ben' },
];
const fourPlayers = [...twoPlayers, { id: 'c', name: 'Cem' }, { id: 'd', name: 'Dana' }];

describe('deck', () => {
  it('has 32 unique cards, 7 to Ace in four suits', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((c) => c.id)).size).toBe(32);
    expect(deck.filter((c) => c.suit === 'hearts')).toHaveLength(8);
  });

  it('scores Jack 20, Ace 11, Ten 10, King 4, Queen 3, 7–9 face value', () => {
    expect(handPoints(cards('JH'))).toBe(20);
    expect(handPoints(cards('AH'))).toBe(11);
    expect(handPoints(cards('10H'))).toBe(10);
    expect(handPoints(cards('KH'))).toBe(4);
    expect(handPoints(cards('QH'))).toBe(3);
    expect(handPoints(cards('7H 8H 9H'))).toBe(24);
    // Whole deck: 4 × (7+8+9+10+20+3+4+11) = 4 × 72
    expect(handPoints(createDeck())).toBe(288);
  });
});

describe('seeded RNG', () => {
  it('produces the same sequence for the same seed', () => {
    expect(nextRandom(123)).toEqual(nextRandom(123));
    expect(nextRandom(123)[0]).not.toBe(nextRandom(124)[0]);
  });

  it('returns values in [0, 1)', () => {
    let seed = 7;
    for (let i = 0; i < 1000; i++) {
      const [value, next] = nextRandom(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      seed = next;
    }
  });

  it('shuffles reproducibly and keeps every item', () => {
    const deck = createDeck();
    const a = shuffle(deck, 99);
    const b = shuffle(deck, 99);
    expect(a.items).toEqual(b.items);
    expect(a.seed).toBe(b.seed);
    expect([...a.items].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...deck].sort((x, y) => x.id.localeCompare(y.id)),
    );
    expect(a.items).not.toEqual(shuffle(deck, 100).items);
    // Input array is untouched.
    expect(deck).toEqual(createDeck());
  });
});

describe('createGame', () => {
  const rules = makeRules();

  it('deals 5 cards each and flips one starting card', () => {
    const s = createGame(fourPlayers, rules, 1);
    expect(s.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile).toHaveLength(32 - 20 - 1);
    expect(totalCards(s)).toBe(32);
    expect(s.current).toBe(0);
    expect(s.phase).toBe('playing');
  });

  it('respects a custom hand size', () => {
    const s = createGame(twoPlayers, makeRules({ handSize: 7 }), 1);
    expect(s.hands.map((h) => h.length)).toEqual([7, 7]);
  });

  it('is reproducible from the seed', () => {
    expect(createGame(fourPlayers, rules, 5)).toEqual(createGame(fourPlayers, rules, 5));
    expect(createGame(fourPlayers, rules, 5).hands).not.toEqual(createGame(fourPlayers, rules, 6).hands);
  });

  it('never starts with a wild Jack on the discard pile', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = createGame(twoPlayers, rules, seed);
      expect(s.discardPile[0].rank).not.toBe('J');
      expect(totalCards(s)).toBe(32);
    }
  });

  it('rejects invalid setups', () => {
    expect(() => createGame([twoPlayers[0]], rules, 1)).toThrow();
    expect(() => createGame([twoPlayers[0], twoPlayers[0]], rules, 1)).toThrow();
    expect(() => createGame(fourPlayers, makeRules({ handSize: 8 }), 1)).toThrow();
  });
});

describe('startNextRound', () => {
  it('only works after a round ended, then rotates the starting seat', () => {
    const rules = makeRules();
    const s = createGame(fourPlayers, rules, 3);
    expect(startNextRound(s, rules)).toBe(s);

    const over = { ...s, phase: 'roundOver' as const, roundWinner: 0, scores: [0, 10, 20, 30] };
    const next = startNextRound(over, rules);
    expect(next.round).toBe(2);
    expect(next.startSeat).toBe(1);
    expect(next.current).toBe(1);
    expect(next.phase).toBe('playing');
    expect(next.scores).toEqual([0, 10, 20, 30]);
    expect(next.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(totalCards(next)).toBe(32);
  });
});
