/* ==========================================================================
   Card elements
   Builds DOM elements for card faces and backs using the Kenney PNGs.
   ========================================================================== */

import type { Card, Rank } from '../engine';
import { cardLabel } from '../i18n/strings';

/** Kenney file names use two-digit numbers for 7–10 and letters for faces. */
const RANK_FILE: Record<Rank, string> = {
  '7': '07',
  '8': '08',
  '9': '09',
  '10': '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

/**
 * URL of a card's image (respects Vite's base path).
 * @param card - the card, or null for the card back
 * @returns image URL
 */
export function cardImageUrl(card: Card | null): string {
  const file = card ? `card_${card.suit}_${RANK_FILE[card.rank]}.png` : 'card_back.png';
  return `${import.meta.env.BASE_URL}cards/${file}`;
}

/**
 * Creates a card element. Faces get an accessible label; backs are decorative.
 * @param card - the card, or null for a face-down card
 * @param tag - element type: 'div' for display, 'button' for clickable hand cards
 * @returns the element (class "card")
 */
export function createCardEl(card: Card | null, tag: 'div' | 'button' = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.className = card ? 'card' : 'card card--back';
  el.style.backgroundImage = `url("${cardImageUrl(card)}")`;
  if (card) {
    el.dataset.cardId = card.id;
    el.setAttribute('aria-label', cardLabel(card));
    if (tag === 'div') el.setAttribute('role', 'img');
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  if (tag === 'button') (el as HTMLButtonElement).type = 'button';
  return el;
}

/**
 * Preloads all card images so the first deal doesn't flicker.
 * @param cards - every card face to preload
 * @returns nothing
 */
export function preloadCardImages(cards: Card[]): void {
  for (const c of [null, ...cards]) {
    const img = new Image();
    img.src = cardImageUrl(c);
  }
}
