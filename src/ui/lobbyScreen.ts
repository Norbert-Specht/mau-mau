/* ==========================================================================
   Multiplayer screens
   - Host lobby: share link, player list, add/remove bots, start
   - Join screen: name + Join (for guests opening a link)
   - Guest lobby / status: waiting, rejected, room gone, host left, …
   - Simple message screen (e.g. "Creating room…")
   Player names come from other people, so they are always set with textContent.
   ========================================================================== */

import type { Difficulty } from '../bot/bot';
import { STRINGS } from '../i18n/strings';
import type { GuestStatus } from '../net/guest';
import type { HostSession } from '../net/host';
import { MAX_SEATS, type LobbySeat } from '../net/protocol';
import { roomLink } from '../net/room';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: STRINGS.difficultyEasy,
  normal: STRINGS.difficultyNormal,
  hard: STRINGS.difficultyHard,
};

/** How long the "Copied!" confirmation stays on the copy button. */
const COPIED_FEEDBACK_MS = 1500;

/* ---------------------------- Host lobby ---------------------------- */

/**
 * Renders the host's lobby and keeps it updated.
 * @param root - container
 * @param session - the host session
 * @param handlers - onStarted when the game begins, onLeave when the host closes the room
 * @returns nothing
 */
export function renderHostLobby(
  root: HTMLElement,
  session: HostSession,
  handlers: { onStarted(): void; onLeave(): void },
): void {
  const link = roomLink(session.roomId);
  root.innerHTML = `
    <main class="setup lobby">
      <!-- Title -->
      <header class="setup__header"><h1>${STRINGS.lobbyTitle}</h1></header>

      <!-- Share link -->
      <section class="mode">
        <h2>${STRINGS.shareLink}</h2>
        <div class="share">
          <input class="share__input" readonly aria-label="${STRINGS.shareLink}" />
          <button type="button" class="btn btn--primary" data-copy>${STRINGS.copyLink}</button>
        </div>
      </section>

      <!-- Players -->
      <section class="mode">
        <h2>${STRINGS.players}</h2>
        <ul class="seats"></ul>
        <div class="add-bot">
          <select aria-label="${STRINGS.difficulty}">
            ${(['easy', 'normal', 'hard'] as const).map((d) => `<option value="${d}" ${d === 'normal' ? 'selected' : ''}>${DIFFICULTY_LABEL[d]}</option>`).join('')}
          </select>
          <button type="button" class="btn" data-add-bot>${STRINGS.addBot}</button>
        </div>
      </section>

      <!-- Start / leave -->
      <p class="lobby__hint" aria-live="polite"></p>
      <button type="button" class="btn btn--primary btn--big" data-start>${STRINGS.startGame}</button>
      <button type="button" class="btn btn--big btn--quiet" data-leave>${STRINGS.leaveRoom}</button>
    </main>`;

  const input = root.querySelector<HTMLInputElement>('.share__input')!;
  input.value = link;
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-copy]')!;
  const seatList = root.querySelector<HTMLElement>('.seats')!;
  const addBtn = root.querySelector<HTMLButtonElement>('[data-add-bot]')!;
  const difficulty = root.querySelector<HTMLSelectElement>('.add-bot select')!;
  const startBtn = root.querySelector<HTMLButtonElement>('[data-start]')!;
  const hint = root.querySelector<HTMLElement>('.lobby__hint')!;

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard blocked: select the text so the player can copy it by hand.
      input.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = STRINGS.copied;
    setTimeout(() => (copyBtn.textContent = STRINGS.copyLink), COPIED_FEEDBACK_MS);
  });
  input.addEventListener('focus', () => input.select());

  addBtn.addEventListener('click', () => session.addBot(difficulty.value as Difficulty));
  seatList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (btn) session.removeBot(btn.dataset.remove!);
  });
  startBtn.addEventListener('click', () => session.start());
  root.querySelector('[data-leave]')!.addEventListener('click', () => {
    if (session.lobbySeats().length > 1 && !window.confirm(STRINGS.closeRoomConfirm)) return;
    stop();
    session.close();
    handlers.onLeave();
  });

  const stop = session.onLobbyChange((seats, started) => {
    if (started) {
      stop();
      handlers.onStarted();
      return;
    }
    renderSeatList(seatList, seats, 'seat-0', true);
    addBtn.disabled = seats.length >= MAX_SEATS;
    startBtn.disabled = seats.length < 2;
    hint.textContent = seats.length < 2 ? STRINGS.needMorePlayers : '';
  });
}

/* ---------------------------- Guest screens ---------------------------- */

/**
 * Renders the "you've been invited" screen.
 * @param root - container
 * @param initialName - prefilled name
 * @param onJoin - called with the chosen name
 * @param onCancel - back to the main menu
 * @returns nothing
 */
