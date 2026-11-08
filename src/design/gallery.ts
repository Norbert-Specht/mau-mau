/* ==========================================================================
   Design gallery (/design)
   A static showcase of the proposed look: table scenes in day and night,
   cards, chips, dice, avatars, controls, suit picker, menus — plus buttons
   that play each animation. It does not run the game; it only uses the
   engine's card types and the shared theme files.
   ========================================================================== */

import '../ui/theme/tokens.css';
import '../ui/theme/components.css';
import '../ui/menus.css';
import './gallery.css';
import { makeCard, type Card, type Rank, type Suit } from '../engine';
import { cardImageUrl } from '../ui/cardView';
import { animalAvatar, initialAvatar, type Animal } from '../ui/theme/avatars';
import { confetti, flash, flyArc, pop, setSimulateReducedMotion, shake, stamp } from '../ui/theme/motion';
import { CHIP_VALUES, chipHtml, chipsFor, dieHtml, type ChipColor } from '../ui/theme/props';
import { suitSvg } from '../ui/theme/suits';
import { playSound, setSoundEnabled, soundEnabled, type SoundName } from '../ui/sound';

/* ---------------------------- Small builders ---------------------------- */
/* Each returns an HTML string; the gallery is static, so strings keep it short. */

const SUIT_CODE: Record<string, Suit> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };

/**
 * Parses "7H", "10S", "JC" into a card.
 * @param code - rank + suit letter
 * @returns the card
 */
function c(code: string): Card {
  return makeCard(SUIT_CODE[code.slice(-1)], code.slice(0, -1) as Rank);
}

/**
 * A face-up card (Kenney face on the paper card) or a back.
 * @param card - card or null for a back
 * @param classes - extra classes
 * @returns markup
 */
function cardHtml(card: Card | null, classes = ''): string {
  if (!card) return `<div class="card card--back ${classes}" aria-hidden="true"></div>`;
  return `<div class="card ${classes}" role="img" aria-label="${card.id}"><div class="card__face" style="background-image:url('${cardImageUrl(card)}')"></div></div>`;
}

interface SeatOptions {
  name: string;
  animal?: Animal;
  count: number;
  active?: boolean;
  marker?: boolean;
  offline?: boolean;
}

/**
 * An opponent seat: avatar, card-count badge, name, small fan of backs.
 * @param o - seat options
 * @returns markup
 */
function seatHtml(o: SeatOptions): string {
  const avatar = o.animal ? animalAvatar(o.animal) : initialAvatar(o.name);
  const n = Math.min(o.count, 6);
  // Fan the backs a little: spread centered around 0°.
  const fan = Array.from({ length: n }, (_, i) => cardHtml(null, 'card--mini').replace('class="card', `style="--fan:${(i - (n - 1) / 2) * 6}deg" class="card`)).join('');
  return `<div class="seat ${o.active ? 'seat--active' : ''} ${o.offline ? 'seat--offline' : ''}">
    <span class="bubble-slot"><span class="bubble">Ha!</span></span>
    <span class="stamp-slot"><span class="stamp">Skip</span></span>
    <div class="avatar">${avatar}</div>
    <span class="seat__count">${o.count}</span>
    ${o.marker ? `<span class="seat__marker">${dieHtml(3)}</span>` : ''}
    <span class="seat__name">${o.name}</span>
    <div class="seat__fan">${fan}</div>
  </div>`;
}

/**
 * A fanned hand. `states` marks cards as playable / sunk / lifted.
 * @param codes - card codes
 * @param states - per-card extra classes
 * @returns markup
 */
function handHtml(codes: string[], states: string[] = []): string {
  const n = codes.length;
  const spread = Math.min(6, 36 / n); // degrees between neighbors; total ≤ 36°
  return codes
    .map((code, i) => {
      const offset = i - (n - 1) / 2;
      return `<div class="hand__slot" style="--fan:${offset * spread}deg;--drop:${offset * offset * 1.6}px">${cardHtml(c(code), `card--interactive ${states[i] ?? ''}`)}</div>`;
    })
    .join('');
}

/**
 * A messy discard pile: each card at a small random rotation (±3°).
 * @param codes - cards bottom to top
 * @returns markup
 */
function discardHtml(codes: string[]): string {
  return codes
    .map((code) => `<div class="pile__slot" style="--rot:${(Math.random() * 6 - 3).toFixed(1)}deg">${cardHtml(c(code))}</div>`)
    .join('');
}

/**
 * The draw pile: three backs and a count.
 * @param count - cards left
 * @returns markup
 */
