/* ==========================================================================
   App entry point
   Routes between the three ways to play:
   - local game against bots (works offline)
   - hosting a room for friends (PeerJS)
   - joining a room from a #room=<code> link
   ========================================================================== */

import './ui/theme/tokens.css';
import './ui/theme/components.css';
import './ui/base.css';
import './ui/game.css';
import './ui/menus.css';
import { createDeck, type Rules } from './engine';
import { GameController, type SeatConfig } from './game/controller';
import { localConnection } from './game/connection';
import { loadProfile, saveProfile } from './game/profile';
import { STRINGS } from './i18n/strings';
import { GuestSession } from './net/guest';
import { HostSession } from './net/host';
import { connectToRoom, openRoom } from './net/peerTransport';
import { clearRoomHash, getJoinedRoom, roomFromHash, setJoinedRoom } from './net/room';
import { preloadCardImages } from './ui/cardView';
import { renderGuestStatus, renderHostLobby, renderJoinScreen, renderMessage } from './ui/lobbyScreen';
import { renderSetupScreen, type SetupChoice } from './ui/setupScreen';
import { mountTable } from './ui/tableView';

const app = document.querySelector<HTMLDivElement>('#app')!;
const profile = loadProfile();

/** Whatever must be told when this tab closes (host: notify guests; guest: say bye). */
let onPageExit: (() => void) | null = null;
window.addEventListener('pagehide', () => onPageExit?.());

/* ---------------------------- Main menu ---------------------------- */

/**
 * Shows the setup screen (main menu).
 * @returns nothing
 */
function showSetup(): void {
  onPageExit = null;
  renderSetupScreen(app, profile.name, {
    onStart: (choice) => {
      rememberName(choice.name);
      startLocalGame(choice);
    },
    onCreateRoom: (name, rules) => {
      rememberName(name);
      void hostRoom(rules);
    },
  });
}

/**
 * Saves the player's name for next time.
 * @param name - the name
 * @returns nothing
 */
function rememberName(name: string): void {
  profile.name = name;
  saveProfile(profile);
}

/* ---------------------------- Local game ---------------------------- */

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

/* ---------------------------- Hosting ---------------------------- */

/**
 * Creates a room and shows the host lobby.
 * @param rules - rules chosen on the setup screen
 * @returns resolves once the lobby is shown (or an error)
 */
async function hostRoom(rules: Rules): Promise<void> {
  renderMessage(app, STRINGS.creatingRoom);
  let transport;
  try {
    transport = await openRoom();
  } catch {
    renderMessage(app, STRINGS.roomError, showSetup, () => void hostRoom(rules));
    return;
  }
  const session = new HostSession(transport, { secretId: profile.id, name: profile.name }, rules);
  onPageExit = () => session.close();
  renderHostLobby(app, session, {
    onStarted: () => mountTable(app, session.hostConnection(), showSetup),
    onLeave: showSetup,
  });
}

/* ---------------------------- Joining ---------------------------- */

/**
 * Handles a #room=<code> link: rejoins straight away after a reload,
 * otherwise asks for the player's name first.
 * @param roomId - room code from the link
 * @returns nothing
 */
function openRoomLink(roomId: string): void {
  if (getJoinedRoom() === roomId) {
    joinRoom(roomId);
    return;
  }
  renderJoinScreen(
    app,
    profile.name,
    (name) => {
      rememberName(name);
      joinRoom(roomId);
    },
    leaveRoomLink,
  );
}

/**
 * Connects to a room as a guest and follows its status.
 * @param roomId - room code
 * @returns nothing
 */
function joinRoom(roomId: string): void {
  const guest = new GuestSession(connectToRoom, roomId, profile);
  onPageExit = () => guest.leave();
  let atTable = false;

  const leave = () => {
    guest.leave();
    leaveRoomLink();
  };

  guest.onStatus((status) => {
    if (status.kind === 'lobby' || status.kind === 'playing') setJoinedRoom(roomId);
    // Final states: this room can't be rejoined automatically any more.
    if (['rejected', 'notFound', 'hostLeft'].includes(status.kind)) setJoinedRoom(null);

    if (status.kind === 'playing') {
      if (!atTable) {
        atTable = true;
        mountTable(app, guest.tableConnection(), leaveRoomLink);
      }
      return;
    }
    // At the table, "host left" is shown by the table itself (dialog).
    if (atTable && status.kind === 'hostLeft') return;
    atTable = false;
    renderGuestStatus(app, status, {
      onLeave: leave,
      onRetry: () => {
        guest.leave();
        joinRoom(roomId);
      },
    });
  });
  guest.start();
}

/**
 * Leaves a room link behind: forget the room, clean the address bar, go to the menu.
 * @returns nothing
 */
function leaveRoomLink(): void {
  setJoinedRoom(null);
  clearRoomHash();
  showSetup();
}

/* ---------------------------- Start ---------------------------- */

/**
 * Picks the first screen from the URL.
 * @returns nothing
 */
function boot(): void {
  const roomId = roomFromHash(location.hash);
  if (roomId) openRoomLink(roomId);
  else showSetup();
}

// Pasting a room link into an open tab only changes the hash: start over cleanly.
window.addEventListener('hashchange', () => {
  if (roomFromHash(location.hash)) location.reload();
});

preloadCardImages(createDeck());
boot();
