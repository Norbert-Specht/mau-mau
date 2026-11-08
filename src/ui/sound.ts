/* ==========================================================================
   Sound effects, generated with the Web Audio API (no audio files).
   - Off by default; the player's choice is remembered in localStorage.
   - Nothing plays before the player has interacted with the page:
     browsers only allow an AudioContext to start after a tap or click,
     so the context is created/resumed from a user gesture.
   ========================================================================== */

export type SoundName = 'swish' | 'clack' | 'stamp' | 'mau' | 'win';

const STORAGE_KEY = 'mau-mau.sound';
/** Overall volume; individual sounds are mixed relative to this. */
const MASTER_VOLUME = 0.55;

let enabled = readPreference();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/**
 * Reads the saved on/off choice (off if unknown or storage is blocked).
 * @returns true if sound was switched on before
 */
function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Is sound switched on?
 * @returns true when sounds play
 */
export function soundEnabled(): boolean {
  return enabled;
}

/**
 * Switches sound on or off. Call this from a click handler: switching on
 * also starts the audio engine, which browsers only allow after a gesture.
 * @param on - true to enable sounds
 * @returns nothing
 */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered, but still works for this visit.
  }
  if (on) startAudio();
}

/**
 * Creates or resumes the AudioContext (only works during a user gesture).
 * @returns nothing
 */
function startAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
    // One second of white noise, reused by every swish/clack.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

// If sound was left on last time, start the engine on the first tap/click
// (never before — no autoplay).
document.addEventListener('pointerdown', () => enabled && startAudio(), { capture: true });

/**
 * Plays one sound effect (if sound is on and the engine is running).
 * @param name - which sound
 * @param delayMs - start delay, e.g. to match a card landing
 * @returns nothing
 */
export function playSound(name: SoundName, delayMs = 0): void {
  if (!enabled || !ctx || !master || !noise || ctx.state !== 'running') return;
  const t = ctx.currentTime + delayMs / 1000;
  switch (name) {
    case 'swish':
      noiseBurst(t, { filter: 'bandpass', from: 2400, to: 700, q: 0.9, peak: 0.5, length: 0.16 });
      break;
    case 'clack':
      // Two quick clicks: chips knocking together.
      noiseBurst(t, { filter: 'highpass', from: 2600, to: 2600, q: 0.7, peak: 0.45, length: 0.035 });
      tone(t, 'sine', 3100, 2900, 0.12, 0.04);
      noiseBurst(t + 0.055, { filter: 'highpass', from: 2400, to: 2400, q: 0.7, peak: 0.35, length: 0.03 });
      break;
    case 'stamp':
      // Low thump plus a short papery slap.
      tone(t, 'sine', 140, 55, 0.7, 0.18);
      noiseBurst(t, { filter: 'lowpass', from: 900, to: 300, q: 0.7, peak: 0.4, length: 0.08 });
      break;
    case 'mau':
      // Cheerful two-note call: "Mau!"
      tone(t, 'triangle', 523, 659, 0.32, 0.14); // C5 → E5
      tone(t + 0.13, 'triangle', 659, 784, 0.32, 0.2); // E5 → G5
      break;
    case 'win':
      // Rising arpeggio: C5 E5 G5 C6.
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, 'triangle', f, f, 0.28, i === 3 ? 0.4 : 0.14));
      break;
  }
}

/**
 * A short filtered noise burst (card swish, chip click, slap).
 * @param t - start time (AudioContext seconds)
 * @param o - filter type, start/end frequency (Hz), Q, peak gain, length (s)
 * @returns nothing
 */
function noiseBurst(
  t: number,
  o: { filter: BiquadFilterType; from: number; to: number; q: number; peak: number; length: number },
): void {
  const src = ctx!.createBufferSource();
  src.buffer = noise;
  const filter = ctx!.createBiquadFilter();
  filter.type = o.filter;
  filter.Q.value = o.q;
  filter.frequency.setValueAtTime(o.from, t);
  filter.frequency.exponentialRampToValueAtTime(o.to, t + o.length);
  const gain = envelope(t, o.peak, o.length);
  src.connect(filter).connect(gain).connect(master!);
  src.start(t, Math.random() * 0.5); // random offset so repeated swishes differ
  src.stop(t + o.length + 0.02);
}

/**
 * A short pitched tone with a glide.
 * @param t - start time (AudioContext seconds)
 * @param type - oscillator shape
 * @param from - start frequency (Hz)
 * @param to - end frequency (Hz)
 * @param peak - peak gain
 * @param length - duration (s)
 * @returns nothing
 */
function tone(t: number, type: OscillatorType, from: number, to: number, peak: number, length: number): void {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length * 0.8);
  const gain = envelope(t, peak, length);
  osc.connect(gain).connect(master!);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/**
 * Fast attack, smooth decay — avoids clicks at the start and end.
 * @param t - start time
 * @param peak - peak gain
 * @param length - total length (s)
 * @returns the gain node to route through
 */
function envelope(t: number, peak: number, length: number): GainNode {
  const gain = ctx!.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, length / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}