function drawPileHtml(count: number): string {
  return `${cardHtml(null)}${cardHtml(null)}${cardHtml(null)}<span class="pile__count">${count}</span>`;
}

/* ---------------------------- Sections ---------------------------- */

/**
 * Header with theme and reduced-motion switches.
 * @returns markup
 */
function headerSection(): string {
  return `<header class="g-header">
    <h1>Mau-Mau · Design</h1>
    <p>Proposal for the new look: a slate-teal felt table seen from slightly above, paper cards with soft shadows,
      casino chips and a die as props, and playful motion. Everything below uses the real design tokens and components.</p>
    <div class="g-controls">
      <label class="toggle-chip"><input type="radio" name="theme" value="auto" checked />${chipHtml('white')}Auto</label>
      <label class="toggle-chip"><input type="radio" name="theme" value="light" />${chipHtml('red')}Day table</label>
      <label class="toggle-chip"><input type="radio" name="theme" value="dark" />${chipHtml('navy')}Night table</label>
      <label class="toggle-chip"><input type="checkbox" name="reduced" />${chipHtml('green')}Preview reduced motion</label>
    </div>
  </header>`;
}

/** Token names shown as swatches in the proposal. */
const SWATCHES: [string, string][] = [
  ['--felt', 'Felt'],
  ['--felt-deep', 'Felt shadow'],
  ['--card-face', 'Card paper'],
  ['--suit-red', 'Suit red'],
  ['--suit-black', 'Suit black'],
  ['--back-ink', 'Seigaiha navy'],
  ['--chip-red', 'Chip red'],
  ['--chip-green', 'Chip green'],
  ['--chip-navy', 'Chip navy'],
  ['--die', 'Die'],
  ['--accent', 'Turn gold'],
  ['--mau', 'Mau! gold'],
  ['--wood-light', 'Wood'],
  ['--danger', 'Penalty'],
];

/**
 * The written proposal: palette, type, components, motion.
 * @returns markup
 */
function proposalSection(): string {
  return `<section class="g-section">
    <h2>The proposal</h2>
    <p class="g-lead">Palette sampled from your reference. Swatches update with the theme switch above.</p>
    <div class="panel g-proposal">
      <div>
        <h3>Palette</h3>
        <div class="swatches">${SWATCHES.map(([v, label]) => `<div class="swatch"><span class="swatch__chip" style="background:var(${v})"></span><b>${label}</b><code data-token="${v}"></code></div>`).join('')}</div>
      </div>
      <div class="type-specimen">
        <h3>Type</h3>
        <span class="display">Mau-Mau! Ich wünsche mir…</span>
        <span><b>Fredoka</b> (rounded display) for headings, names, buttons and big calls.
        <b>Nunito</b> for small text. Both from Google Fonts; system fonts take over offline.</span>
      </div>
      <div>
        <h3>Components</h3>
        <ul>
          <li>Felt table with fabric grain, vignette and a wooden rim; night table adds a warm lamp glow</li>
          <li>Paper cards (Kenney faces cropped onto off-white, rounded, layered shadows), seigaiha back, messy discard pile (±3°)</li>
          <li>Casino chips (scores, 7-penalty stack), red die as turn marker</li>
          <li>Seats: round avatars (animals for bots, initials for people), card-count badge, fan of backs, gold glow when active</li>
          <li>Speech bubbles (bot reactions, Mau!) — no toasts or turn history (decided)</li>
          <li>No playing hints: your cards only lift and tilt on hover; nothing shows whether they fit</li>
          <li>Tactile buttons, big round Mau! token, rule toggles as chips, share link as a ticket</li>
          <li>Suit picker as four tokens fanning out; wished suit as a big badge next to the pile</li>
          <li>Skip stamp, shake for the Mau penalty, suit-shaped confetti, end-of-round screen with score chips</li>
        </ul>
      </div>
      <div>
        <h3>Motion</h3>
        <ul>
          <li>Only <code>transform</code> and <code>opacity</code> are animated (smooth on phones)</li>
          <li>Card flights use FLIP along an arc (lift ${'--arc-lift'}), ~520 ms, landing with a tiny bounce</li>
          <li>Deal staggers 70 ms per card; pops and badges overshoot slightly</li>
          <li>Reduced motion: flights and bounces become 160 ms fades, no looping pulses</li>
          <li>Sounds: swish, chip clack, stamp, Mau call, win jingle — Web Audio, off until switched on</li>
        </ul>
      </div>
    </div>
  </section>`;
}

