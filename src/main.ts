/* ==========================================================================
   App entry point
   Shows the setup screen, then starts a local game against bots.
   ========================================================================== */

import './styles.css';
import { createDeck } from './engine';
import { GameController, type SeatConfig } from './game/controller';
import { localConnection } from './game/connection';
import { loadProfile, saveProfile } from './game/profile';
import { STRINGS } from './i18n/strings';
import { preloadCardImages } from './ui/cardView';
import { renderSetupScreen, type SetupChoice } from './ui/setupScreen';
import { mountTable } from './ui/tableView';

const app = document.querySelector<HTMLDivElement>('#app')!;
const profile = loadProfile();

/**
 * Shows the setup screen.
 * @returns nothing
 */
function showSetup(): void {
  renderSetupScreen(app, profile.name, (choice) => {
    profile.name = choice.name;
    saveProfile(profile);
    startLocalGame(choice);
  });
}

/**
 * Starts a game: you plus the chosen number of bots.
 * @param choice - settings from the setup screen
 * @returns nothing
 */
function startLocalGame(choice: SetupChoice): void {
  const seats: SeatConfig[] = [
    { kind: 'human', id: profile.id, name: choice.name },
    ...STRINGS.botNames.slice(0, choice.botCount).map(
      (name, i): SeatConfig => ({ kind: 'bot', id: `bot-${i + 1}`, name, difficulty: choice.difficulty }),
    ),
  ];
  // A fresh random seed per game; the engine itself stays deterministic.
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const controller = new GameController(seats, choice.rules, seed);
  mountTable(app, localConnection(controller, profile.id), showSetup);
}

preloadCardImages(createDeck());
showSetup();
