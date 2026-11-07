/* ==========================================================================
   Table view
   Renders one player's view of the game: opponents, piles, suit indicator,
   event log, action buttons and the fanned hand. Re-renders on every update
   and then animates what changed (see animate.ts).
   ========================================================================== */

import {
  canDraw,
  canPass,
  getPlayableCards,
  isWildJack,
  SUITS,
  type Card,
  type GameEvent,
  type Suit,
  type VisibleState,
} from '../engine';
import type { ConnectionNotice, TableConnection, TableMeta } from '../game/connection';
import { STRINGS, SUIT_NAMES, SUIT_SYMBOLS, suitText } from '../i18n/strings';
import { flyFrom, flyGhostCard, pulse } from './animate';
import { createCardEl } from './cardView';
import { describeEvents } from './eventLog';

/** Log lines kept in memory (only the last few are visible). */
const LOG_LIMIT = 40;
/** Max face-down cards drawn per opponent; more would just be clutter. */
const MAX_SEAT_CARDS = 7;
/** Pause before the round-over dialog so the winning card can land first. */
const ROUND_DIALOG_DELAY_MS = 900;
/** Stagger between cards in multi-card animations (deal, draw 4, …). */
const STAGGER_MS = 80;

/** Screen positions captured before a re-render, used to animate from. */
interface Snapshot {
  hand: Map<string, DOMRect>;
  draw: DOMRect;
  seats: Map<number, DOMRect>;
}

/**
 * Mounts the table UI.
 * @param root - container element (content replaced)
 * @param conn - connection to the game (local or, later, remote)
 * @param onLeave - called after the player leaves via the menu
 * @returns nothing
 */
export function mountTable(root: HTMLElement, conn: TableConnection, onLeave: () => void): void {
  new TableView(root, conn, onLeave);
}

class TableView {
  private view: VisibleState | null = null;
  private meta: TableMeta = { connected: [] };
  private logLines: string[] = [];
  private roundDialogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeNotice: () => void;
  private readonly el: {
    round: HTMLElement;
    opponents: HTMLElement;
    draw: HTMLButtonElement;
    drawStack: HTMLElement;
    drawCount: HTMLElement;
    discard: HTMLElement;
    suitLabel: HTMLElement;
    suitSymbol: HTMLElement;
    penalty: HTMLElement;
    status: HTMLElement;
    log: HTMLElement;
    mau: HTMLButtonElement;
    drawBtn: HTMLButtonElement;
    pass: HTMLButtonElement;
    handArea: HTMLElement;
    hand: HTMLElement;
    suitDialog: HTMLDialogElement;
    roundDialog: HTMLDialogElement;
    notice: HTMLElement;
    hostLeftDialog: HTMLDialogElement;
  };

