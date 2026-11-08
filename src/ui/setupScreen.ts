/* ==========================================================================
   Setup screen (main menu)
   Cards and chips on the felt: your name, "play the computer" (opponents as
   chips, bot strength as toggle chips), "play with friends", and the rules
   as chip toggles in a drawer.
   ========================================================================== */

import type { Difficulty } from '../bot/bot';
import { DEFAULT_RULES, makeCard, type Rules } from '../engine';
import { STRINGS } from '../i18n/strings';
import { createCardEl } from './cardView';
import { chipHtml, type ChipColor } from './theme/props';

export interface SetupChoice {
  name: string;
  botCount: number;
  difficulty: Difficulty;
  rules: Rules;
}

export interface SetupHandlers {
  /** "Start game" against bots. */
  onStart(choice: SetupChoice): void;
  /** "Create game" for friends. */
  onCreateRoom(name: string, rules: Rules): void;
}

/** Boolean rules shown as chip toggles. `requires` greys a toggle out when its parent rule is off. */
const TOGGLES: { key: keyof Rules; label: string; requires?: keyof Rules }[] = [
  { key: 'sevenDrawTwo', label: STRINGS.ruleSevenDrawTwo },
  { key: 'sevenStacking', label: STRINGS.ruleSevenStacking, requires: 'sevenDrawTwo' },
  { key: 'eightSkips', label: STRINGS.ruleEightSkips },
  { key: 'jackWild', label: STRINGS.ruleJackWild },
  { key: 'jackOnJack', label: STRINGS.ruleJackOnJack, requires: 'jackWild' },
  { key: 'playDrawnCard', label: STRINGS.rulePlayDrawnCard },
  { key: 'mauRequired', label: STRINGS.ruleMauRequired },
  { key: 'scoring', label: STRINGS.ruleScoring },
];

/** Number rules shown as a row of numbered chips. */
const NUMBERS: { key: keyof Rules; label: string; options: number[]; requires?: keyof Rules }[] = [
  // 3–7 cards: with 4 players, 7 each still leaves 3 cards to start the piles.
  { key: 'handSize', label: STRINGS.ruleHandSize, options: [3, 4, 5, 6, 7] },
  { key: 'mauPenalty', label: STRINGS.ruleMauPenalty, options: [1, 2, 3], requires: 'mauRequired' },
  { key: 'roundsPerMatch', label: STRINGS.ruleRoundsPerMatch, options: [1, 3, 5, 7, 10], requires: 'scoring' },
];

const DIFFICULTIES: [Difficulty, string][] = [
  ['easy', STRINGS.difficultyEasy],
  ['normal', STRINGS.difficultyNormal],
  ['hard', STRINGS.difficultyHard],
];

/** Chip colors for the opponents picker (1, 2, 3). */
const OPPONENT_CHIPS: ChipColor[] = ['white', 'red', 'green'];

/**
 * A radio button drawn as a chip ("1", "2", "3" opponents; numeric rules).
 * @param name - radio group name
 * @param value - value
 * @param color - chip color
 * @param checked - initially selected
 * @returns markup
 */
function chipRadio(name: string, value: string | number, color: ChipColor, checked: boolean): string {
  return `<label class="chip-radio"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} />${chipHtml(color, String(value))}</label>`;
}

/**
 * A checkbox or radio drawn as a toggle chip.
 * @param type - 'checkbox' or 'radio'
 * @param name - input name
 * @param value - input value (radios)
 * @param label - visible text
 * @param checked - initially on
 * @param color - the chip that flips in when on
 * @returns markup
 */
function toggleChip(type: 'checkbox' | 'radio', name: string, value: string, label: string, checked: boolean, color: ChipColor): string {
  return `<label class="toggle-chip"><input type="${type}" name="${name}" value="${value}" ${checked ? 'checked' : ''} /><span class="toggle-chip__dot chip chip--${color}"></span>${label}</label>`;
}

/**
 * Renders the setup screen into `root`.
 * @param root - container element (its content is replaced)
 * @param initialName - prefilled player name
 * @param handlers - what to do for each mode
 * @returns nothing
 */