/**
 * One complete table scene (phone-sized).
 * @param theme - force 'light' or 'dark'
 * @returns markup
 */
function sceneHtml(theme: 'light' | 'dark'): string {
  return `<div class="scene felt felt--rim" data-theme="${theme}">
    <span class="scene__tag">${theme === 'light' ? 'Day table' : 'Night table'}</span>
    <div class="scene__opponents">
      ${seatHtml({ name: 'Anna', animal: 'fox', count: 4 })}
      ${seatHtml({ name: 'Jonas', animal: 'bear', count: 2, active: true, marker: true })}
      ${seatHtml({ name: 'Mia', count: 6, offline: theme === 'dark' })}
    </div>
    <div class="scene__center">
      <div class="pile pile--draw">${drawPileHtml(14)}</div>
      <div class="pile pile--discard">${discardHtml(['9H', 'KH', theme === 'light' ? 'JS' : '7C'])}</div>
      <div class="scene__side">
        ${
          theme === 'light'
            ? `<div class="suit-badge"><span class="suit-badge__disc">${suitSvg('hearts')}</span>Ich wünsche mir</div>`
            : `<div class="penalty"><span class="chip-stack">${[0, 1, 2, 3].map((i) => chipHtml('red', i === 3 ? '+4' : '', i)).join('')}</span><span class="penalty__label">draw 4</span></div>`
        }
      </div>
    </div>
    <span class="scene__mau-bubble bubble bubble--big">Mau!</span>
    <div class="scene__mau"><button class="mau-btn" type="button">Mau!</button></div>
    <div class="hand">${handHtml(['7H', 'QH', '8D', 'AH', '10C', 'KS'], ['', '', '', 'card--lifted'])}</div>
  </div>`;
}

/**
 * Day and night tables side by side.
 * @returns markup
 */
function tablesSection(): string {
  return `<section class="g-section">
    <h2>The table — day &amp; night</h2>
    <p class="g-lead">Phone portrait. Opponents across the top (Jonas is active: gold glow + die marker), piles in the middle,
      your hand fanned at the bottom, Mau! within thumb reach. Hover your cards. Day shows a wished suit; night shows a 7-penalty stack and an offline player.</p>
    <div class="scenes">${sceneHtml('light')}${sceneHtml('dark')}</div>
  </section>`;
}

/**
 * Cards: faces, back, and the hover/playable/sunk states.
 * @returns markup
 */
function cardsSection(): string {
  const faces = ['7H', '8D', '9C', '10S', 'JH', 'QD', 'KC', 'AS'];
  return `<section class="g-section">
    <h2>Cards</h2>
    <p class="g-lead">Kenney faces, cropped to their pips and laid on a warm off-white card with rounded corners and layered shadows.
      The seigaiha back is an SVG. Hover any card in the "states" row.</p>
    <div class="g-row">${faces.map((f) => `<div class="g-item">${cardHtml(c(f))}<span class="g-caption">${f}</span></div>`).join('')}
      <div class="g-item">${cardHtml(null)}<span class="g-caption">Back</span></div></div>
    <div class="g-row" style="margin-top:var(--space-6)">
      <div class="g-item">${cardHtml(c('QH'), 'card--interactive')}<span class="g-caption">Normal (hover me)</span></div>
      <div class="g-item">${cardHtml(c('QH'), 'card--lifted')}<span class="g-caption">Lifted + tilted</span></div>
      <div class="g-item"><div class="pile pile--discard">${discardHtml(['8H', 'QH', 'QS', 'QD'])}</div><span class="g-caption">Messy pile (±3°)</span></div>
    </div>
  </section>`;
}

/**
 * Chips, dice, penalty stack demo and the sliding turn marker.
 * @returns markup
 */