  /**
   * Builds the static layout and subscribes to game updates.
   * @param root - container element
   * @param conn - game connection
   * @param onLeave - leave callback
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly conn: TableConnection,
    private readonly onLeave: () => void,
  ) {
    root.innerHTML = `
      <div class="table">
        <!-- Connection banner (multiplayer guests) -->
        <div class="notice" role="status" hidden></div>

        <!-- Top bar: menu and round number -->
        <header class="topbar">
          <button type="button" class="btn btn--small" data-action="menu">${STRINGS.menu}</button>
          <span class="topbar__round"></span>
        </header>

        <!-- Opponents (in turn order after you) -->
        <section class="opponents"></section>

        <!-- Center: draw pile, discard pile, current suit -->
        <section class="center">
          <button type="button" class="pile pile--draw" data-action="draw">
            <span class="pile__stack"></span>
            <span class="pile__count"></span>
          </button>
          <div class="pile pile--discard"></div>
          <div class="suit-indicator">
            <span class="suit-indicator__label"></span>
            <span class="suit-indicator__symbol"></span>
            <span class="suit-indicator__penalty"></span>
          </div>
        </section>

        <!-- Whose turn + recent events -->
        <p class="status" aria-live="polite"></p>
        <ol class="log" aria-label="${STRINGS.log}"></ol>

        <!-- Action buttons -->
        <section class="actions">
          <button type="button" class="btn btn--mau" data-action="mau">${STRINGS.mauButton}</button>
          <button type="button" class="btn" data-action="draw"></button>
          <button type="button" class="btn" data-action="pass">${STRINGS.pass}</button>
        </section>

        <!-- Your hand -->
        <section class="hand-area"><div class="hand"></div></section>
      </div>

      <!-- Suit picker for a wild Jack -->
      <dialog class="dialog suit-picker">
        <h2>${STRINGS.pickSuitTitle}</h2>
        <div class="suit-picker__grid">
          ${SUITS.map((s) => `<button type="button" class="suit-btn suit-btn--${s}" data-suit="${s}"><span>${SUIT_SYMBOLS[s]}</span>${SUIT_NAMES[s]}</button>`).join('')}
        </div>
        <button type="button" class="btn" data-suit="">${STRINGS.cancel}</button>
      </dialog>

      <!-- Round / match result -->
      <dialog class="dialog round-over"></dialog>

      <!-- Host closed the game (multiplayer guests) -->
      <dialog class="dialog host-left">
        <h2>${STRINGS.hostLeftTitle}</h2>
        <p>${STRINGS.hostLeft}</p>
        <div class="dialog__buttons">
          <button type="button" class="btn btn--primary" data-host-left>${STRINGS.backToMenu}</button>
        </div>
      </dialog>`;

    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    this.el = {
      round: q('.topbar__round'),
      opponents: q('.opponents'),
      draw: q('.pile--draw'),
      drawStack: q('.pile__stack'),
      drawCount: q('.pile__count'),
      discard: q('.pile--discard'),
      suitLabel: q('.suit-indicator__label'),
      suitSymbol: q('.suit-indicator__symbol'),
      penalty: q('.suit-indicator__penalty'),
      status: q('.status'),
      log: q('.log'),
      mau: q('.actions [data-action="mau"]'),
      drawBtn: q('.actions [data-action="draw"]'),
      pass: q('.actions [data-action="pass"]'),
      handArea: q('.hand-area'),
      hand: q('.hand'),
      suitDialog: q('.suit-picker'),
      roundDialog: q('.round-over'),
      notice: q('.notice'),
      hostLeftDialog: q('.host-left'),
    };

    root.addEventListener('click', this.onClick);
    window.addEventListener('resize', this.onResize);
    // The result dialog must be closed with its buttons, not Escape.
    this.el.roundDialog.addEventListener('cancel', (e) => e.preventDefault());
    this.el.hostLeftDialog.addEventListener('cancel', (e) => e.preventDefault());
    this.el.hostLeftDialog.querySelector('[data-host-left]')!.addEventListener('click', () => this.leave());
    this.unsubscribe = conn.subscribe(this.onUpdate);
    this.unsubscribeNotice = conn.subscribeNotice?.(this.onNotice) ?? (() => {});
  }

  /* ---------------------------- Updates ---------------------------- */

  /**
   * Handles a new view from the game: log, render, animate, dialogs.
   * @param view - the new visible state
   * @param events - events that led to it
   * @param isNewDeal - true when cards were just dealt
   * @param meta - who is online
   * @returns nothing
   */
  private onUpdate = (view: VisibleState, events: GameEvent[], isNewDeal: boolean, meta: TableMeta): void => {
    const before = this.snapshot();
    this.view = view;
    this.meta = meta;

    if (isNewDeal) {
      this.closeRoundDialog();
      this.logLines = [];
    }
    this.logLines.push(...describeEvents(events, view, this.conn.rules));
    this.logLines = this.logLines.slice(-LOG_LIMIT);

    this.render();
    this.animate(before, events, isNewDeal);

    if ((view.phase === 'roundOver' || view.phase === 'matchOver') && !this.roundDialogTimer) {
      this.roundDialogTimer = setTimeout(() => this.showRoundDialog(), ROUND_DIALOG_DELAY_MS);
    }
  };

  /* ---------------------------- Rendering ---------------------------- */

