/* ==========================================================================
   Setup screen
   Name, rules (shared by both modes), then either a game against bots
   or creating a multiplayer room.
   ========================================================================== */

import type { Difficulty } from '../bot/bot';
import { DEFAULT_RULES, type Rules } from '../engine';
import { STRINGS } from '../i18n/strings';

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

/** Boolean rules shown as checkboxes. `requires` greys a toggle out when its parent rule is off. */
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

/** Number rules shown as dropdowns. */
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

/**
 * Renders the setup screen into `root`.
 * @param root - container element (its content is replaced)
 * @param initialName - prefilled player name
 * @param handlers - what to do for each mode
 * @returns nothing
 */
export function renderSetupScreen(root: HTMLElement, initialName: string, handlers: SetupHandlers): void {
  root.innerHTML = '';
  const screen = document.createElement('main');
  screen.className = 'setup';
  screen.innerHTML = `
    <!-- Title -->
    <header class="setup__header">
      <h1>${STRINGS.appTitle}</h1>
      <p>${STRINGS.setupSubtitle}</p>
    </header>

    <form class="setup__form">
      <!-- Player name -->
      <label class="field">
        <span>${STRINGS.yourName}</span>
        <input name="name" maxlength="20" autocomplete="nickname" required />
      </label>

      <!-- Rules (collapsed by default, used by both modes) -->
      <details class="rules">
        <summary>${STRINGS.rulesHeading}</summary>
        <div class="rules__list"></div>
      </details>

      <!-- Mode 1: against bots -->
      <section class="mode">
        <h2>${STRINGS.vsComputerHeading}</h2>
        <fieldset class="field">
          <legend>${STRINGS.botCount}</legend>
          <div class="segmented">
            ${[1, 2, 3].map((n) => `<label><input type="radio" name="bots" value="${n}" ${n === 2 ? 'checked' : ''}/><span>${n}</span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="field">
          <legend>${STRINGS.difficulty}</legend>
          <div class="segmented">
            ${DIFFICULTIES.map(([v, label]) => `<label><input type="radio" name="difficulty" value="${v}" ${v === 'normal' ? 'checked' : ''}/><span>${label}</span></label>`).join('')}
          </div>
        </fieldset>
        <button type="submit" class="btn btn--primary btn--big">${STRINGS.startGame}</button>
      </section>

      <!-- Mode 2: with friends over a shared link -->
      <section class="mode">
        <h2>${STRINGS.friendsHeading}</h2>
        <p class="mode__hint">${STRINGS.friendsHint}</p>
        <button type="button" class="btn btn--big" data-create>${STRINGS.createGame}</button>
      </section>
    </form>`;
  root.appendChild(screen);

  const form = screen.querySelector('form')!;
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  nameInput.value = initialName;
  const list = form.querySelector('.rules__list')!;

  // Rule controls are built from the TOGGLES / NUMBERS tables above.
  for (const t of TOGGLES) {
    const label = document.createElement('label');
    label.className = 'rule';
    label.innerHTML = `<input type="checkbox" name="${t.key}" /><span>${t.label}</span>`;
    label.querySelector('input')!.checked = DEFAULT_RULES[t.key] as boolean;
    list.appendChild(label);
  }
  for (const n of NUMBERS) {
    const label = document.createElement('label');
    label.className = 'rule rule--number';
    label.innerHTML = `<span>${n.label}</span><select name="${n.key}">${n.options
      .map((o) => `<option value="${o}" ${o === DEFAULT_RULES[n.key] ? 'selected' : ''}>${o}</option>`)
      .join('')}</select>`;
    list.appendChild(label);
  }

  /**
   * Disables rule controls whose parent rule is switched off.
   * @returns nothing
   */
  const syncDependencies = () => {
    for (const item of [...TOGGLES, ...NUMBERS]) {
      if (!item.requires) continue;
      const parent = form.elements.namedItem(item.requires) as HTMLInputElement;
      const control = form.elements.namedItem(item.key) as HTMLInputElement | HTMLSelectElement;
      control.disabled = !parent.checked;
      control.closest('.rule')!.classList.toggle('rule--disabled', !parent.checked);
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
    for (const t of TOGGLES) (rules[t.key] as boolean) = (form.elements.namedItem(t.key) as HTMLInputElement).checked;
    for (const n of NUMBERS) (rules[n.key] as number) = Number((form.elements.namedItem(n.key) as HTMLSelectElement).value);
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