function propsSection(): string {
  return `<section class="g-section">
    <h2>Chips &amp; dice</h2>
    <p class="g-lead">Chips show scores and 7-penalties; a die marks whose turn it is and slides to the next player.</p>
    <div class="g-row">
      ${CHIP_VALUES.slice()
        .reverse()
        .map(([v, col]) => `<div class="g-item">${chipHtml(col, String(v))}<span class="g-caption">${v}</span></div>`)
        .join('')}
      ${[1, 2, 3, 4, 5, 6].map((n) => `<div class="g-item">${dieHtml(n)}<span class="g-caption">${n}</span></div>`).join('')}
    </div>
    <div class="g-row" style="margin-top:var(--space-6)">
      <div class="demo-felt felt" style="min-width:240px">
        <div class="penalty" id="penalty-demo">
          <span class="penalty__bubble bubble">+2</span>
          <span class="chip-stack" id="penalty-stack"></span>
          <span class="penalty__label" id="penalty-label">no penalty</span>
        </div>
        <div class="g-demo-buttons"><button class="btn btn--primary" data-demo="seven">Play a 7</button><button class="btn" data-demo="seven-reset">Draw (reset)</button></div>
      </div>
      <div class="demo-felt felt" style="flex:1;min-width:300px">
        <div class="turn-track" id="turn-track">
          ${['Du', 'Anna', 'Jonas', 'Lena']
            .map((name, i) => `<div class="seat ${i === 0 ? 'seat--active' : ''}" data-seat="${i}"><div class="avatar">${i === 0 ? initialAvatar('Du') : animalAvatar((['fox', 'bear', 'frog'] as Animal[])[i - 1])}</div><span class="seat__name">${name}</span>${i === 0 ? `<span class="seat__marker" id="turn-marker">${dieHtml(5)}</span>` : ''}</div>`)
            .join('')}
        </div>
        <div class="g-demo-buttons"><button class="btn btn--primary" data-demo="next-turn">Next turn</button></div>
      </div>
    </div>
  </section>`;
}

/**
 * Avatars, reaction bubbles, skip stamp, Mau penalty shake.
 * @returns markup
 */
function playersSection(): string {
  const animals: Animal[] = ['fox', 'bear', 'frog', 'cat'];
  return `<section class="g-section">
    <h2>Players</h2>
    <p class="g-lead">Bots get animal faces, people get their initial. Try the reactions, the skip stamp and the forgotten-Mau penalty.</p>
    <div class="demo-felt felt">
      <div class="g-row" id="players-row" style="justify-content:space-around">
        ${animals.map((a, i) => seatHtml({ name: ['Anna', 'Jonas', 'Lena', 'Kater Karl'][i], animal: a, count: [5, 3, 1, 7][i] })).join('')}
        ${seatHtml({ name: 'Sophie', count: 4 })}
      </div>
      <div class="g-demo-buttons">
        <button class="btn" data-demo="react" data-text="Ha!">“Ha!”</button>
        <button class="btn" data-demo="react" data-text="Oh nein…">“Oh nein…”</button>
        <button class="btn" data-demo="react" data-text="Mau!">“Mau!”</button>
        <button class="btn" data-demo="skip">8 → Skip stamp</button>
      </div>
    </div>
    <div class="demo-felt felt" style="margin-top:var(--space-4)">
      <div style="display:grid;justify-items:center;gap:var(--space-3)">
        <div class="seat" id="cheeky-seat"><span class="bubble-slot"><span class="bubble">Mau vergessen! 😜</span></span><div class="avatar">${animalAvatar('fox')}</div><span class="seat__name">Anna</span></div>
        <div class="hand" id="penalty-hand" style="min-height:0;padding:var(--space-3)">${handHtml(['9S', 'KD'])}</div>
      </div>
      <div class="g-demo-buttons" style="justify-content:center"><button class="btn btn--primary" data-demo="forgot-mau">Forget to say Mau</button></div>
    </div>
  </section>`;
}

/**
 * Buttons, toggles, the Mau button and the share ticket.
 * @returns markup
 */
