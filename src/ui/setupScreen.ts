/* ==========================================================================
   Setup screen
   Name, number of bots, bot strength, and the rules settings.
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

/**
 * Renders the setup screen into `root`.
 * @param root - container element (its content is replaced)
 * @param initialName - prefilled player name
 * @param onStart - called with the player's choices when they press Start
 * @returns nothing
 */
export function renderSetupScreen(root: HTMLElement, initialName: string, onStart: (choice: SetupChoice) => void): void {
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

      <!-- Number of bots -->
      <fieldset class="field">
        <legend>${STRINGS.botCount}</legend>
        <div class="segmented">
          ${[1, 2, 3].map((n) => `<label><input type="radio" name="bots" value="${n}" ${n === 2 ? 'checked' : ''}/><span>${n}</span></label>`).join('')}
        </div>
      </fieldset>

      <!-- Bot strength -->
      <fieldset class="field">
        <legend>${STRINGS.difficulty}</legend>
        <div class="segmented">
          ${(
            [
              ['easy', STRINGS.difficultyEasy],
              ['normal', STRINGS.difficultyNormal],
              ['hard', STRINGS.difficultyHard],
            ] as const
          )
            .map(([v, label]) => `<label><input type="radio" name="difficulty" value="${v}" ${v === 'normal' ? 'checked' : ''}/><span>${label}</span></label>`)
            .join('')}
        </div>
      </fieldset>

      <!-- Rules (collapsed by default) -->
      <details class="rules">
        <summary>${STRINGS.rulesHeading}</summary>
        <div class="rules__list"></div>
      </details>

      <button type="submit" class="btn btn--primary btn--big">${STRINGS.startGame}</button>
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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const rules: Rules = { ...DEFAULT_RULES };
    for (const t of TOGGLES) (rules[t.key] as boolean) = (form.elements.namedItem(t.key) as HTMLInputElement).checked;
    for (const n of NUMBERS) (rules[n.key] as number) = Number((form.elements.namedItem(n.key) as HTMLSelectElement).value);
    onStart({
      name: nameInput.value.trim() || STRINGS.defaultName,
      botCount: Number(data.get('bots')),
      difficulty: data.get('difficulty') as Difficulty,
      rules,
    });
  });
}
