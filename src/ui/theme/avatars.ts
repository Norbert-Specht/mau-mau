/* ==========================================================================
   Avatars
   Bots get simple, friendly SVG animal faces; humans get a colored disc with
   their initial. Everything is drawn in a 64×64 viewBox so avatars scale
   cleanly and need no image files.
   ========================================================================== */

export type Animal = 'fox' | 'bear' | 'frog' | 'cat';

/** Order in which bots get animals (bot 1 = fox, bot 2 = bear, …). */
export const BOT_ANIMALS: Animal[] = ['fox', 'bear', 'frog', 'cat'];

/** Shared face parts: eyes, cheeks and a small smile. */
const EYES = '<circle cx="24" cy="34" r="3.2" fill="#1d2a30"/><circle cx="40" cy="34" r="3.2" fill="#1d2a30"/>';
const SHINE = '<circle cx="25.2" cy="32.8" r="1" fill="#fff"/><circle cx="41.2" cy="32.8" r="1" fill="#fff"/>';
const SMILE = '<path d="M27 42q5 4 10 0" stroke="#1d2a30" stroke-width="2.2" fill="none" stroke-linecap="round"/>';

const FACES: Record<Animal, string> = {
  // Fox: orange head, pointed ears, white muzzle.
  fox: `<rect width="64" height="64" fill="#ffe2c4"/>
    <path d="M12 14 26 24 14 34z M52 14 38 24 50 34z" fill="#e8763a"/>
    <path d="M15 19 23 25 16 30z M49 19 41 25 48 30z" fill="#ffd2b0"/>
    <ellipse cx="32" cy="37" rx="20" ry="17" fill="#f08a4b"/>
    <path d="M32 54c-9 0-14-6-14-11 5 2 9 1 14-3 5 4 9 5 14 3 0 5-5 11-14 11z" fill="#fff6ec"/>
    ${EYES}${SHINE}<ellipse cx="32" cy="44" rx="3" ry="2.2" fill="#1d2a30"/>`,
  // Bear: round brown head, round ears, light snout.
  bear: `<rect width="64" height="64" fill="#e8dccd"/>
    <circle cx="16" cy="20" r="8" fill="#8a5a3b"/><circle cx="48" cy="20" r="8" fill="#8a5a3b"/>
    <circle cx="16" cy="20" r="4" fill="#c99272"/><circle cx="48" cy="20" r="4" fill="#c99272"/>
    <circle cx="32" cy="36" r="19" fill="#9b6646"/>
    <ellipse cx="32" cy="43" rx="9" ry="7" fill="#e3c2a3"/>
    ${EYES}${SHINE}<ellipse cx="32" cy="40.5" rx="3.2" ry="2.4" fill="#1d2a30"/>${SMILE}`,
  // Frog: wide green head with eyes on top.
  frog: `<rect width="64" height="64" fill="#d9f0dc"/>
    <circle cx="21" cy="22" r="8.5" fill="#58b368"/><circle cx="43" cy="22" r="8.5" fill="#58b368"/>
    <ellipse cx="32" cy="38" rx="22" ry="15" fill="#62c174"/>
    <circle cx="21" cy="22" r="4.6" fill="#fff"/><circle cx="43" cy="22" r="4.6" fill="#fff"/>
    <circle cx="21.6" cy="22.6" r="2.4" fill="#1d2a30"/><circle cx="43.6" cy="22.6" r="2.4" fill="#1d2a30"/>
    <circle cx="20" cy="42" r="3" fill="#f2a3a3" opacity=".7"/><circle cx="44" cy="42" r="3" fill="#f2a3a3" opacity=".7"/>
    <path d="M22 41q10 8 20 0" stroke="#1d2a30" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // Cat: grey head, pointy ears, whiskers.
  cat: `<rect width="64" height="64" fill="#e3e7ef"/>
    <path d="M13 12 27 22 14 31z M51 12 37 22 50 31z" fill="#7c8597"/>
    <path d="M16 17 23 23 17 27z M48 17 41 23 47 27z" fill="#f0b6c0"/>
    <ellipse cx="32" cy="37" rx="20" ry="17" fill="#8e97a8"/>
    ${EYES}${SHINE}<path d="M30 40h4l-2 2.4z" fill="#f08aa0"/>
    <path d="M30 44q2 2 4 0" stroke="#1d2a30" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M10 39h11M11 44l10-2M54 39H43M53 44l-10-2" stroke="#f6f7fa" stroke-width="1.3" stroke-linecap="round"/>`,
};

/** Background colors for human avatars, picked by name so they stay stable. */
const HUMAN_COLORS = ['#ef6f6c', '#4c9f70', '#5b7fd6', '#e0a030', '#a46bd6', '#2fa3b5'];

/**
 * SVG markup for a bot's animal face.
 * @param animal - which animal
 * @returns SVG markup string
 */
export function animalAvatar(animal: Animal): string {
  return `<svg class="avatar__img" viewBox="0 0 64 64" aria-hidden="true">${FACES[animal]}</svg>`;
}

/**
 * SVG markup for a human player: their initial on a colored disc.
 * The color is derived from the name, so a player keeps their color.
 * @param name - player name
 * @returns SVG markup string
 */
export function initialAvatar(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = HUMAN_COLORS[Math.abs(hash) % HUMAN_COLORS.length];
  const initial = escapeXml((name.trim()[0] ?? '?').toUpperCase());
  return `<svg class="avatar__img" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" fill="${color}"/>
    <text x="32" y="43" text-anchor="middle" font-family="var(--font-display)" font-size="30" font-weight="600" fill="#fff">${initial}</text>
  </svg>`;
}

/**
 * Escapes text for use inside SVG/XML markup (names are user input).
 * @param text - raw text
 * @returns escaped text
 */
function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