function controlsSection(): string {
  return `<section class="g-section">
    <h2>Controls</h2>
    <p class="g-lead">Buttons press down like physical keys. Rule toggles are chips that flip in when on. The share link is a ticket.</p>
    <div class="demo-felt felt">
      <div class="g-row" style="align-items:center">
        <button class="btn btn--primary btn--big">Start game</button>
        <button class="btn">Draw</button>
        <button class="btn btn--ghost">Leave</button>
        <button class="btn" disabled>Disabled</button>
      </div>
      <div class="chip-row" style="margin-top:var(--space-5)">
        ${[
          ['7: next player draws 2', true],
          ['Stack 7s', true],
          ['8 skips', true],
          ['Bube is wild', true],
          ['Bube on Bube', false],
          ['Must say “Mau”', false],
          ['Keep score', false],
        ]
          .map(([label, on]) => `<label class="toggle-chip"><input type="checkbox" ${on ? 'checked' : ''} /><span class="toggle-chip__dot chip chip--red"></span>${label}</label>`)
          .join('')}
      </div>
      <div class="g-row" style="margin-top:var(--space-6);align-items:center">
        <div class="g-item"><button class="mau-btn" type="button" data-demo="mau">Mau!</button><span class="g-caption">Idle (press me)</span></div>
        <div class="g-item"><button class="mau-btn mau-btn--pressed" type="button">Mau!</button><span class="g-caption">Called</span></div>
        <div class="g-item" style="position:relative"><span class="bubble bubble--big" id="mau-call-bubble" style="opacity:0">Mau!</span><span class="g-caption">Speech bubble above your hand</span></div>
      </div>
      <div class="g-row" style="margin-top:var(--space-6);align-items:center">
        <div class="ticket">
          <div class="ticket__main"><span class="ticket__label">Admit friends · Mau-Mau</span><span class="ticket__link">mau-mau-three.vercel.app/#room=k3m9xq2a</span></div>
          <button class="ticket__stub" type="button" data-demo="copy">Copy</button>
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * Suit picker demo with the wished-suit badge.
 * @returns markup
 */
function pickerSection(): string {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const angles = [-60, -20, 20, 60]; // spots on the arc, degrees from vertical
  return `<section class="g-section">
    <h2>Suit picker</h2>
    <p class="g-lead">After a Bube, four suit tokens fan out of the card. The chosen suit becomes a big badge next to the pile until it changes.</p>
    <div class="demo-felt felt">
      <div class="picker-demo">
        <div class="suit-picker" id="suit-picker">
          ${suits.map((s, i) => `<button class="suit-token" type="button" data-suit="${s}" style="--angle:${angles[i]}deg;transition-delay:${i * 45}ms">${suitSvg(s)}</button>`).join('')}
          <span class="suit-picker__title" id="picker-title" style="opacity:0">Ich wünsche mir…</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-4)">
          <div class="pile pile--discard">${discardHtml(['10H', 'JS'])}</div>
          <div class="suit-badge" id="wish-badge"><span class="suit-badge__disc">${suitSvg('hearts')}</span>Ich wünsche mir</div>
        </div>
      </div>
      <div class="g-demo-buttons" style="justify-content:center"><button class="btn btn--primary" data-demo="picker">Play a Bube</button></div>
    </div>
  </section>`;
}

/**
 * Motion demos: deal, play, Mau-Mau.
 * @returns markup
 */
function motionSection(): string {
  return `<section class="g-section">
    <h2>Motion</h2>
    <p class="g-lead">Deal: cards arc from the pile with a stagger. Play: the card lifts, travels on an arc, lands with a small bounce at a random tilt.
      Mau-Mau!: suit confetti and the end-of-round screen. Switch on “Preview reduced motion” to see the fade fallback.</p>
    <div class="scene felt felt--rim" id="motion-scene" style="min-height:560px">
      <div class="scene__opponents" id="motion-seats">
        ${seatHtml({ name: 'Anna', animal: 'fox', count: 5 })}
        ${seatHtml({ name: 'Jonas', animal: 'bear', count: 5 })}
        ${seatHtml({ name: 'Lena', animal: 'frog', count: 5 })}
      </div>
      <div class="scene__center">
        <div class="pile pile--draw" id="motion-draw">${drawPileHtml(12)}</div>
        <div class="pile pile--discard" id="motion-discard">${discardHtml(['8H'])}</div>
      </div>
      <div class="hand" id="motion-hand">${handHtml(['9H', 'QH', '8S', 'KH', '10D'])}</div>
    </div>
    <div class="g-demo-buttons" style="justify-content:center">
      <button class="btn btn--primary" data-demo="deal">Deal</button>
      <button class="btn btn--primary" data-demo="play">Play a card</button>
      <button class="btn btn--primary" data-demo="win">Mau-Mau!</button>
    </div>
    <div class="overlay" id="end-overlay" hidden>
      <div class="panel end-panel" id="end-panel">
        <div class="display">Mau-Mau!</div>
        <p>You win the round</p>
        ${[
          ['Du', null, 0, true],
          ['Lena', 'frog', 7, false],
          ['Anna', 'fox', 31, false],
          ['Jonas', 'bear', 126, false],
        ]
          .map(([name, animal, pts, win]) => `<div class="score-row ${win ? 'score-row--winner' : ''}"><div class="avatar">${animal ? animalAvatar(animal as Animal) : initialAvatar(name as string)}</div><span class="score-row__name">${name}</span><span class="score-row__points"><span class="chips-inline">${chipsFor(pts as number)}</span>${pts}</span></div>`)
          .join('')}
        <div class="g-demo-buttons" style="justify-content:center"><button class="btn btn--primary" data-demo="close-end">Next round</button></div>
      </div>
    </div>
  </section>`;
}

/**
 * Menu screens: start screen and lobby, as cards and chips on the felt.
 * @returns markup
 */
function menusSection(): string {
  return `<section class="g-section">
    <h2>Menus</h2>
    <p class="g-lead">Start screen and lobby on the same felt: big tappable buttons, chips as choices, the share link as a ticket.</p>
    <div class="menu-preview">
      <div class="menu-screen felt felt--rim">
        <div class="menu-logo">${cardHtml(c('JH'))}Mau-Mau</div>
        <label class="name-field">Your name<input value="Sophie" /></label>
        <div class="panel mode-card">
          <h3>Play the computer</h3>
          <p>Opponents</p>
          <div class="chip-row">${['1', '2', '3'].map((n, i) => `<label class="chip-radio"><input type="radio" name="opp-demo" value="${n}" ${i === 1 ? 'checked' : ''} />${chipHtml((['white', 'red', 'green'] as ChipColor[])[i], n)}</label>`).join('')}</div>
          <p>Bot strength</p>
          <div class="chip-row">${['Easy', 'Normal', 'Hard'].map((d, i) => `<label class="toggle-chip"><input type="radio" name="strength-demo" ${i === 1 ? 'checked' : ''}/><span class="toggle-chip__dot chip chip--navy"></span>${d}</label>`).join('')}</div>
          <button class="btn btn--primary btn--big">Start game</button>
        </div>
        <div class="panel mode-card">
          <h3>Play with friends</h3>
          <p>Share a link — no accounts. Add bots to fill seats.</p>
          <button class="btn btn--big" style="--btn-bg:var(--chip-navy);--btn-ink:#fff">Create game</button>
        </div>
      </div>
      <div class="menu-screen felt felt--rim">
        <div class="menu-logo">Game room</div>
        <div class="ticket">
          <div class="ticket__main"><span class="ticket__label">Admit friends · Mau-Mau</span><span class="ticket__link">mau-mau-three.vercel.app/#room=k3m9xq2a</span></div>
          <button class="ticket__stub" type="button">Copy</button>
        </div>
        <div class="seat-list">
          <div class="seat-line"><div class="avatar">${initialAvatar('Sophie')}</div>Sophie<small>Host · you</small></div>
          <div class="seat-line"><div class="avatar">${initialAvatar('Ben')}</div>Ben<small>joined</small></div>
          <div class="seat-line"><div class="avatar">${animalAvatar('fox')}</div>Anna<small>Bot · Normal</small></div>
          <div class="seat-line" style="opacity:.55;border:1.5px dashed rgba(255,255,255,.35);background:none">+ Add bot</div>
        </div>
        <button class="btn btn--primary btn--big">Start game</button>
        <button class="btn btn--ghost">Leave</button>
      </div>
    </div>
  </section>`;
}

/**
 * Sound effects demo (Web Audio, off until switched on).
 * @returns markup
 */
function soundsSection(): string {
  const sounds: [SoundName, string][] = [
    ['swish', 'Card swish'],
    ['clack', 'Chip clack'],
    ['stamp', 'Stamp'],
    ['mau', 'Mau!'],
    ['win', 'Mau-Mau! jingle'],
  ];
  return `<section class="g-section">
    <h2>Sounds</h2>
    <p class="g-lead">Generated with the Web Audio API — no files. Off by default and silent until you switch them on (browsers block audio before a tap anyway).</p>
    <div class="demo-felt felt">
      <label class="toggle-chip"><input type="checkbox" id="sound-toggle" ${soundEnabled() ? 'checked' : ''} />${chipHtml('green')}Sound on</label>
      <div class="g-demo-buttons">${sounds.map(([name, label]) => `<button class="btn" data-sound="${name}">${label}</button>`).join('')}</div>
    </div>
  </section>`;
}

/* ---------------------------- Render ---------------------------- */

const root = document.querySelector<HTMLElement>('#gallery')!;
root.innerHTML = `<div class="page felt"><div class="page__inner">
  ${headerSection()}
  ${proposalSection()}
  ${tablesSection()}
  ${cardsSection()}
  ${propsSection()}
  ${playersSection()}
  ${controlsSection()}
  ${pickerSection()}
  ${motionSection()}
  ${menusSection()}
  ${soundsSection()}