  /**
   * Re-renders every dynamic part of the table from this.view.
   * @returns nothing
   */
  private render(): void {
    const v = this.view!;
    const rules = this.conn.rules;
    const myTurn = v.current === v.you && (v.phase === 'playing' || v.phase === 'drawn');

    // Round number
    this.el.round.textContent = STRINGS.roundLabel(v.round, rules.scoring ? rules.roundsPerMatch : null);

    this.renderOpponents(v);

    // Draw pile: a few stacked backs to suggest thickness, plus the count.
    this.el.drawStack.replaceChildren(
      ...Array.from({ length: Math.min(3, v.drawPileCount) }, () => createCardEl(null)),
    );
    this.el.drawCount.textContent = String(v.drawPileCount);
    this.el.draw.setAttribute('aria-label', STRINGS.drawPileLabel(v.drawPileCount));
    this.el.draw.disabled = !canDraw(v);

    // Discard pile: top card plus two under it, slightly rotated for a messy pile.
    const visiblePile = v.discardPile.slice(-3);
    this.el.discard.replaceChildren(
      ...visiblePile.map((card, i) => {
        const slot = document.createElement('div');
        slot.className = 'pile__slot';
        slot.style.setProperty('--tilt', `${tiltFor(card.id)}deg`);
        if (i === visiblePile.length - 1) slot.classList.add('pile__slot--top');
        slot.appendChild(createCardEl(card));
        return slot;
      }),
    );

    // Suit indicator: the wished suit after a Jack, otherwise the top card's suit.
    const suit: Suit = v.wishedSuit ?? v.topCard.suit;
    this.el.suitLabel.textContent = v.wishedSuit ? STRINGS.wishLabel : STRINGS.currentSuit;
    this.el.suitSymbol.textContent = SUIT_SYMBOLS[suit];
    this.el.suitSymbol.className = `suit-indicator__symbol suit--${suit}`;
    this.el.suitSymbol.setAttribute('aria-label', SUIT_NAMES[suit]);
    this.el.suitSymbol.closest('.suit-indicator')!.classList.toggle('suit-indicator--wish', !!v.wishedSuit);
    this.el.penalty.textContent = v.pendingDraw > 0 ? STRINGS.pendingDraw(v.pendingDraw) : '';

    // Status line
    this.el.status.textContent = this.statusText(v);
    this.el.status.classList.toggle('status--yours', myTurn);

    // Log: newest at the bottom.
    this.el.log.replaceChildren(
      ...this.logLines.slice(-6).map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );

    // Action buttons
    this.el.mau.hidden = !rules.mauRequired;
    this.el.mau.disabled = !myTurn;
    this.el.mau.classList.toggle('btn--pressed', myTurn && v.mauCalled);
    this.el.mau.setAttribute('aria-pressed', String(myTurn && v.mauCalled));
    this.el.drawBtn.textContent = v.pendingDraw > 0 ? STRINGS.drawPenalty(v.pendingDraw) : STRINGS.draw;
    this.el.drawBtn.disabled = !canDraw(v);
    this.el.pass.hidden = !canPass(v);

    this.renderHand(v, myTurn);
  }

  /**
   * Draws the opponent seats in turn order starting after you.
   * @param v - current view
   * @returns nothing
   */
  private renderOpponents(v: VisibleState): void {
    const n = v.players.length;
    const seats: HTMLElement[] = [];
    for (let k = 1; k < n; k++) {
      const seat = (v.you + k) % n;
      const p = v.players[seat];
      const el = document.createElement('div');
      el.className = 'seat';
      el.dataset.seat = String(seat);
      if (seat === v.current && (v.phase === 'playing' || v.phase === 'drawn')) el.classList.add('seat--active');
      const online = this.meta.connected[seat] !== false;
      if (!online) el.classList.add('seat--offline');

      const cards = document.createElement('div');
      cards.className = 'seat__cards';
      for (let i = 0; i < Math.min(p.cardCount, MAX_SEAT_CARDS); i++) cards.appendChild(createCardEl(null));

      const name = document.createElement('div');
      name.className = 'seat__name';
      name.textContent = p.name;

      const count = document.createElement('div');
      count.className = 'seat__count';
      count.textContent = online ? STRINGS.cardsLeft(p.cardCount) : `${STRINGS.cardsLeft(p.cardCount)} · ${STRINGS.offlineBadge}`;
      if (p.cardCount === 1) count.classList.add('seat__count--mau');

      const bubble = document.createElement('span');
      bubble.className = 'seat__bubble';
      bubble.textContent = STRINGS.mauButton;

      el.append(cards, name, count, bubble);
      seats.push(el);
    }
    this.el.opponents.replaceChildren(...seats);
  }