export function renderJoinScreen(
  root: HTMLElement,
  initialName: string,
  onJoin: (name: string) => void,
  onCancel: () => void,
): void {
  root.innerHTML = `
    <main class="setup">
      <!-- Title -->
      <header class="setup__header">
        <h1>${STRINGS.joinTitle}</h1>
        <p>${STRINGS.joinHint}</p>
      </header>
      <!-- Name + join -->
      <form class="setup__form">
        <label class="field">
          <span>${STRINGS.yourName}</span>
          <input name="name" maxlength="20" autocomplete="nickname" required />
        </label>
        <button type="submit" class="btn btn--primary btn--big">${STRINGS.join}</button>
        <button type="button" class="btn btn--big btn--quiet" data-cancel>${STRINGS.backToMenu}</button>
      </form>
    </main>`;
  const input = root.querySelector<HTMLInputElement>('input[name="name"]')!;
  input.value = initialName;
  root.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    onJoin(input.value.trim() || STRINGS.defaultName);
  });
  root.querySelector('[data-cancel]')!.addEventListener('click', onCancel);
}

/**
 * Renders a guest's status: connecting, lobby, or a final message.
 * Does nothing for "playing" (the caller shows the table instead).
 * @param root - container
 * @param status - current guest status
 * @param handlers - onLeave (back to menu), onRetry (try connecting again)
 * @returns nothing
 */
export function renderGuestStatus(
  root: HTMLElement,
  status: GuestStatus,
  handlers: { onLeave(): void; onRetry(): void },
): void {
  if (status.kind === 'playing') return;

  if (status.kind === 'lobby') {
    root.innerHTML = `
      <main class="setup lobby">
        <!-- Title -->
        <header class="setup__header"><h1>${STRINGS.lobbyTitle}</h1></header>
        <!-- Players -->
        <section class="mode">
          <h2>${STRINGS.players}</h2>
          <ul class="seats"></ul>
        </section>
        <p class="lobby__hint">${STRINGS.waitingForHost}</p>
        <button type="button" class="btn btn--big btn--quiet" data-leave>${STRINGS.leaveRoom}</button>
      </main>`;
    renderSeatList(root.querySelector('.seats')!, status.seats, status.publicId, false);
    root.querySelector('[data-leave]')!.addEventListener('click', handlers.onLeave);
    return;
  }

  const text: Record<Exclude<GuestStatus['kind'], 'playing' | 'lobby'>, string> = {
    connecting: STRINGS.connecting,
    rejected: '',
    notFound: STRINGS.notFound,
    hostLeft: STRINGS.hostLeft,
    error: STRINGS.connectError,
  };
  let message = text[status.kind];
  if (status.kind === 'rejected') {
    message =
      status.reason === 'full' ? STRINGS.rejectedFull : status.reason === 'started' ? STRINGS.rejectedStarted : STRINGS.rejectedSelf;
  }
  renderMessage(root, message, handlers.onLeave, status.kind === 'error' ? handlers.onRetry : undefined);
}

/**
 * A simple full-screen message with a back button (and optional retry).
 * @param root - container
 * @param message - text to show
 * @param onBack - back to menu
 * @param onRetry - optional "Try again" action
 * @returns nothing
 */
export function renderMessage(root: HTMLElement, message: string, onBack?: () => void, onRetry?: () => void): void {
  root.innerHTML = `
    <main class="setup message">
      <header class="setup__header"><h1>${STRINGS.appTitle}</h1></header>
      <p class="message__text" aria-live="polite"></p>
      ${onRetry ? `<button type="button" class="btn btn--primary btn--big" data-retry>${STRINGS.tryAgain}</button>` : ''}
      ${onBack ? `<button type="button" class="btn btn--big btn--quiet" data-back>${STRINGS.backToMenu}</button>` : ''}
    </main>`;
  root.querySelector('.message__text')!.textContent = message;
  if (onBack) root.querySelector('[data-back]')!.addEventListener('click', onBack);
  if (onRetry) root.querySelector('[data-retry]')!.addEventListener('click', onRetry);
}

/* ---------------------------- Shared ---------------------------- */

/**
 * Fills a <ul> with the lobby seats.
 * @param list - the list element
 * @param seats - lobby seats
 * @param myId - viewer's public seat id (gets a "You" badge)
 * @param canRemoveBots - host only: show Remove buttons on bots
 * @returns nothing
 */
function renderSeatList(list: HTMLElement, seats: LobbySeat[], myId: string, canRemoveBots: boolean): void {
  list.replaceChildren(
    ...seats.map((seat) => {
      const li = document.createElement('li');
      li.className = 'seats__item';
      const name = document.createElement('span');
      name.className = 'seats__name';
      name.textContent = seat.name;
      li.appendChild(name);

      const badges: string[] = [];
      if (seat.publicId === myId) badges.push(STRINGS.youBadge);
      if (seat.isHost) badges.push(STRINGS.hostBadge);
      if (seat.kind === 'bot') badges.push(STRINGS.botBadge(DIFFICULTY_LABEL[seat.difficulty ?? 'normal']));
      if (!seat.connected) badges.push(STRINGS.offlineBadge);
      for (const b of badges) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = b;
        li.appendChild(badge);
      }

      if (canRemoveBots && seat.kind === 'bot') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn--small';
        remove.dataset.remove = seat.publicId;
        remove.textContent = STRINGS.removeBot;
        li.appendChild(remove);
      }
      return li;
    }),
  );
}
