/* ==========================================================================
   Rules configuration
   Every house rule is a field here so the settings screen can toggle it.
   The engine reads these flags; it never hard-codes a variant.
   ========================================================================== */

export interface Rules {
  /** Cards dealt to each player at the start of a round. */
  handSize: number;
  /** A 7 makes the next player draw 2 cards. */
  sevenDrawTwo: boolean;
  /** A player facing a 7 may answer with another 7, passing on the accumulated penalty. */
  sevenStacking: boolean;
  /** An 8 skips the next player. */
  eightSkips: boolean;
  /** A Jack (Bube) can be played on anything and the player names the next suit. */
  jackWild: boolean;
  /** Allows a Jack to be played on a Jack (only matters when jackWild is on). */
  jackOnJack: boolean;
  /** After drawing one card, it is played automatically if it fits (a Jack still asks for a suit). */
  playDrawnCard: boolean;
  /** Players must call "Mau" when going down to one card. */
  mauRequired: boolean;
  /** Cards drawn as a penalty for forgetting to call "Mau". */
  mauPenalty: number;
  /** Track points across rounds; lowest total wins the match. */
  scoring: boolean;
  /** Number of rounds in a scored match (only used when scoring is on). */
  roundsPerMatch: number;
}

/** Default rules. The Mau call is optional and off by default. */
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  handSize: 5,
  sevenDrawTwo: true,
  sevenStacking: true,
  eightSkips: true,
  jackWild: true,
  jackOnJack: false,
  playDrawnCard: true,
  mauRequired: false,
  mauPenalty: 1,
  scoring: false,
  roundsPerMatch: 5,
});

/** Cards a single 7 adds to the pending draw penalty. */
export const SEVEN_PENALTY = 2;

/**
 * Builds a full rules object from partial overrides.
 * @param overrides - any rule fields to change from the defaults
 * @returns a complete Rules object
 */
export function makeRules(overrides: Partial<Rules> = {}): Rules {
  return { ...DEFAULT_RULES, ...overrides };
}
