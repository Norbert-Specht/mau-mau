/* ==========================================================================
   Motion helpers (Web Animations API, transform/opacity only)
   - flyArc:  FLIP flight along a gentle arc, with a landing bounce
   - pop:     scale-in with overshoot (chips, bubbles, badges)
   - shake:   quick side-to-side "nope"
   - stamp:   slam-down for the skip stamp
   - confetti: suit-shaped pieces bursting from a point
   With prefers-reduced-motion (or the gallery's simulate switch), every
   helper becomes a short fade.
   ========================================================================== */

import { SUITS } from '../../engine';
import { SUIT_PATHS, isRedSuit } from './suits';

/** Set by the /design gallery to preview reduced motion without changing OS settings. */
let simulateReduced = false;

/**
 * Turns the reduced-motion preview on or off.
 * @param on - true to force fades
 * @returns nothing
 */
export function setSimulateReducedMotion(on: boolean): void {
  simulateReduced = on;
}

/**
 * Should animations be replaced by fades?
 * @returns true for reduced motion
 */
export function reducedMotion(): boolean {
  return simulateReduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reads a duration token (e.g. "--dur-flight: 520ms") as milliseconds.
 * @param name - custom property name
 * @param fallback - used if the token is missing
 * @returns milliseconds
 */
export function token(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return fallback;
  return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : value;
}

/** Same curves as the CSS tokens (WAAPI needs the literal strings). */
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * Quick fade-in used instead of motion when reduced motion is on.
 * @param el - element to fade in
 * @param delay - start delay in ms
 * @returns the animation
 */
function fadeIn(el: Element, delay = 0): Animation {
  return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay, easing: 'ease-out', fill: 'backwards' });
}

/**
 * Flies an element from a previous screen rectangle to where it is now,
 * along an arc, then lands with a small bounce. (FLIP: First, Last, Invert, Play.)
 * Animate an INNER element if the outer one carries its own resting
 * transform (e.g. the discard pile's random rotation).
 * @param el - element already in its final place
 * @param from - where it should appear to start
 * @param options - delay, start rotation (deg), flight duration
 * @returns the animation
 */
export function flyArc(
  el: HTMLElement,
  from: DOMRect,
  options: { delay?: number; fromRotate?: number; duration?: number } = {},
): Animation {
  const delay = options.delay ?? 0;
  if (reducedMotion()) return fadeIn(el, delay);

  const to = el.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = to.width ? from.width / to.width : 1;
  const lift = token('--arc-lift', 56);
  const r0 = options.fromRotate ?? 0;

  return el.animate(
    [
      // Start where it was.
      { transform: `translate(${dx}px, ${dy}px) rotate(${r0}deg) scale(${scale})`, easing: 'ease-out' },
      // Halfway: raised above the straight line and slightly bigger → arc + "lift".
      {
        offset: 0.5,
        transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) rotate(${r0 / 2}deg) scale(1.08)`,
        easing: 'ease-in',
      },
      // Touch down a hair small, then settle: the tiny bounce.
      { offset: 0.86, transform: 'translate(0, 0) rotate(0deg) scale(0.96)', easing: EASE_OUT },
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    ],
    { duration: options.duration ?? token('--dur-flight', 520), delay, fill: 'backwards' },
  );
}

/**
 * Pops an element in with a little overshoot.
 * @param el - element to animate
 * @param delay - start delay in ms
 * @returns the animation
 */
export function pop(el: Element, delay = 0): Animation {
  if (reducedMotion()) return fadeIn(el, delay);
  return el.animate(
    [
      { transform: 'scale(0.3)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: token('--dur-slow', 420), delay, easing: EASE_BOUNCE, fill: 'backwards' },
  );
}

/**
 * Shows an element briefly (pop in, hold, fade out) — for speech bubbles.
 * @param el - element to show
 * @param holdMs - how long it stays fully visible
 * @returns the animation (finishes when hidden again)
 */
export function flash(el: Element, holdMs = 1200): Animation {
  const enter = reducedMotion() ? 'scale(1)' : 'scale(0.4) translateY(8px)';
  const total = 300 + holdMs + 300;
  return el.animate(
    [
      { transform: enter, opacity: 0 },
      { offset: 300 / total, transform: 'scale(1)', opacity: 1, easing: 'ease-out' },
      { offset: (300 + holdMs) / total, transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.9)', opacity: 0 },
    ],
    { duration: total, easing: reducedMotion() ? 'linear' : EASE_BOUNCE, fill: 'both' },
  );
}

/**
 * Quick side-to-side shake ("that was wrong").
 * @param el - element to shake
 * @returns the animation
 */
export function shake(el: Element): Animation {
  if (reducedMotion()) {
    return el.animate([{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }], { duration: 240 });
  }
  return el.animate(
    [0, -8, 7, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 380, easing: 'ease-out' },
  );
}

/**
 * Slams a stamp down (big → normal size, slight squash), then fades it away.
 * @param el - the stamp element
 * @returns the animation
 */
export function stamp(el: Element): Animation {
  if (reducedMotion()) return flash(el, 700);
  // Scale only: the .stamp inside already carries its -12° tilt.
  return el.animate(
    [
      { transform: 'scale(2.4)', opacity: 0 },
      { offset: 0.18, transform: 'scale(0.92)', opacity: 1, easing: 'ease-out' },
      { offset: 0.26, transform: 'scale(1)', opacity: 1 },
      { offset: 0.8, transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    { duration: 1300, fill: 'both' },
  );
}

/** Number of confetti pieces per burst (enough to feel festive, cheap on phones). */
const CONFETTI_COUNT = 36;

/**
 * Bursts suit-shaped confetti from a point; pieces fall and fade, then are removed.
 * @param origin - screen point to burst from
 * @returns nothing
 */
export function confetti(origin: { x: number; y: number }): void {
  if (reducedMotion()) return;
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const suit = SUITS[i % 4];
    const piece = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    piece.setAttribute('viewBox', '0 0 24 24');
    piece.setAttribute('class', 'confetti-piece');
    // Mostly suit colors, with some gold pieces mixed in for sparkle.
    const color = i % 5 === 0 ? 'var(--accent)' : isRedSuit(suit) ? 'var(--suit-red)' : 'var(--back-ink)';
    piece.innerHTML = `<path d="${SUIT_PATHS[suit]}" fill="${color}"/>`;
    piece.style.left = `${origin.x - 9}px`;
    piece.style.top = `${origin.y - 9}px`;
    document.body.appendChild(piece);

    // Random spread: up and out first, then gravity pulls it down past the start.
    const angle = (Math.random() * 140 + 200) * (Math.PI / 180); // 200°–340°: upward fan
    const speed = 140 + Math.random() * 180;
    const x = Math.cos(angle) * speed;
    const peak = Math.sin(angle) * speed;
    const fall = 220 + Math.random() * 200;
    const spin = (Math.random() - 0.5) * 900;
    const size = 0.6 + Math.random() * 0.7;
    const anim = piece.animate(
      [
        { transform: `translate(0, 0) rotate(0deg) scale(${size})`, opacity: 1 },
        { offset: 0.35, transform: `translate(${x * 0.7}px, ${peak}px) rotate(${spin * 0.4}deg) scale(${size})`, opacity: 1 },
        { transform: `translate(${x}px, ${peak + fall}px) rotate(${spin}deg) scale(${size})`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.25,.6,.4,1)', delay: Math.random() * 120 },
    );
    anim.onfinish = () => piece.remove();
    // Backup removal in case "finish" never fires (background tab).
    setTimeout(() => piece.remove(), 2400);
  }
}
