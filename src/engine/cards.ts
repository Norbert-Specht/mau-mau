/* ==========================================================================
   Cards
   The 32-card Mau-Mau deck (7 through Ace in four suits) and point values.
   We use French suits because the Kenney art uses them:
   hearts = Herz, diamonds = Karo, clubs = Kreuz, spades = Pik.
   ========================================================================== */

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  /** Stable unique id, e.g. "7-hearts". Moves refer to cards by this id. */
  id: string;
  suit: Suit;
  rank: Rank;
}

/**
 * Points a card is worth when it is still in a hand at the end of a round.
 * Jack 20, Ace 11, Ten 10, King 4, Queen 3, 7–9 face value. Lower is better.
 */
export const CARD_POINTS: Record<Rank, number> = {
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 20,
  Q: 3,
  K: 4,
  A: 11,
};

/**
 * Builds a single card with its canonical id.
 * @param suit - the card's suit
 * @param rank - the card's rank
 * @returns a new Card object
 */
export function makeCard(suit: Suit, rank: Rank): Card {
  return { id: `${rank}-${suit}`, suit, rank };
}

/**
 * Creates a fresh, unshuffled 32-card deck.
 * @returns an array of 32 unique cards, ordered by suit then rank
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeCard(suit, rank));
  }
  return deck;
}

/**
 * Point value of one card for scoring.
 * @param card - the card to score
 * @returns its point value
 */
export function cardPoints(card: Card): number {
  return CARD_POINTS[card.rank];
}

/**
 * Total point value of a hand.
 * @param cards - the cards in the hand
 * @returns the sum of their point values
 */
export function handPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

/**
 * Type guard for suit strings coming from untrusted input (e.g. the network).
 * @param value - any value
 * @returns true if value is one of the four suits
 */
export function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && (SUITS as readonly string[]).includes(value);
}
