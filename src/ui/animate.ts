/* ==========================================================================
   Animations
   "FLIP"-style moves: we measure where something WAS before re-rendering,
   then animate the new element from that old position to where it is now,
   using CSS transforms through the Web Animations API.
   ========================================================================== */

import { createCardEl } from './cardView';

/** Default flight time; short enough to keep up with the 700 ms bot delay. */
const FLY_MS = 380;
/** Smooth "ease-out" curve so cards settle gently. */
const EASING = 'cubic-bezier(.2,.8,.2,1)';

/**
 * Whether the user asked the OS for less motion.
 * @returns true if animations should be skipped
 */
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates an element from a previous screen rectangle to its current place.
 * @param el - element already in its final position
 * @param from - where it should appear to start
 * @param options - duration and delay in ms
 * @returns nothing
 */
export function flyFrom(el: HTMLElement, from: DOMRect, options: { duration?: number; delay?: number } = {}): void {
  if (reducedMotion()) return;
  const to = el.getBoundingClientRect();
  if (to.width === 0 || from.width === 0) return;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'translate(0, 0) scale(1)' }],
    {
      duration: options.duration ?? FLY_MS,
      delay: options.delay ?? 0,
      easing: EASING,
      // Hold the start position during the delay, so staggered cards don't flash in place.
      fill: 'backwards',
    },
  );
}

/**
 * Flies a temporary face-down card between two rectangles, then removes it.
 * Used for cards moving to/from opponents, whose hands aren't shown face-up.
 * @param from - start rectangle
 * @param to - end rectangle
 * @param options - delay in ms and the size of the card at the destination
 * @returns nothing
 */
export function flyGhostCard(from: DOMRect, to: DOMRect, options: { delay?: number; width: number }): void {
  if (reducedMotion()) return;
  const ghost = createCardEl(null);
  ghost.classList.add('card--ghost');
  // Place the ghost at the destination, then animate it from the start.
  const height = (options.width * 60) / 42; // Kenney card body is 42×60 px
  ghost.style.width = `${options.width}px`;
  ghost.style.left = `${to.left + to.width / 2 - options.width / 2}px`;
  ghost.style.top = `${to.top + to.height / 2 - height / 2}px`;
  document.body.appendChild(ghost);
  const anim = ghost.animate(
    [
      {
        transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${
          from.top + from.height / 2 - (to.top + to.height / 2)
        }px) scale(${from.width / options.width})`,
        opacity: 1,
      },
      { transform: 'translate(0, 0) scale(1)', opacity: 0.2 },
    ],
    { duration: FLY_MS, delay: options.delay ?? 0, easing: EASING, fill: 'both' },
  );
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
  // Backup cleanup: in background tabs no frames are drawn, so "finish" may never
  // fire. +100ms margin so the timer never cuts a visible animation short.
  setTimeout(() => ghost.remove(), FLY_MS + (options.delay ?? 0) + 100);
}

/**
 * Plays a short "pop" on an element (e.g. a seat calling Mau).
 * @param el - the element
 * @returns nothing
 */
export function pulse(el: HTMLElement): void {
  if (reducedMotion()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
    duration: 300,
    easing: 'ease-out',
  });
}