  /**
   * Draws your hand as a fan; playable cards are clickable, others dimmed.
   * @param v - current view
   * @param myTurn - whether you may act now
   * @returns nothing
   */
  private renderHand(v: VisibleState, myTurn: boolean): void {
    const playable = new Set(getPlayableCards(v, this.conn.rules).map((c) => c.id));
    this.el.handArea.classList.toggle('hand-area--active', myTurn);
    this.el.hand.replaceChildren(
      ...v.hand.map((card) => {
        const slot = document.createElement('div');
        slot.className = 'hand__slot';
        const btn = createCardEl(card, 'button') as HTMLButtonElement;
        btn.dataset.action = 'play';
        if (myTurn) {
          btn.classList.add(playable.has(card.id) ? 'card--playable' : 'card--unplayable');
          btn.disabled = !playable.has(card.id);
        } else {
          btn.disabled = true;
        }
        if (card.id === v.drawnCardId) btn.classList.add('card--drawn');
        slot.appendChild(btn);
        return slot;
      }),
    );
    this.layoutHand();
  }

  /**
   * Spaces and rotates the hand cards to fit the available width.
   * @returns nothing
   */
  private layoutHand(): void {
    const slots = [...this.el.hand.children] as HTMLElement[];
    const n = slots.length;
    if (n === 0) return;
    const cardW = slots[0].offsetWidth;
    const cardH = slots[0].offsetHeight;
    // Fan: up to 5° per card, total spread capped at ~36°.
    const spread = Math.min(5, 36 / n);
    const mid = (n - 1) / 2;
    // The outermost cards rotate around a point 120% down the card (see
    // .hand__slot transform-origin), so their top corners swing outward by
    // about 1.2 × height × sin(angle). Keep that much room on each side.
    const maxAngle = (spread * mid * Math.PI) / 180;
    const swing = 1.2 * cardH * Math.sin(maxAngle);
    const avail = this.el.hand.clientWidth - 16 - 2 * swing; // 16 = .hand side padding
    // Spread cards to fill the width, but never further apart than a small gap.
    // The 0.18 floor keeps the corner index of each card visible even with a huge hand.
    const step = n > 1 ? Math.max(cardW * 0.18, Math.min(cardW * 1.08, (avail - cardW) / (n - 1))) : cardW;
    this.el.hand.style.setProperty('--step', `${step}px`);
    slots.forEach((slot, i) => {
      const offset = i - mid;
      slot.style.setProperty('--angle', `${offset * spread}deg`);
      // Push outer cards down a little so the fan curves like held cards.
      slot.style.setProperty('--drop', `${offset * offset * spread * 0.18}px`);
    });
  }

  /**
   * The one-line status under the piles.
   * @param v - current view
   * @returns status text
   */
  private statusText(v: VisibleState): string {
    if (v.phase === 'roundOver' || v.phase === 'matchOver') {
      const w = v.roundWinner ?? 0;
      return STRINGS.roundWinner(v.players[w].name, w === v.you);
    }
    if (v.current !== v.you) {
      const name = v.players[v.current].name;
      return this.meta.connected[v.current] === false ? STRINGS.waitingFor(name) : STRINGS.theirTurn(name);
    }
    if (v.phase === 'drawn') return STRINGS.statusDrawn;
    if (v.pendingDraw > 0) return STRINGS.statusPenalty(v.pendingDraw, this.conn.rules.sevenStacking);
    if (v.wishedSuit) return STRINGS.statusWish(suitText(v.wishedSuit));
    return STRINGS.yourTurn;
  }

  /* ---------------------------- Animation ---------------------------- */

  /**
   * Records where things are on screen before a re-render.
   * @returns the snapshot
   */
  private snapshot(): Snapshot {
    const hand = new Map<string, DOMRect>();
    this.el.hand.querySelectorAll<HTMLElement>('.card').forEach((c) => hand.set(c.dataset.cardId!, c.getBoundingClientRect()));
    const seats = new Map<number, DOMRect>();
    this.el.opponents
      .querySelectorAll<HTMLElement>('.seat')
      .forEach((s) => seats.set(Number(s.dataset.seat), s.querySelector('.seat__cards')!.getBoundingClientRect()));
    return { hand, draw: this.el.draw.getBoundingClientRect(), seats };
  }