export function renderSetupScreen(root: HTMLElement, initialName: string, handlers: SetupHandlers): void {
  root.innerHTML = `
    <main class="menu felt felt--rim">
      <!-- Logo -->
      <header class="menu__header">
        <h1 class="menu-logo"><span class="menu-logo__cards"></span>${STRINGS.appTitle}</h1>
        <p class="menu__tagline">${STRINGS.setupSubtitle}</p>
      </header>

      <form class="menu__form">
        <!-- Player name -->
        <label class="name-field">
          <span>${STRINGS.yourName}</span>
          <input name="name" maxlength="20" autocomplete="nickname" required />
        </label>

        <!-- Mode 1: against bots -->
        <section class="panel mode-card">
          <h2>${STRINGS.vsComputerHeading}</h2>
          <fieldset class="menu__group">
            <legend>${STRINGS.botCount}</legend>
            <div class="chip-row">${[1, 2, 3].map((n, i) => chipRadio('bots', n, OPPONENT_CHIPS[i], n === 2)).join('')}</div>
          </fieldset>
          <fieldset class="menu__group">
            <legend>${STRINGS.difficulty}</legend>
            <div class="chip-row">${DIFFICULTIES.map(([v, label]) => toggleChip('radio', 'difficulty', v, label, v === 'normal', 'navy')).join('')}</div>
          </fieldset>
          <button type="submit" class="btn btn--primary btn--big">${STRINGS.startGame}</button>
        </section>

        <!-- Mode 2: with friends over a shared link -->
        <section class="panel mode-card">
          <h2>${STRINGS.friendsHeading}</h2>
          <p>${STRINGS.friendsHint}</p>
          <button type="button" class="btn btn--big btn--navy" data-create>${STRINGS.createGame}</button>
        </section>

        <!-- Rules (shared by both modes), collapsed by default -->
        <details class="rules-drawer">
          <summary>${STRINGS.rulesHeading}</summary>
          <div class="rules-drawer__body">
            <div class="chip-row rules-drawer__toggles"></div>
            <div class="rules-drawer__numbers"></div>
          </div>
        </details>
      </form>
    </main>`;

  // Two little cards next to the title: a Bube and a back.
  const logoCards = root.querySelector('.menu-logo__cards')!;
  logoCards.append(createCardEl(makeCard('hearts', 'J')), createCardEl(null));

  const form = root.querySelector('form')!;
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  nameInput.value = initialName;

  // Rule controls are built from the TOGGLES / NUMBERS tables above.
  form.querySelector('.rules-drawer__toggles')!.innerHTML = TOGGLES.map((t) =>
    toggleChip('checkbox', t.key, 'on', t.label, DEFAULT_RULES[t.key] as boolean, 'red'),
  ).join('');
  form.querySelector('.rules-drawer__numbers')!.innerHTML = NUMBERS.map(
    (n) => `<fieldset class="menu__group" data-rule="${n.key}">
      <legend>${n.label}</legend>
      <div class="chip-row">${n.options.map((o) => chipRadio(n.key, o, 'white', o === DEFAULT_RULES[n.key])).join('')}</div>
    </fieldset>`,
  ).join('');

  /**
   * Greys out rule controls whose parent rule is switched off.
   * @returns nothing
   */
  const syncDependencies = () => {
    for (const item of [...TOGGLES, ...NUMBERS]) {
      if (!item.requires) continue;
      const parent = form.querySelector<HTMLInputElement>(`input[name="${item.requires}"]`)!;
      form.querySelectorAll<HTMLInputElement>(`input[name="${item.key}"]`).forEach((input) => {
        input.disabled = !parent.checked;
        (input.closest('.toggle-chip, .menu__group') as HTMLElement).classList.toggle('is-disabled', !parent.checked);
      });
    }
  };
  form.addEventListener('change', syncDependencies);
  syncDependencies();

  /**
   * Reads the rules from the form.
   * @returns the chosen rules
   */
  const readRules = (): Rules => {
    const rules: Rules = { ...DEFAULT_RULES };
    for (const t of TOGGLES) (rules[t.key] as boolean) = form.querySelector<HTMLInputElement>(`input[name="${t.key}"]`)!.checked;
    for (const n of NUMBERS) {
      const picked = form.querySelector<HTMLInputElement>(`input[name="${n.key}"]:checked`);
      (rules[n.key] as number) = picked ? Number(picked.value) : (DEFAULT_RULES[n.key] as number);
    }
    return rules;
  };
  const readName = () => nameInput.value.trim() || STRINGS.defaultName;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    handlers.onStart({
      name: readName(),
      botCount: Number(data.get('bots')),
      difficulty: data.get('difficulty') as Difficulty,
      rules: readRules(),
    });
  });

  form.querySelector('[data-create]')!.addEventListener('click', () => {
    if (!nameInput.reportValidity()) return;
    handlers.onCreateRoom(readName(), readRules());
  });
}
