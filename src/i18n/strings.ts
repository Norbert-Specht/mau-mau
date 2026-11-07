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
  setupSubtitle: 'The German card game — against the computer or with friends',
  vsComputerHeading: 'Play against the computer',
  friendsHeading: 'Play with friends',
  friendsHint: 'Create a room and share the link. No accounts needed — you can add bots too.',
  createGame: 'Create game',
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
  waitingForHostNext: 'Waiting for the host to continue…',

  /* ---- Multiplayer: lobby ---- */
  creatingRoom: 'Creating room…',
  roomError: 'Couldn’t reach the connection server. Check your internet connection and try again.',
  lobbyTitle: 'Game room',
  shareLink: 'Invite friends with this link',
  copyLink: 'Copy link',
  copied: 'Copied!',
  players: 'Players',
  hostBadge: 'Host',
  youBadge: 'You',
  botBadge: (difficulty: string) => `Bot · ${difficulty}`,
  offlineBadge: 'offline',
  addBot: 'Add bot',
  removeBot: 'Remove',
  needMorePlayers: 'Waiting for at least one more player…',
  waitingForHost: 'Waiting for the host to start the game…',
  leaveRoom: 'Leave',
  closeRoomConfirm: 'Close this room? Everyone will be disconnected.',

  /* ---- Multiplayer: joining ---- */
  joinTitle: 'Join game',
  joinHint: 'You’ve been invited to a game of Mau-Mau.',
  join: 'Join',
  connecting: 'Connecting…',
  rejectedFull: 'This game is full (4 players).',
  rejectedStarted: 'This game has already started.',
  rejectedSelf: 'This is your own game. Open the link on another device or in another browser.',
  notFound: 'This game doesn’t exist any more. Ask for a new link.',
  connectError: 'Couldn’t connect. Check your internet connection and try again.',
  tryAgain: 'Try again',

  /* ---- Multiplayer: at the table ---- */
  hostLeftTitle: 'Game over',
  hostLeft: 'The host closed the game.',
  reconnecting: 'Connection lost – reconnecting…',
  waitingFor: (name: string) => `Waiting for ${name} to reconnect…`,
};

/* ---------------------------- Card names ---------------------------- */

/**
 * Long card name for screen readers, e.g. "Herz 7".
 * @param card - suit and rank
 * @returns accessible label
 */
export function cardLabel(card: { suit: Suit; rank: Rank }): string {
  return `${SUIT_NAMES[card.suit]} ${RANK_NAMES[card.rank]}`;
}