  /**
   * Animates the changes between the snapshot and the new render.
   * @param before - positions before the update
   * @param events - what happened
   * @param isNewDeal - whether this is a fresh deal
   * @returns nothing
   */
  private animate(before: Snapshot, events: GameEvent[], isNewDeal: boolean): void {
    const v = this.view!;
    const handCards = [...this.el.hand.querySelectorAll<HTMLElement>('.card')];
    const seatRect = (seat: number) =>
      this.el.opponents.querySelector(`.seat[data-seat="${seat}"] .seat__cards`)?.getBoundingClientRect();
    const ghostWidth = handCards[0]?.offsetWidth ?? 60;

    if (isNewDeal) {
      // Deal: your cards fly in from the draw pile one by one, opponents get ghost cards.
      handCards.forEach((card, i) => flyFrom(card, before.draw, { delay: i * STAGGER_MS * v.players.length }));
      v.players.forEach((p, seat) => {
        const to = seatRect(seat);
        if (seat === v.you || !to) return;
        for (let i = 0; i < Math.min(p.cardCount, 4); i++) {
          flyGhostCard(before.draw, to, { delay: (i * v.players.length + seat) * STAGGER_MS, width: ghostWidth });
        }
      });
      return;
    }

    let newCardDelay = 0;
    for (const e of events) {
      if (e.type === 'played') {
        const top = this.el.discard.querySelector<HTMLElement>('.pile__slot--top .card');
        const from = e.seat === v.you ? before.hand.get(e.card.id) : before.seats.get(e.seat);
        if (top && from) flyFrom(top, from);
      } else if (e.type === 'drew') {
        if (e.seat === v.you) {
          for (const c of e.cards) {
            const el = handCards.find((h) => h.dataset.cardId === c.id);
            if (el) flyFrom(el, before.draw, { delay: newCardDelay });
            newCardDelay += STAGGER_MS;
          }
        } else {
          const to = seatRect(e.seat);
          for (let i = 0; to && i < Math.min(e.count, 6); i++) {
            flyGhostCard(before.draw, to, { delay: i * STAGGER_MS, width: ghostWidth });
          }
        }
      } else if (e.type === 'mau' && e.seat !== v.you) {
        const seat = this.el.opponents.querySelector<HTMLElement>(`.seat[data-seat="${e.seat}"]`);
        if (seat) {
          seat.classList.add('seat--mau');
          pulse(seat);
          setTimeout(() => seat.classList.remove('seat--mau'), 1500);
        }
      }
    }

    // Cards that stayed in your hand slide to their new spots.
    for (const el of handCards) {
      const old = before.hand.get(el.dataset.cardId!);
      if (old) flyFrom(el, old, { duration: 250 });
    }
  }

  /* ---------------------------- Input ---------------------------- */

  /**
   * Single click handler for the whole table (event delegation).
   * @param event - the click
   * @returns nothing
   */
  private onClick = async (event: MouseEvent): Promise<void> => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const v = this.view;
    if (!target || !v || (target as HTMLButtonElement).disabled) return;
    const player = this.conn.playerId;

