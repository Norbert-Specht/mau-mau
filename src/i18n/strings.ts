/* ==========================================================================
   UI strings
   Every piece of text the player sees lives here, so the game can be
   translated later by editing this one file. Game terms are German
   (Mau, Mau-Mau, Bube, Ich wünsche mir…); everything else is English.
   ========================================================================== */

import type { Rank, Suit } from '../engine';

/** German suit names (French-suited deck). */
export const SUIT_NAMES: Record<Suit, string> = {
  hearts: 'Herz',
  diamonds: 'Karo',
  clubs: 'Kreuz',
  spades: 'Pik',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

/** German rank names as shown in the log (Bube, Dame, König, Ass). */
export const RANK_NAMES: Record<Rank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Bube',
  Q: 'Dame',
  K: 'König',
  A: 'Ass',
};

export const STRINGS = {
  appTitle: 'Mau-Mau',

  /* ---- Setup screen ---- */
  setupSubtitle: 'Play against the computer',
  yourName: 'Your name',
  defaultName: 'Player',
  botCount: 'Opponents',
  difficulty: 'Bot strength',
  difficultyEasy: 'Easy',
  difficultyNormal: 'Normal',
  difficultyHard: 'Hard',
  rulesHeading: 'Rules',
  startGame: 'Start game',
  botNames: ['Anna', 'Jonas', 'Lena'],

  /* ---- Rule labels ---- */
  ruleHandSize: 'Cards per player',
  ruleSevenDrawTwo: '7: next player draws 2',
  ruleSevenStacking: '7s can be stacked',
  ruleEightSkips: '8: next player is skipped',
  ruleJackWild: 'Bube is wild (wish a suit)',
  ruleJackOnJack: 'Bube on Bube allowed',
  rulePlayDrawnCard: 'May play the drawn card',
  ruleMauRequired: 'Must call “Mau” at one card',
  ruleMauPenalty: 'Penalty cards for forgetting Mau',
  ruleScoring: 'Keep score across rounds',
  ruleRoundsPerMatch: 'Rounds per match',

  /* ---- Table ---- */
  you: 'You',
  yourTurn: 'Your turn',
  theirTurn: (name: string) => `${name}’s turn`,
  draw: 'Draw',
  drawPenalty: (n: number) => `Draw ${n}`,
  pass: 'Keep card',
  mauButton: 'Mau!',
  menu: 'Menu',
  leaveConfirm: 'Leave this game?',
  cardsLeft: (n: number) => (n === 1 ? '1 card' : `${n} cards`),
  drawPileLabel: (n: number) => `Draw pile, ${n} cards`,
  wishLabel: 'Ich wünsche mir',
  currentSuit: 'Suit',
  pendingDraw: (n: number) => `+${n}`,
  roundLabel: (round: number, total: number | null) => (total ? `Round ${round} / ${total}` : `Round ${round}`),
  log: 'Log',
  statusDrawn: 'Play the drawn card or keep it',
  statusPenalty: (n: number, canStack: boolean) => (canStack ? `Play a 7 or draw ${n}` : `Draw ${n}`),
  statusWish: (suit: string) => `Your turn – Ich wünsche mir ${suit}`,

  /* ---- Suit picker ---- */
  pickSuitTitle: 'Ich wünsche mir…',
  cancel: 'Cancel',

  /* ---- Round / match over ---- */
  mauMau: 'Mau-Mau!',
  roundWinner: (name: string, isYou: boolean) => (isYou ? 'You win the round!' : `${name} wins the round`),
  matchWinner: (names: string[], isYou: boolean) =>
    isYou && names.length === 1 ? 'You win the match!' : `Match winner: ${names.join(' & ')}`,
  pointsHeading: 'Points',
  pointsThisRound: 'Round',
  pointsTotal: 'Total',
  nextRound: 'Next round',
  newMatch: 'New match',
  backToMenu: 'Back to menu',
};

/* ---------------------------- Card names ---------------------------- */

/**
 * Short card name for logs and screen readers, e.g. "7 ♥" or "Bube ♣".
 * @param card - suit and rank
 * @returns display name
 */
export function cardName(card: { suit: Suit; rank: Rank }): string {
  return `${RANK_NAMES[card.rank]} ${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Long card name for screen readers, e.g. "Herz 7".
 * @param card - suit and rank
 * @returns accessible label
 */
export function cardLabel(card: { suit: Suit; rank: Rank }): string {
  return `${SUIT_NAMES[card.suit]} ${RANK_NAMES[card.rank]}`;
}

/**
 * Suit with symbol, e.g. "Herz ♥".
 * @param suit - the suit
 * @returns display text
 */
export function suitText(suit: Suit): string {
  return `${SUIT_NAMES[suit]} ${SUIT_SYMBOLS[suit]}`;
}

/* ---------------------------- Event log lines ---------------------------- */
/* `who` is already "You" or the player's name; `you` says which, so the   */
/* sentence can be phrased correctly.                                       */

export const LOG = {
  played: (who: string, card: string) => `${who} played ${card}`,
  wished: (suit: string) => ` – Ich wünsche mir ${suit}`,
  mustDraw: (who: string, n: number) => ` – ${who} must draw ${n}`,
  drewPenalty: (who: string, n: number) => `${who} drew ${n} cards`,
  drewOne: (who: string) => `${who} drew a card`,
  drewCard: (card: string) => `You drew ${card}`,
  mauPenalty: (who: string, n: number) => `${who} forgot to say Mau – +${n}`,
  skipped: (who: string, you: boolean) => (you ? 'You are skipped' : `${who} is skipped`),
  mau: (who: string) => `${who}: Mau!`,
  passed: (who: string) => `${who} passed`,
  reshuffled: 'Discard pile reshuffled',
  roundOver: (who: string, you: boolean) => (you ? 'Mau-Mau! You win the round' : `Mau-Mau! ${who} wins the round`),
  matchOver: (names: string) => `${names} won the match`,
};
