/* ==========================================================================
   Suit shapes
   Vector suit symbols (24×24 viewBox) for tokens, badges and confetti.
   Using SVG instead of the ♥♦♣♠ font glyphs keeps them identical on every
   device (some phones draw the glyphs as colored emoji).
   ========================================================================== */

import type { Suit } from '../../engine';

export const SUIT_PATHS: Record<Suit, string> = {
  hearts:
    'M12 21.2s-7.6-4.6-9.7-9.3C.8 8.5 3 4.5 6.8 4.5c2.2 0 3.8 1.3 5.2 3.2 1.4-1.9 3-3.2 5.2-3.2 3.8 0 6 4 4.5 7.4-2.1 4.7-9.7 9.3-9.7 9.3z',
  diamonds: 'M12 2.2 20.3 12 12 21.8 3.7 12z',
  clubs:
    'M12 2.6a4.3 4.3 0 0 0-3.7 6.6 4.3 4.3 0 1 0 2.4 7.6c-.3 1.9-1.2 3.4-2.6 4.8h7.8c-1.4-1.4-2.3-2.9-2.6-4.8a4.3 4.3 0 1 0 2.4-7.6A4.3 4.3 0 0 0 12 2.6z',
  spades:
    'M12 2.4C9 6.8 3.2 9.6 3.2 14.1a4.4 4.4 0 0 0 7.6 3c-.3 1.9-1.2 3.4-2.6 4.7h7.6c-1.4-1.3-2.3-2.8-2.6-4.7a4.4 4.4 0 0 0 7.6-3c0-4.5-5.8-7.3-8.8-11.7z',
};

/** Red suits use --suit-red, black suits --suit-black. */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/**
 * Inline SVG markup for one suit symbol, colored by the suit's token.
 * @param suit - which suit
 * @param className - extra class for sizing (defaults to "suit-icon")
 * @returns SVG markup string
 */
export function suitSvg(suit: Suit, className = 'suit-icon'): string {
  const color = isRedSuit(suit) ? 'var(--suit-red)' : 'var(--suit-black)';
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT_PATHS[suit]}" fill="${color}"/></svg>`;
}