</div></div>`;

/**
 * Writes each swatch's current value under it (changes with the theme).
 * @returns nothing
 */
function refreshSwatchValues(): void {
  root.querySelectorAll<HTMLElement>('[data-token]').forEach((el) => {
    el.textContent = getComputedStyle(el).getPropertyValue(el.dataset.token!).trim();
  });
}
refreshSwatchValues();
// "Auto" follows the system theme, which can change while the page is open.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshSwatchValues);

/* ---------------------------- Controls: theme + reduced motion ---------------------------- */

root.querySelector('.g-controls')!.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.name === 'theme') {
    if (input.value === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = input.value;
    refreshSwatchValues();
  } else if (input.name === 'reduced') {
    setSimulateReducedMotion(input.checked);
  }
});

/* ---------------------------- Demos ---------------------------- */

let penalty = 0;
let turn = 0;

/**
 * Re-renders the penalty chip stack (one chip per card to draw).
 * @returns the newly added chips
 */
function renderPenalty(): Element[] {
  const stack = root.querySelector('#penalty-stack')!;
  const before = stack.children.length;
  stack.innerHTML = Array.from({ length: penalty }, (_, i) => chipHtml('red', i === penalty - 1 ? `+${penalty}` : '', i)).join('');
  root.querySelector('#penalty-label')!.textContent = penalty ? `next player draws ${penalty}` : 'no penalty';
  return Array.from(stack.children).slice(before);
}

/**
 * Moves the die marker to the next seat with an arc.
 * @returns nothing
 */
function nextTurn(): void {
  const seats = root.querySelectorAll<HTMLElement>('#turn-track .seat');
  const marker = root.querySelector<HTMLElement>('#turn-marker')!;
  const from = marker.getBoundingClientRect();
  seats[turn].classList.remove('seat--active');
  turn = (turn + 1) % seats.length;
  seats[turn].classList.add('seat--active');
  seats[turn].appendChild(marker);
  flyArc(marker, from, { fromRotate: -90, duration: 480 });
}

/**
 * Pops a reaction bubble above every seat in the players row.
 * @param text - what they say
 * @returns nothing
 */
function react(text: string): void {
  root.querySelectorAll<HTMLElement>('#players-row .seat .bubble-slot').forEach((slot, i) => {
    slot.querySelector('.bubble')!.textContent = text;
    setTimeout(() => flash(slot, 900), i * 120);
  });
}

/**
 * Opens the suit picker (tokens fan out; a click on one is handled below).
 * @returns nothing
 */
function openPicker(): void {
  const picker = root.querySelector<HTMLElement>('#suit-picker')!;
  picker.classList.add('suit-picker--open');
  const title = root.querySelector<HTMLElement>('#picker-title')!;
  title.style.opacity = '1';
  pop(title, 200);
}

/**
 * Deals five cards to everyone: backs arc to each seat, faces arc into your hand.
 * @returns nothing
 */
function deal(): void {
  const pile = root.querySelector<HTMLElement>('#motion-draw')!.getBoundingClientRect();
  const seats = Array.from(root.querySelectorAll<HTMLElement>('#motion-seats .seat__fan'));
  const hand = root.querySelector<HTMLElement>('#motion-hand')!;
  const stagger = 70;
  // Re-render so every card starts fresh, then fly each from the pile.
  seats.forEach((fan) => (fan.innerHTML = Array.from({ length: 5 }, (_, i) => cardHtml(null, 'card--mini').replace('class="card', `style="--fan:${(i - 2) * 6}deg" class="card`)).join('')));
  hand.innerHTML = handHtml(['9H', 'QH', '8S', 'KH', '10D']);
  const players = seats.length + 1;
  for (let round = 0; round < 5; round++) {
    seats.forEach((fan, s) => {
      const card = fan.children[round] as HTMLElement;
      flyArc(card, pile, { delay: (round * players + s) * stagger, duration: 460 });
    });
    const mine = hand.children[round].firstElementChild as HTMLElement;
    flyArc(mine, pile, { delay: (round * players + seats.length) * stagger, duration: 520 });
  }
}