    switch (target.dataset.action) {
      case 'menu':
        if (window.confirm(STRINGS.leaveConfirm)) this.leave();
        break;
      case 'mau':
        this.conn.submit({ type: 'mau', player });
        break;
      case 'draw':
        if (canDraw(v)) this.conn.submit({ type: 'draw', player });
        break;
      case 'pass':
        this.conn.submit({ type: 'pass', player });
        break;
      case 'play': {
        const card = v.hand.find((c) => c.id === target.dataset.cardId);
        if (card) await this.play(card);
        break;
      }
    }
  };

  /**
   * Plays a card, asking for a suit first if it is a wild Jack.
   * @param card - the clicked card
   * @returns resolves when the move was sent (or cancelled)
   */
  private async play(card: Card): Promise<void> {
    const v = this.view!;
    let wish: Suit | undefined;
    if (isWildJack(card, this.conn.rules) && v.hand.length > 1) {
      const picked = await this.pickSuit();
      if (!picked) return;
      wish = picked;
    }
    this.conn.submit({ type: 'play', player: this.conn.playerId, cardId: card.id, wish });
  }

  /**
   * Opens the "Ich wünsche mir…" dialog.
   * @returns the chosen suit, or null if cancelled
   */
  private pickSuit(): Promise<Suit | null> {
    const dialog = this.el.suitDialog;
    return new Promise((resolve) => {
      const onClick = (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-suit]');
        if (!btn) return;
        finish((btn.dataset.suit || null) as Suit | null);
      };
      const finish = (suit: Suit | null) => {
        dialog.removeEventListener('click', onClick);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) dialog.close();
        resolve(suit);
      };
      const onClose = () => finish(null);
      dialog.addEventListener('click', onClick);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }

  /* ---------------------------- Round over ---------------------------- */

  /**
   * Shows the round (or match) result with points and the next-step buttons.
   * @returns nothing
   */
  private showRoundDialog(): void {
    const v = this.view;
    if (!v || (v.phase !== 'roundOver' && v.phase !== 'matchOver')) return;
    const scoring = this.conn.rules.scoring;
    const winner = v.roundWinner ?? 0;
    const dialog = this.el.roundDialog;
    const matchOver = v.phase === 'matchOver';
    const headline = matchOver
      ? STRINGS.matchWinner(
          (v.matchWinners ?? []).map((s) => (s === v.you ? STRINGS.you : v.players[s].name)),
          (v.matchWinners ?? []).includes(v.you),
        )
      : STRINGS.roundWinner(v.players[winner].name, winner === v.you);

    dialog.innerHTML = `
      <h2>${STRINGS.mauMau}</h2>
      <p class="round-over__headline"></p>
      <table class="scores">
        <thead><tr><th></th><th>${STRINGS.pointsThisRound}</th>${scoring ? `<th>${STRINGS.pointsTotal}</th>` : ''}</tr></thead>
        <tbody></tbody>
      </table>
      ${this.conn.canControlRounds ? '' : `<p class="round-over__wait">${STRINGS.waitingForHostNext}</p>`}
      <div class="dialog__buttons">
        ${this.conn.canControlRounds ? `<button type="button" class="btn btn--primary" data-next>${matchOver ? STRINGS.newMatch : STRINGS.nextRound}</button>` : ''}
        <button type="button" class="btn" data-leave>${STRINGS.backToMenu}</button>
      </div>`;
    dialog.querySelector('.round-over__headline')!.textContent = headline;

    // Player names are user input, so rows are built with textContent.
    const body = dialog.querySelector('tbody')!;
    v.players.forEach((p, seat) => {
      const row = document.createElement('tr');
      if (seat === winner) row.className = 'scores__winner';
      const cells = [seat === v.you ? `${p.name} (${STRINGS.you})` : p.name, String(v.lastRoundPoints?.[seat] ?? 0)];
      if (scoring) cells.push(String(v.scores[seat]));
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        row.appendChild(td);
      }
      body.appendChild(row);
    });

    dialog.querySelector('[data-next]')?.addEventListener('click', () => {
      this.closeRoundDialog();
      if (matchOver) this.conn.newMatch();
      else this.conn.nextRound();
    });
    dialog.querySelector('[data-leave]')!.addEventListener('click', () => this.leave());
    dialog.showModal();
  }

  /**
   * Closes the result dialog and cancels a pending one.
   * @returns nothing
   */
  private closeRoundDialog(): void {
    if (this.roundDialogTimer) clearTimeout(this.roundDialogTimer);
    this.roundDialogTimer = null;
    if (this.el.roundDialog.open) this.el.roundDialog.close();
  }

  /* ---------------------------- Connection notices ---------------------------- */

  /**
   * Shows a banner while reconnecting, or a dialog when the host left.
   * @param notice - current connection notice
   * @returns nothing
   */
  private onNotice = (notice: ConnectionNotice): void => {
    this.el.notice.hidden = notice !== 'reconnecting';
    this.el.notice.textContent = notice === 'reconnecting' ? STRINGS.reconnecting : '';
    if (notice === 'hostLeft') {
      this.closeRoundDialog();
      if (this.el.suitDialog.open) this.el.suitDialog.close();
      if (!this.el.hostLeftDialog.open) this.el.hostLeftDialog.showModal();
    }
  };

  /* ---------------------------- Teardown ---------------------------- */

  /**
   * Re-lays out the hand when the window size changes.
   * @returns nothing
   */
  private onResize = (): void => this.layoutHand();

  /**
   * Leaves the table: stops the game, removes listeners, returns to the menu.
   * @returns nothing
   */
  private leave(): void {
    this.closeRoundDialog();
    if (this.el.hostLeftDialog.open) this.el.hostLeftDialog.close();
    this.unsubscribe();
    this.unsubscribeNotice();
    this.conn.close();
    this.root.removeEventListener('click', this.onClick);
    window.removeEventListener('resize', this.onResize);
    this.onLeave();
  }
}

/**
 * A small, stable rotation for a card on the discard pile (same card → same tilt),
 * so the pile looks hand-thrown without jumping around on re-render.
 * @param id - card id
 * @returns angle in degrees between -8 and 8
 */
function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 17) - 8;
}
