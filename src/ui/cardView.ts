/* ==========================================================================
   Card elements
   Paper cards (see .card in theme/components.css): the Kenney face sits
   inside, cropped to its pips; backs use the seigaiha SVG.
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
  const file = card ? `card_${card.suit}_${RANK_FILE[card.rank]}.png` : 'back-seigaiha.svg';
  return `${import.meta.env.BASE_URL}cards/${file}`;
}

/**
 * Creates a card element. Faces get an accessible label; backs are decorative.
 * @param card - the card, or null for a face-down card
 * @param tag - element type: 'div' for display, 'button' for clickable hand cards
 * @param extraClass - extra classes (e.g. "card--mini")
 * @returns the element (class "card")
 */
export function createCardEl(card: Card | null, tag: 'div' | 'button' = 'div', extraClass = ''): HTMLElement {
  const el = document.createElement(tag);
  el.className = `card ${card ? '' : 'card--back'} ${extraClass}`.trim().replace(/\s+/g, ' ');
  if (card) {
    const face = document.createElement('span');
    face.className = 'card__face';
    face.style.backgroundImage = `url("${cardImageUrl(card)}")`;
    el.appendChild(face);
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
