/* ==========================================================================
   Table props as markup: casino chips and dice.
   Shared by the game and the /design gallery.
   ========================================================================== */

export type ChipColor = 'white' | 'red' | 'green' | 'navy';

/** Chip denominations used to "pay out" points, biggest first. */
export const CHIP_VALUES: [number, ChipColor][] = [
  [100, 'navy'],
  [25, 'green'],
  [5, 'red'],
  [1, 'white'],
];

/** Most chips shown for one amount; bigger amounts still read fine from the number next to them. */
const MAX_CHIPS = 6;

/**
 * One casino chip.
 * @param color - chip color
 * @param label - text in the middle (may be empty)
 * @param i - position in a stack (0 = bottom), used by .chip-stack
 * @returns markup
 */
export function chipHtml(color: ChipColor, label = '', i = 0): string {
  return `<span class="chip chip--${color}" style="--i:${i}">${label}</span>`;
}

/**
 * Turns a point total into the fewest chips, like a cashier would.
 * @param points - total points
 * @returns chip markup (at most MAX_CHIPS chips)
 */
export function chipsFor(points: number): string {
  let rest = points;
  const out: string[] = [];
  for (const [value, color] of CHIP_VALUES) {
    while (rest >= value && out.length < MAX_CHIPS) {
      out.push(chipHtml(color, String(value)));
      rest -= value;
    }
  }
  return out.join('');
}

/** Pip positions on a 3×3 grid for each die face (row, column, 1-based). */
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

/**
 * A red die showing `n`.
 * @param n - face value 1–6
 * @returns markup
 */
export function dieHtml(n: number): string {
  const pips = PIPS[n].map(([r, col]) => `<span class="die__pip" style="grid-area:${r}/${col}"></span>`).join('');
  return `<span class="die" aria-hidden="true">${pips}</span>`;
}
