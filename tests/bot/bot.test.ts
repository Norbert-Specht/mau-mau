/* ==========================================================================
   Bot tests
   ========================================================================== */

import { describe, expect, it } from 'vitest';
import { chooseMove, unseenCards, type Difficulty } from '../../src/bot/bot';
import {
  applyMove,
  createGame,
  getVisibleState,
  makeRules,
  nextRandom,
  startNextRound,
  type GameState,
} from '../../src/engine';
import { makeState, ok, totalCards } from '../engine/helpers';

const rules = makeRules();

/**
 * Seeded random function for deterministic bot tests.
 * @param seed - starting seed
 * @returns a () => number in [0, 1)
 */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    const [v, next] = nextRandom(s);
    s = next;
    return v;
  };
}

/**
 * Shortcut: the move a bot at seat 0 would make.
 * @param s - full state
 * @param difficulty - bot level
 * @returns the chosen move
 */
function botMove(s: GameState, difficulty: Difficulty = 'normal') {
  return chooseMove(getVisibleState(s, 'p0'), rules, difficulty, seeded(1));
}

describe('all bots', () => {
  it('return null when it is not their turn', () => {
    const s = makeState({ hands: ['9H', 'AS'], discard: '10H', current: 1 });
    expect(botMove(s)).toBeNull();
  });

  it('draw when nothing fits', () => {
    const s = makeState({ hands: ['KC QC', 'AS'], discard: '10H' });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(botMove(s, d)).toEqual({ type: 'draw', player: 'p0' });
    }
  });

  it('call Mau when going down to one card', () => {
    const s = makeState({ hands: ['9H KC', 'AS QS QD'], discard: '10H' });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(botMove(s, d)).toMatchObject({ type: 'play', cardId: '9-hearts', mau: true });
    }
  });

  it('stack a 7 when facing a 7-penalty', () => {
    const s = makeState({ hands: ['7S KC QC', 'AS'], discard: '7H', pendingDraw: 2 });
    expect(botMove(s)).toMatchObject({ type: 'play', cardId: '7-spades' });
  });
});

describe('normal bot', () => {
  it('holds a Jack when another card fits', () => {
    const s = makeState({ hands: ['JC 9H KS QS 8D', 'AS AD AC'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: '9-hearts' });
  });

  it('plays a Jack when it is the only card that fits', () => {
    // Two spades and two diamonds: the tie goes to diamonds (more points to shed).
    const s = makeState({ hands: ['JC KS QS 8D 9D', 'AS AD AC AH'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: 'J-clubs', wish: 'diamonds' });
  });

  it('plays the Jack when close to winning', () => {
    const s = makeState({ hands: ['JC KS', 'AS AD AC AH'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: 'J-clubs', wish: 'spades', mau: true });
  });

  it('wishes the suit it holds most of', () => {
    const s = makeState({ hands: ['JC KD QD 9D AS', 'AH'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: 'J-clubs', wish: 'diamonds' });
  });

  it('attacks with a 7 when the next player has 2 or fewer cards', () => {
    const s = makeState({ hands: ['7H AH KH QS', 'AS 9C'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: '7-hearts' });
  });

  it('attacks with an 8 when it has no 7', () => {
    const s = makeState({ hands: ['8H AH KH QS', 'AS'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: '8-hearts' });
  });

  it('sheds high-point cards when there is no threat', () => {
    const s = makeState({ hands: ['7H AH QH KS', 'AS 9C KD QC'], discard: '10H' });
    expect(botMove(s)).toMatchObject({ cardId: 'A-hearts' });
  });

  it('plays a playable drawn card', () => {
    const s = makeState({ hands: ['KS QS 8D 9D', 'AS AD AC AH'], discard: '10H', draw: '9C 9H' });
    const drawn = ok(applyMove(s, { type: 'draw', player: 'p0' }, rules)).state;
    expect(botMove(drawn)).toMatchObject({ type: 'play', cardId: '9-hearts' });
  });
});

describe('hard bot', () => {
  it('knows which cards it has not seen', () => {
    const s = makeState({ hands: ['9H KC', 'AS'], discard: '8H 10H' });
    const unseen = unseenCards(getVisibleState(s, 'p0'));
    expect(unseen).toHaveLength(28);
    expect(unseen.some((c) => c.id === '9-hearts' || c.id === '10-hearts')).toBe(false);
  });

  it('wishes a suit that is mostly played out', () => {
    // Equal holdings in hearts and spades; most spades are already on the pile.
    const s = makeState({
      hands: ['JC 9H 9S', 'AD AC'],
      discard: '7S 8S 10S QS KS AS 10D',
    });
    expect(botMove(s, 'hard')).toMatchObject({ cardId: 'J-clubs', wish: 'spades' });
    expect(botMove(s, 'normal')).toMatchObject({ cardId: 'J-clubs' });
  });
});

describe('bots playing full games', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    it(`only ever make legal moves (${difficulty})`, () => {
      const scored = makeRules({ scoring: true, roundsPerMatch: 2 });
      for (let game = 0; game < 30; game++) {
        const players = Array.from({ length: 2 + (game % 3) }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
        let s = createGame(players, scored, game);
        const random = seeded(game);
        let moves = 0;
        while (s.phase !== 'matchOver' && moves < 3000) {
          if (s.phase === 'roundOver') s = startNextRound(s, scored);
          const id = s.players[s.current].id;
          const move = chooseMove(getVisibleState(s, id), scored, difficulty, random);
          expect(move).not.toBeNull();
          const result = applyMove(s, move!, scored);
          if (!result.ok) throw new Error(`${difficulty} bot made illegal move: ${result.error}`);
          s = result.state;
          moves++;
        }
        expect(s.phase).toBe('matchOver');
        expect(totalCards(s)).toBe(32);
      }
    });
  }

  it('normal bots never take the Mau penalty', () => {
    let s = createGame([{ id: 'p0', name: 'A' }, { id: 'p1', name: 'B' }], rules, 9);
    for (let i = 0; i < 500 && (s.phase === 'playing' || s.phase === 'drawn'); i++) {
      const id = s.players[s.current].id;
      const r = ok(applyMove(s, chooseMove(getVisibleState(s, id), rules, 'normal')!, rules));
      expect(r.events.some((e) => e.type === 'drew' && e.reason === 'mau')).toBe(false);
      s = r.state;
    }
  });
});
