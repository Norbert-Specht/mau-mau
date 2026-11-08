/* ==========================================================================
   Multiplayer screens, on the same felt as the table:
   - Host lobby: the share link as a ticket, players with avatars, bots, start
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
import { animalAvatar, BOT_ANIMALS, initialAvatar } from './theme/avatars';
import { pop } from './theme/motion';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: STRINGS.difficultyEasy,
  normal: STRINGS.difficultyNormal,
  hard: STRINGS.difficultyHard,
};

/** How long the "Copied!" confirmation stays on the ticket stub. */
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
    <main class="menu felt felt--rim">
      <!-- Title -->
      <header class="menu__header"><h1 class="menu-logo">${STRINGS.lobbyTitle}</h1></header>

      <!-- Share link as a ticket -->
      <div class="ticket">
        <div class="ticket__main">
          <span class="ticket__label">${STRINGS.shareLink}</span>
          <span class="ticket__link"></span>
        </div>
        <button type="button" class="ticket__stub" data-copy>${STRINGS.copyLink}</button>
      </div>

      <!-- Players -->
      <section class="menu__section">
        <h2>${STRINGS.players}</h2>
        <ul class="seat-list"></ul>
      </section>

      <!-- Add a bot: strength chips + button -->
      <section class="panel mode-card add-bot">
        <div class="chip-row">
          ${(['easy', 'normal', 'hard'] as const)
            .map((d) => `<label class="toggle-chip"><input type="radio" name="bot-strength" value="${d}" ${d === 'normal' ? 'checked' : ''} /><span class="toggle-chip__dot chip chip--navy"></span>${DIFFICULTY_LABEL[d]}</label>`)
            .join('')}
        </div>
        <button type="button" class="btn" data-add-bot>+ ${STRINGS.addBot}</button>
      </section>

      <!-- Start / leave -->
      <p class="menu__hint" aria-live="polite"></p>
      <button type="button" class="btn btn--primary btn--big" data-start>${STRINGS.startGame}</button>
      <button type="button" class="btn btn--ghost" data-leave>${STRINGS.leaveRoom}</button>
    </main>`;

  const linkEl = root.querySelector<HTMLElement>('.ticket__link')!;
  linkEl.textContent = link;
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-copy]')!;
  const seatList = root.querySelector<HTMLElement>('.seat-list')!;
  const addBtn = root.querySelector<HTMLButtonElement>('[data-add-bot]')!;
  const startBtn = root.querySelector<HTMLButtonElement>('[data-start]')!;
  const hint = root.querySelector<HTMLElement>('.menu__hint')!;

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard blocked: select the link text so the player can copy it by hand.
      const range = document.createRange();
      range.selectNodeContents(linkEl);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
    copyBtn.textContent = STRINGS.copied;
    pop(copyBtn);
    setTimeout(() => (copyBtn.textContent = STRINGS.copyLink), COPIED_FEEDBACK_MS);
  });

  addBtn.addEventListener('click', () => {
    const strength = root.querySelector<HTMLInputElement>('input[name="bot-strength"]:checked')!.value as Difficulty;
    session.addBot(strength);
  });
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

  let shown = 0;
  const stop = session.onLobbyChange((seats, started) => {
    if (started) {
      stop();
      handlers.onStarted();
      return;
    }
    renderSeatList(seatList, seats, 'seat-0', true);
    // New arrivals pop in.
    if (seats.length > shown) [...seatList.children].slice(shown).forEach((li) => pop(li));
    shown = seats.length;
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
    <main class="menu felt felt--rim">
      <!-- Title -->
      <header class="menu__header">
        <h1 class="menu-logo">${STRINGS.joinTitle}</h1>
        <p class="menu__tagline">${STRINGS.joinHint}</p>
      </header>
      <!-- Name + join -->
      <form class="menu__form">
        <label class="name-field">
          <span>${STRINGS.yourName}</span>
          <input name="name" maxlength="20" autocomplete="nickname" required />
        </label>
        <button type="submit" class="btn btn--primary btn--big">${STRINGS.join}</button>
        <button type="button" class="btn btn--ghost" data-cancel>${STRINGS.backToMenu}</button>
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
      <main class="menu felt felt--rim">
        <!-- Title -->
        <header class="menu__header"><h1 class="menu-logo">${STRINGS.lobbyTitle}</h1></header>
        <!-- Players -->
        <section class="menu__section">
          <h2>${STRINGS.players}</h2>
          <ul class="seat-list"></ul>
        </section>
        <p class="menu__hint">${STRINGS.waitingForHost}</p>
        <button type="button" class="btn btn--ghost" data-leave>${STRINGS.leaveRoom}</button>
      </main>`;
    renderSeatList(root.querySelector('.seat-list')!, status.seats, status.publicId, false);
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
 * A simple full-screen message on the felt, with a back button (and optional retry).
 * @param root - container
 * @param message - text to show
 * @param onBack - back to menu
 * @param onRetry - optional "Try again" action
 * @returns nothing
 */