/**
 * Plays the rightmost card of your hand onto the discard pile.
 * @returns nothing
 */
function playCard(): void {
  const hand = root.querySelector<HTMLElement>('#motion-hand')!;
  const slot = hand.lastElementChild as HTMLElement | null;
  if (!slot) return;
  const card = slot.firstElementChild as HTMLElement;
  const from = card.getBoundingClientRect();
  const angle = parseFloat(slot.style.getPropertyValue('--fan')) || 0;
  // Remember the other cards' spots so they can slide together (FLIP).
  const others = Array.from(hand.children).slice(0, -1) as HTMLElement[];
  const before = others.map((o) => o.getBoundingClientRect());

  const discard = root.querySelector<HTMLElement>('#motion-discard')!;
  const landed = document.createElement('div');
  landed.className = 'pile__slot';
  landed.style.setProperty('--rot', `${(Math.random() * 6 - 3).toFixed(1)}deg`);
  landed.appendChild(card);
  card.classList.remove('card--interactive');
  discard.appendChild(landed);
  slot.remove();
  flyArc(card, from, { fromRotate: angle });

  // Re-fan the remaining cards and slide them into place.
  const n = others.length;
  const spread = Math.min(6, 36 / Math.max(n, 1));
  others.forEach((o, i) => {
    const offset = i - (n - 1) / 2;
    o.style.setProperty('--fan', `${offset * spread}deg`);
    o.style.setProperty('--drop', `${offset * offset * 1.6}px`);
  });
  others.forEach((o, i) => {
    const now = o.getBoundingClientRect();
    o.firstElementChild!.animate(
      [{ transform: `translate(${before[i].left - now.left}px, ${before[i].top - now.top}px)` }, { transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  });
}

/**
 * Mau-Mau!: confetti from the discard pile, then the end-of-round screen.
 * @returns nothing
 */
function win(): void {
  const pile = root.querySelector<HTMLElement>('#motion-discard')!.getBoundingClientRect();
  confetti({ x: pile.left + pile.width / 2, y: pile.top + pile.height / 2 });
  setTimeout(() => {
    const overlay = root.querySelector<HTMLElement>('#end-overlay')!;
    overlay.hidden = false;
    pop(root.querySelector('#end-panel')!);
    root.querySelectorAll('#end-panel .chips-inline .chip').forEach((chip, i) => pop(chip, 250 + i * 60));
  }, 700);
}

root.querySelector('#sound-toggle')!.addEventListener('change', (e) => setSoundEnabled((e.target as HTMLInputElement).checked));

root.addEventListener('click', (e) => {
  const soundBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-sound]');
  if (soundBtn) {
    playSound(soundBtn.dataset.sound as SoundName);
    return;
  }
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-demo], .suit-picker--open .suit-token');
  if (!target) return;

  // A chosen suit in the open picker.
  if (target.classList.contains('suit-token')) {
    const suit = target.dataset.suit as Suit;
    root.querySelector('#suit-picker')!.classList.remove('suit-picker--open');
    (root.querySelector('#picker-title') as HTMLElement).style.opacity = '0';
    const badge = root.querySelector<HTMLElement>('#wish-badge .suit-badge__disc')!;
    badge.innerHTML = suitSvg(suit);
    pop(badge);
    return;
  }

  switch (target.dataset.demo) {
    case 'seven': {
      penalty += 2;
      const added = renderPenalty();
      added.forEach((chip, i) => pop(chip, i * 90));
      const bubble = root.querySelector<HTMLElement>('#penalty-demo .penalty__bubble')!;
      bubble.textContent = '+2';
      flash(bubble, 700);
      break;
    }
    case 'seven-reset':
      penalty = 0;
      renderPenalty();
      break;
    case 'next-turn':
      nextTurn();
      break;
    case 'react':
      react(target.dataset.text!);
      break;
    case 'skip': {
      const seat = root.querySelectorAll<HTMLElement>('#players-row .seat')[1];
      stamp(seat.querySelector('.stamp-slot')!);
      shake(seat.querySelector('.avatar')!);
      break;
    }
    case 'forgot-mau': {
      shake(root.querySelector('#penalty-hand')!);
      flash(root.querySelector('#cheeky-seat .bubble-slot')!, 1300);
      break;
    }
    case 'mau': {
      target.classList.add('mau-btn--pressed');
      flash(root.querySelector('#mau-call-bubble')!, 1000).finished.then(() => target.classList.remove('mau-btn--pressed'));
      break;
    }
    case 'copy':
      target.textContent = 'Copied!';
      pop(target);
      setTimeout(() => (target.textContent = 'Copy'), 1400);
      break;
    case 'picker':
      openPicker();
      break;
    case 'deal':
      deal();
      break;
    case 'play':
      playCard();
      break;
    case 'win':
      win();
      break;
    case 'close-end':
      root.querySelector<HTMLElement>('#end-overlay')!.hidden = true;
      break;
  }
});

// The Mau! button in the day scene shows its speech bubble when pressed too.
root.querySelectorAll<HTMLElement>('.scene .mau-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    const bubble = btn.closest('.scene')!.querySelector<HTMLElement>('.scene__mau-bubble');
    if (bubble) flash(bubble, 900);
  }),
);
