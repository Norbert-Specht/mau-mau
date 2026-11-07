/* ==========================================================================
   Bot
   Picks a move using ONLY the bot's VisibleState — the same information a
   human at that seat would have. No peeking at other hands or the draw pile.

   Difficulty levels:
   - easy:   random legal card, random wish
   - normal: holds Jacks for last, wishes the suit it holds most of,
             plays 7s/8s aggressively when the next player has ≤ 2 cards,
             sheds high-point cards early
   - hard:   normal + counts played cards to estimate which cards are still
             out there, and prefers cards/wishes opponents are unlikely to follow
   All bots remember to call "Mau".
   ========================================================================== */

import {
  canPass,
  cardPoints,
  createDeck,
  getPlayableCards,
  isWildJack,
  SUITS,
  type Card,
  type Move,
  type Rules,
  type Suit,
  type VisibleState,
} from '../engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** A source of random numbers in [0, 1). Injectable so tests are deterministic. */
export type RandomFn = () => number;

/** Opponents at or below this many cards are about to win: time to attack. */
const THREAT_CARD_COUNT = 2;

/**
 * Chooses the bot's next move.
 * @param view - the bot's visible state
 * @param rules - active rules
 * @param difficulty - easy, normal or hard
 * @param random - random source (defaults to Math.random)
 * @returns a move, or null if it is not the bot's turn
 */
export function chooseMove(
  view: VisibleState,
  rules: Rules,
  difficulty: Difficulty,
  random: RandomFn = Math.random,
): Move | null {
  if (view.current !== view.you) return null;
  if (view.phase !== 'playing' && view.phase !== 'drawn') return null;

  const player = view.players[view.you].id;
  const playable = getPlayableCards(view, rules);

  const card =
    difficulty === 'easy'
      ? pickRandom(playable, random)
      : pickSmart(view, rules, playable, difficulty === 'hard' ? unseenCards(view) : null);

  if (!card) return canPass(view) ? { type: 'pass', player } : { type: 'draw', player };

  const move: Move = { type: 'play', player, cardId: card.id };
  if (isWildJack(card, rules)) {
    move.wish =
      difficulty === 'easy'
        ? SUITS[Math.floor(random() * SUITS.length)]
        : chooseWish(view, card, difficulty === 'hard' ? unseenCards(view) : null);
  }
  // Going from 2 cards to 1: always say "Mau".
  if (view.hand.length === 2) move.mau = true;
  return move;
}

/* ---------------------------- Card choice ---------------------------- */

/**
 * Picks a random element.
 * @param items - candidates
 * @param random - random source
 * @returns one item, or null if empty
 */
function pickRandom<T>(items: T[], random: RandomFn): T | null {
  return items.length ? items[Math.floor(random() * items.length)] : null;
}

/**
 * Normal/hard card choice.
 * @param view - bot's visible state
 * @param rules - active rules
 * @param playable - legal cards
 * @param unseen - (hard only) cards not yet seen by the bot, else null
 * @returns the card to play, or null to draw/pass
 */
function pickSmart(view: VisibleState, rules: Rules, playable: Card[], unseen: Card[] | null): Card | null {
  if (playable.length === 0) return null;

  const regular = playable.filter((c) => !isWildJack(c, rules));
  const threatened = nextPlayerCardCount(view) <= THREAT_CARD_COUNT;

  // "Hold Jacks for last": any regular card is preferred. When only a Jack
  // fits, playing it beats drawing — holding it would just grow the hand.
  if (regular.length === 0) return playable[0];

  if (threatened) {
    // Hit the player who is about to win: a 7 makes them draw, an 8 skips them.
    const attack =
      (rules.sevenDrawTwo && regular.find((c) => c.rank === '7')) ||
      (rules.eightSkips && regular.find((c) => c.rank === '8'));
    if (attack) return attack;
  }

  // Score every regular card; highest score wins.
  const suitCounts = countSuits(view.hand, rules);
  let best = regular[0];
  let bestScore = -Infinity;
  for (const card of regular) {
    // Shed high-point cards early (matters for scoring and is a good habit).
    let score = cardPoints(card);
    // Keep options: prefer leaving a top card in a suit we still hold plenty of.
    score += (suitCounts[card.suit] - 1) * 2;
    if (unseen) {
      // Hard: lower the score for cards that opponents can easily follow.
      // The penalty weight (15) makes "hard to follow" worth about as much as
      // shedding a Ten, so it only overrides points when the difference is clear.
      score -= followChance(card, unseen, rules) * 15;
    }
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Chooses the suit to wish for after playing a Jack.
 * @param view - bot's visible state
 * @param jack - the Jack being played (excluded from the count)
 * @param unseen - (hard only) unseen cards, else null
 * @returns the wished suit
 */
function chooseWish(view: VisibleState, jack: Card, unseen: Card[] | null): Suit {
  const rest = view.hand.filter((c) => c.id !== jack.id && c.rank !== 'J');
  let best: Suit = SUITS[0];
  let bestScore = -Infinity;
  for (const suit of SUITS) {
    const mine = rest.filter((c) => c.suit === suit);
    // Mostly: the suit we hold most of. Small tie-breaker: more points to shed.
    let score = mine.length * 10 + mine.reduce((s, c) => s + cardPoints(c), 0) / 10;
    if (unseen) {
      // Hard: prefer suits that are mostly gone already, so opponents can't follow.
      score -= unseen.filter((c) => c.suit === suit && c.rank !== 'J').length * 3;
    }
    if (score > bestScore) {
      best = suit;
      bestScore = score;
    }
  }
  return best;
}

/* ---------------------------- Card counting ---------------------------- */

/**
 * Cards the bot has not seen: the full deck minus its hand and the face-up pile.
 * These are spread over the draw pile and the opponents' hands.
 * @param view - bot's visible state
 * @returns the unseen cards
 */
export function unseenCards(view: VisibleState): Card[] {
  const seen = new Set([...view.hand, ...view.discardPile].map((c) => c.id));
  return createDeck().filter((c) => !seen.has(c.id));
}

/**
 * Fraction of unseen cards that could be played on top of `card`.
 * @param card - the card the bot is thinking of playing
 * @param unseen - unseen cards
 * @param rules - active rules
 * @returns a value from 0 (nobody can follow) to 1
 */
function followChance(card: Card, unseen: Card[], rules: Rules): number {
  if (unseen.length === 0) return 0;
  const followers = unseen.filter(
    (c) => c.suit === card.suit || c.rank === card.rank || isWildJack(c, rules),
  );
  return followers.length / unseen.length;
}

/* ---------------------------- Small helpers ---------------------------- */

/**
 * Card count of the player who moves after the bot.
 * @param view - bot's visible state
 * @returns that player's number of cards
 */
function nextPlayerCardCount(view: VisibleState): number {
  const n = view.players.length;
  const next = (((view.you + view.direction) % n) + n) % n;
  return view.players[next].cardCount;
}

/**
 * Counts non-wild cards per suit in a hand.
 * @param hand - cards
 * @param rules - active rules (to know whether Jacks are wild)
 * @returns count per suit
 */
function countSuits(hand: Card[], rules: Rules): Record<Suit, number> {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const c of hand) if (!isWildJack(c, rules)) counts[c.suit]++;
  return counts;
}
