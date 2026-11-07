/* ==========================================================================
   Seeded random number generator
   Mulberry32: a tiny, fast PRNG whose whole state is one 32-bit integer.
   Keeping the state as a plain number lets it live inside GameState, so the
   state stays serializable (for the network) and games are reproducible.
   ========================================================================== */

/**
 * Advances the generator by one step.
 * @param seed - current 32-bit generator state
 * @returns a tuple of [random float in [0, 1), next generator state]
 */
export function nextRandom(seed: number): [number, number] {
  // 0x6D2B79F5 is Mulberry32's fixed increment (an odd "golden ratio"-style
  // constant); the shifts and multiplies below are its standard output mixer.
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  // Divide by 2^32 to map the unsigned 32-bit result into [0, 1).
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextSeed];
}

/**
 * Shuffles a copy of an array with Fisher–Yates, driven by the seeded RNG.
 * @param items - the items to shuffle (not modified)
 * @param seed - current generator state
 * @returns the shuffled copy and the generator state after shuffling
 */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const result = items.slice();
  let state = seed;
  for (let i = result.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(state);
    state = next;
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { items: result, seed: state };
}