export function renderMessage(root: HTMLElement, message: string, onBack?: () => void, onRetry?: () => void): void {
  root.innerHTML = `
    <main class="menu felt felt--rim">
      <header class="menu__header"><h1 class="menu-logo">${STRINGS.appTitle}</h1></header>
      <div class="panel menu__message"><p aria-live="polite"></p></div>
      ${onRetry ? `<button type="button" class="btn btn--primary btn--big" data-retry>${STRINGS.tryAgain}</button>` : ''}
      ${onBack ? `<button type="button" class="btn btn--ghost" data-back>${STRINGS.backToMenu}</button>` : ''}
    </main>`;
  root.querySelector('.menu__message p')!.textContent = message;
  if (onBack) root.querySelector('[data-back]')!.addEventListener('click', onBack);
  if (onRetry) root.querySelector('[data-retry]')!.addEventListener('click', onRetry);
}

/* ---------------------------- Shared ---------------------------- */

/**
 * Fills a list with the lobby seats: avatar, name, badges.
 * @param list - the <ul> element
 * @param seats - lobby seats
 * @param myId - viewer's public seat id (gets a "You" badge)
 * @param canRemoveBots - host only: show a remove button on bots
 * @returns nothing
 */
function renderSeatList(list: HTMLElement, seats: LobbySeat[], myId: string, canRemoveBots: boolean): void {
  let botIndex = 0;
  list.replaceChildren(
    ...seats.map((seat) => {
      const li = document.createElement('li');
      li.className = `seat-line ${seat.connected ? '' : 'seat-line--offline'}`;

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      // Bots get animals in the same order as at the table.
      avatar.innerHTML = seat.kind === 'bot' ? animalAvatar(BOT_ANIMALS[botIndex++ % BOT_ANIMALS.length]) : initialAvatar(seat.name);

      const name = document.createElement('span');
      name.className = 'seat-line__name';
      name.textContent = seat.name;

      const badges: string[] = [];
      if (seat.publicId === myId) badges.push(STRINGS.youBadge);
      if (seat.isHost) badges.push(STRINGS.hostBadge);
      if (seat.kind === 'bot') badges.push(STRINGS.botBadge(DIFFICULTY_LABEL[seat.difficulty ?? 'normal']));
      if (!seat.connected) badges.push(STRINGS.offlineBadge);
      const small = document.createElement('small');
      small.textContent = badges.join(' · ');

      li.append(avatar, name, small);
      if (canRemoveBots && seat.kind === 'bot') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'seat-line__remove';
        remove.dataset.remove = seat.publicId;
        remove.setAttribute('aria-label', `${STRINGS.removeBot} ${seat.name}`);
        remove.textContent = '×';
        li.appendChild(remove);
      }
      return li;
    }),
  );
}
