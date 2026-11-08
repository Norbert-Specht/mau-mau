/* ==========================================================================
   Table view
   One player's view of the game on the felt table: opponents (avatars,
   counts, fans of backs), the piles, the wished-suit badge, the 7-penalty
   chip stack, the turn-marker die, your fanned hand and the Mau! button.

   Every update re-renders what changed, then animates it (theme/motion.ts):
   deals and plays fly along arcs, specials get a moment (chips pop, the
   skip stamp hits, the suit picker fans out), and Mau-Mau! ends in confetti.
   Deliberately no playing hints: cards don't show whether they fit.
   ========================================================================== */

import { canDraw, getPlayableCards, isWildJack, SUITS, type Card, type GameEvent, type Suit, type VisibleState } from '../engine';
import type { ConnectionNotice, TableConnection, TableMeta } from '../game/connection';
import { STRINGS, SUIT_NAMES } from '../i18n/strings';
import { createCardEl } from './cardView';
import { animalAvatar, BOT_ANIMALS, initialAvatar } from './theme/avatars';
import { confetti, flash, flyArc, pop, shake, stamp } from './theme/motion';
import { chipHtml, chipsFor, dieHtml } from './theme/props';
import { suitSvg } from './theme/suits';
import { playSound, setSoundEnabled, soundEnabled } from './sound';

/* ---------------------------- Constants ---------------------------- */

/** Most backs shown in an opponent's fan; their exact count is on the badge. */
const MAX_FAN = 6;
/** Discard cards drawn on screen (the rest are hidden underneath). */
const DISCARD_VISIBLE = 4;
/** Most chips in the 7-penalty stack (one per card to draw); the label has the exact number. */
const MAX_PENALTY_CHIPS = 8;
/** Pause before the end-of-round screen, so the last card lands and confetti flies first. */
const ROUND_PANEL_DELAY_MS = 1200;
/** Let a drawn Bube fly into the hand before the suit picker opens. */
const DRAWN_JACK_DELAY_MS = 600;
/** Delay between cards in multi-card flights (deal, draw 4, …). */
const STAGGER_MS = 70;
/** How long a reaction bubble stays readable. */
const BUBBLE_HOLD_MS = 1000;
/** Spots on the suit picker's arc, in degrees from vertical. */
const PICKER_ANGLES = [-60, -20, 20, 60];
/** Speaker icons for the sound toggle (sound on / muted). */
const SPEAKER = '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/>';
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Screen positions captured before a re-render, used to animate from. */
interface Snapshot {
  hand: Map<string, { rect: DOMRect; angle: number }>;
  draw: DOMRect;
  seats: Map<number, DOMRect>;
  fanCounts: Map<number, number>;
  current: number | null;
}

/** The parts of one opponent seat that change between updates. */
interface SeatParts {
  root: HTMLElement;
  avatar: HTMLElement;
  count: HTMLElement;
  name: HTMLElement;
  status: HTMLElement;
  fan: HTMLElement;
  marker: HTMLElement;
  bubble: HTMLElement;
  stamp: HTMLElement;
}

/**
 * Mounts the table UI.
 * @param root - container element (content replaced)
 * @param conn - connection to the game (local or remote)
 * @param onLeave - called after the player leaves via the menu
 * @returns nothing
 */
export function mountTable(root: HTMLElement, conn: TableConnection, onLeave: () => void): void {
  new TableView(root, conn, onLeave);
}

class TableView {
  private view: VisibleState | null = null;
  private meta: TableMeta = { connected: [], bots: [] };
  private seats = new Map<number, SeatParts>();
  /** The turn-marker die (one element that moves from seat to seat). */
  private readonly marker: HTMLElement;
  /** True while the suit picker for a drawn Bube is open (avoids opening it twice). */
  private drawnJackPending = false;
  private roundPanelTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeNotice: () => void;
  private readonly el: {
    round: HTMLElement;
    sound: HTMLButtonElement;
    opponents: HTMLElement;
    draw: HTMLButtonElement;
    discard: HTMLElement;
    wish: HTMLElement;
    wishDisc: HTMLElement;
    penalty: HTMLElement;
    penaltyStack: HTMLElement;
    penaltyLabel: HTMLElement;
    penaltyBubble: HTMLElement;
    status: HTMLElement;
    me: HTMLElement;
    meBubble: HTMLElement;
    meStamp: HTMLElement;
    meMarker: HTMLElement;
    drawBtn: HTMLButtonElement;
    mau: HTMLButtonElement;
    hand: HTMLElement;
    picker: HTMLElement;
    pickerOverlay: HTMLElement;
    pickerCancel: HTMLButtonElement;
    roundOverlay: HTMLElement;
    roundPanel: HTMLElement;
    notice: HTMLElement;
    hostLeftOverlay: HTMLElement;
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
      <div class="game felt felt--rim">
        <!-- Connection banner (multiplayer guests) -->
        <div class="notice" role="status" hidden></div>

        <!-- Top bar: menu and round number -->
        <header class="game__bar">
          <button type="button" class="btn btn--ghost btn--small" data-action="menu">${STRINGS.menu}</button>
          <span class="game__round"></span>
          <button type="button" class="icon-btn" data-action="sound"></button>
        </header>

        <!-- Opponents: a row on phones, around the table on wide screens -->
        <section class="game__opponents"></section>

        <!-- Center: draw pile, discard pile, wished suit, 7-penalty chips -->
        <section class="game__center">
          <button type="button" class="pile pile--draw" data-action="draw"></button>
          <div class="pile pile--discard"></div>
          <div class="game__side">
            <div class="suit-badge" hidden><span class="suit-badge__disc"></span>${STRINGS.wishLabel}</div>
            <div class="penalty" hidden>
              <span class="penalty__bubble bubble"></span>
              <span class="chip-stack"></span>
              <span class="penalty__label"></span>
            </div>
          </div>
        </section>

        <!-- Whose turn -->
        <p class="game__status" aria-live="polite"></p>

        <!-- You: speech bubble, skip stamp, buttons, hand -->
        <section class="me">
          <span class="bubble-slot me__bubble"><span class="bubble bubble--big"></span></span>
          <span class="stamp-slot me__stamp"><span class="stamp">${STRINGS.skipStamp}</span></span>
          <div class="me__actions">
            <span class="seat__marker me__marker"></span>
            <button type="button" class="btn" data-action="draw"></button>
            <button type="button" class="mau-btn" data-action="mau">${STRINGS.mauButton}</button>
          </div>
          <div class="hand"></div>
        </section>
      </div>

      <!-- Suit picker: four tokens fan out ("Ich wünsche mir…") -->
      <div class="overlay picker-overlay" hidden>
        <div class="picker-wrap">
          <div class="suit-picker">
            ${SUITS.map((s, i) => `<button type="button" class="suit-token" data-suit="${s}" aria-label="${SUIT_NAMES[s]}" style="--angle:${PICKER_ANGLES[i]}deg;transition-delay:${i * 45}ms">${suitSvg(s)}</button>`).join('')}
            <span class="suit-picker__title">${STRINGS.pickSuitTitle}</span>
          </div>
          <button type="button" class="btn btn--ghost" data-suit="">${STRINGS.cancel}</button>
        </div>
      </div>

      <!-- End of round / match -->
      <div class="overlay round-overlay" hidden><div class="panel end-panel" role="dialog" aria-modal="true"></div></div>

      <!-- Host closed the game (multiplayer guests) -->
      <div class="overlay host-left-overlay" hidden>
        <div class="panel end-panel" role="alertdialog" aria-modal="true">
          <h2>${STRINGS.hostLeftTitle}</h2>
          <p>${STRINGS.hostLeft}</p>
          <button type="button" class="btn btn--primary" data-host-left>${STRINGS.backToMenu}</button>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    this.el = {
      round: q('.game__round'),
      sound: q('[data-action="sound"]'),
      opponents: q('.game__opponents'),
      draw: q('.pile--draw'),
      discard: q('.pile--discard'),
      wish: q('.suit-badge'),
      wishDisc: q('.suit-badge__disc'),
      penalty: q('.penalty'),
      penaltyStack: q('.penalty .chip-stack'),
      penaltyLabel: q('.penalty__label'),
      penaltyBubble: q('.penalty__bubble'),
      status: q('.game__status'),
      me: q('.me'),
      meBubble: q('.me__bubble'),
      meStamp: q('.me__stamp'),
      meMarker: q('.me__marker'),
      drawBtn: q('.me__actions [data-action="draw"]'),
      mau: q('.me__actions [data-action="mau"]'),
      hand: q('.hand'),
      picker: q('.suit-picker'),
      pickerOverlay: q('.picker-overlay'),
      pickerCancel: q('.picker-overlay [data-suit=""]'),
      roundOverlay: q('.round-overlay'),
      roundPanel: q('.round-overlay .end-panel'),
      notice: q('.notice'),
      hostLeftOverlay: q('.host-left-overlay'),
    };

    this.marker = document.createElement('span');
    this.marker.className = 'turn-die';
    this.marker.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6));

    this.renderSoundButton();
    root.addEventListener('click', this.onClick);
    window.addEventListener('resize', this.onResize);
    this.el.hostLeftOverlay.querySelector('[data-host-left]')!.addEventListener('click', () => this.leave());
    this.unsubscribe = conn.subscribe(this.onUpdate);
    this.unsubscribeNotice = conn.subscribeNotice?.(this.onNotice) ?? (() => {});
  }

  /* ---------------------------- Updates ---------------------------- */

  /**
   * Handles a new view: render, animate, then any follow-ups (picker, end screen).
   * @param view - the new visible state
   * @param events - events that led to it
   * @param isNewDeal - true when cards were just dealt
   * @param meta - who is online and who is a bot
   * @returns nothing
   */
  private onUpdate = (view: VisibleState, events: GameEvent[], isNewDeal: boolean, meta: TableMeta): void => {
    const before = this.snapshot();
    this.view = view;
    this.meta = meta;
    if (isNewDeal) this.closeRoundPanel();

    this.render();
    this.animate(before, events, isNewDeal);
    void this.playDrawnJack();

    if ((view.phase === 'roundOver' || view.phase === 'matchOver') && !this.roundPanelTimer && this.el.roundOverlay.hidden) {
      this.roundPanelTimer = setTimeout(() => this.showRoundPanel(), ROUND_PANEL_DELAY_MS);
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

    this.el.round.textContent = STRINGS.roundLabel(v.round, rules.scoring ? rules.roundsPerMatch : null);
    this.renderSeats(v);

    // Draw pile: three backs for thickness (fewer when nearly empty) and the count.
    this.el.draw.replaceChildren(
      ...Array.from({ length: Math.min(3, v.drawPileCount) }, () => createCardEl(null)),
      Object.assign(document.createElement('span'), { className: 'pile__count', textContent: String(v.drawPileCount) }),
    );
    this.el.draw.setAttribute('aria-label', STRINGS.drawPileLabel(v.drawPileCount));
    this.el.draw.disabled = !canDraw(v);

    // Discard pile: the last few cards, each at its own small tilt.
    const visible = v.discardPile.slice(-DISCARD_VISIBLE);
    this.el.discard.replaceChildren(
      ...visible.map((card, i) => {
        const slot = document.createElement('div');
        slot.className = 'pile__slot';
        slot.style.setProperty('--rot', `${tiltFor(card.id)}deg`);
        if (i === visible.length - 1) slot.classList.add('pile__slot--top');
        slot.appendChild(createCardEl(card));
        return slot;
      }),
    );

    // Wished suit badge (only after a Bube, until the next card).
    this.el.wish.hidden = !v.wishedSuit;
    if (v.wishedSuit && this.el.wish.dataset.suit !== v.wishedSuit) {
      this.el.wishDisc.innerHTML = suitSvg(v.wishedSuit);
      this.el.wishDisc.setAttribute('aria-label', SUIT_NAMES[v.wishedSuit]);
    }
    this.el.wish.dataset.suit = v.wishedSuit ?? '';

    // 7-penalty: one chip per card to draw.
    this.el.penalty.hidden = v.pendingDraw === 0;
    const chips = Math.min(v.pendingDraw, MAX_PENALTY_CHIPS);
    this.el.penaltyStack.innerHTML = Array.from({ length: chips }, (_, i) =>
      chipHtml('red', i === chips - 1 ? STRINGS.pendingDraw(v.pendingDraw) : '', i),
    ).join('');
    this.el.penaltyLabel.textContent = STRINGS.penaltyLabel(v.pendingDraw);

    // Status line and "it's you" glow.
    this.el.status.textContent = this.statusText(v);
    this.el.status.classList.toggle('game__status--yours', myTurn);
    this.el.me.classList.toggle('me--active', myTurn);

    // Buttons.
    this.el.drawBtn.textContent = v.pendingDraw > 0 ? STRINGS.drawPenalty(v.pendingDraw) : STRINGS.draw;
    this.el.drawBtn.disabled = !canDraw(v);
    this.el.mau.hidden = !rules.mauRequired;
    this.el.mau.disabled = !myTurn;
    this.el.mau.classList.toggle('mau-btn--pressed', myTurn && v.mauCalled);
    this.el.mau.setAttribute('aria-pressed', String(myTurn && v.mauCalled));

    this.renderHand(v, myTurn);
  }

  /**
   * Creates the opponent seats once, then updates them in place, so bubbles
   * and stamps aren't cut off by the next update.
   * @param v - current view
   * @returns nothing
   */
  private renderSeats(v: VisibleState): void {
    const n = v.players.length;
    const order = Array.from({ length: n - 1 }, (_, k) => (v.you + 1 + k) % n);
    // Positions around the table on wide screens (clockwise from your left).
    const positions = order.length === 1 ? ['top'] : order.length === 2 ? ['left', 'right'] : ['left', 'top', 'right'];

    if (this.seats.size !== order.length) {
      this.seats.clear();
      this.el.opponents.replaceChildren(
        ...order.map((seat, k) => {
          const parts = this.buildSeat(seat, positions[k]);
          this.seats.set(seat, parts);
          return parts.root;
        }),
      );
    }

    for (const seat of order) {
      const parts = this.seats.get(seat)!;
      const p = v.players[seat];
      const online = this.meta.connected[seat] !== false;
      parts.root.classList.toggle('seat--active', seat === v.current && (v.phase === 'playing' || v.phase === 'drawn'));
      parts.root.classList.toggle('seat--offline', !online);
      parts.count.textContent = String(p.cardCount);
      parts.count.setAttribute('aria-label', STRINGS.cardsLeft(p.cardCount));
      parts.status.textContent = online ? '' : STRINGS.offlineBadge;
      if (parts.name.textContent !== p.name) parts.name.textContent = p.name;
      parts.avatar.innerHTML = this.avatarFor(seat);

      const shown = Math.min(p.cardCount, MAX_FAN);
      if (parts.fan.childElementCount !== shown) {
        parts.fan.replaceChildren(
          ...Array.from({ length: shown }, (_, i) => {
            const back = createCardEl(null, 'div', 'card--mini');
            back.style.setProperty('--fan', `${(i - (shown - 1) / 2) * 7}deg`);
            return back;
          }),
        );
      }
    }

    this.placeMarker(v);
  }

  /**
   * Builds one opponent seat's elements.
   * @param seat - seat index
   * @param pos - where it sits on wide screens (left / top / right)
   * @returns the seat's parts
   */
  private buildSeat(seat: number, pos: string): SeatParts {
    const root = document.createElement('div');
    root.className = 'seat';
    root.dataset.seat = String(seat);
    root.dataset.pos = pos;
    root.innerHTML = `
      <span class="bubble-slot"><span class="bubble"></span></span>
      <span class="stamp-slot"><span class="stamp">${STRINGS.skipStamp}</span></span>
      <div class="avatar"></div>
      <span class="seat__count"></span>
      <span class="seat__marker"></span>
      <span class="seat__name"></span>
      <span class="seat__status"></span>
      <div class="seat__fan"></div>`;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    return {
      root,
      avatar: q('.avatar'),
      count: q('.seat__count'),
      name: q('.seat__name'),
      status: q('.seat__status'),
      fan: q('.seat__fan'),
      marker: q('.seat__marker'),
      bubble: q('.bubble-slot'),
      stamp: q('.stamp-slot'),
    };
  }

  /**
   * Avatar markup: animals for bots (in bot order), initials for people.
   * @param seat - seat index
   * @returns SVG markup
   */
  private avatarFor(seat: number): string {
    if (this.meta.bots[seat]) {
      const botIndex = this.meta.bots.slice(0, seat).filter(Boolean).length;
      return animalAvatar(BOT_ANIMALS[botIndex % BOT_ANIMALS.length]);
    }
    return initialAvatar(this.view!.players[seat].name);
  }

  /**
   * Puts the turn-marker die next to whoever's turn it is.
   * @param v - current view
   * @returns nothing
   */
  private placeMarker(v: VisibleState): void {
    const playing = v.phase === 'playing' || v.phase === 'drawn';
    const slot = !playing ? null : v.current === v.you ? this.el.meMarker : this.seats.get(v.current)?.marker;
    if (!slot) {
      this.marker.remove();
      return;
    }
    if (this.marker.parentElement !== slot) slot.appendChild(this.marker);
  }

  /**
   * Draws your hand as a fan. On your turn every card is clickable; there is
   * deliberately no hint which ones fit (a card that doesn't fit does nothing).
   * @param v - current view
   * @param myTurn - whether you may act now
   * @returns nothing
   */
  private renderHand(v: VisibleState, myTurn: boolean): void {
    this.el.hand.replaceChildren(
      ...v.hand.map((card) => {
        const slot = document.createElement('div');
        slot.className = 'hand__slot';
        const btn = createCardEl(card, 'button', 'card--interactive') as HTMLButtonElement;
        btn.dataset.action = 'play';
        btn.disabled = !myTurn;
        slot.appendChild(btn);
        return slot;
      }),
    );
    this.layoutHand();
  }

  /**
   * Spaces and rotates the hand cards to fit the width. Cards overlap more
   * as the hand grows (no wrapping, no layout shift); past a minimum overlap
   * the hand scrolls sideways.
   * @returns nothing
   */
  private layoutHand(): void {
    const slots = [...this.el.hand.children] as HTMLElement[];
    const n = slots.length;
    if (n === 0) return;
    const card = slots[0].firstElementChild as HTMLElement;
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;
    // Fan: up to 6° between cards, at most ~36° in total.
    const spread = Math.min(6, 36 / n);
    const mid = (n - 1) / 2;
    // Outer cards rotate around a point 130% down the card (see .hand__slot),
    // so their top corners swing out by about 1.3 × height × sin(angle).
    const swing = 1.3 * cardH * Math.sin((spread * mid * Math.PI) / 180);
    const avail = this.el.hand.clientWidth - 24 - 2 * swing; // 24 = .hand side padding
    // Loose overlap like the reference (≈60% of a card visible) when there's room;
    // never less than 22% visible so the corner index stays readable.
    const step = n > 1 ? Math.max(cardW * 0.22, Math.min(cardW * 0.62, (avail - cardW) / (n - 1))) : cardW;
    this.el.hand.style.setProperty('--step', `${step}px`);
    slots.forEach((slot, i) => {
      const offset = i - mid;
      slot.style.setProperty('--fan', `${offset * spread}deg`);
      // Outer cards sit a little lower, like a hand of cards held up.
      slot.style.setProperty('--drop', `${offset * offset * spread * 0.22}px`);
    });
  }

  /**
   * The one-line status: whose turn, or who won.
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
    return STRINGS.yourTurn;
  }

  /* ---------------------------- Animation ---------------------------- */

  /**
   * Records where things are before a re-render.
   * @returns the snapshot
   */
  private snapshot(): Snapshot {
    const hand = new Map<string, { rect: DOMRect; angle: number }>();
    this.el.hand.querySelectorAll<HTMLElement>('.hand__slot').forEach((slot) => {
      const card = slot.firstElementChild as HTMLElement;
      hand.set(card.dataset.cardId!, {
        rect: card.getBoundingClientRect(),
        angle: parseFloat(slot.style.getPropertyValue('--fan')) || 0,
      });
    });
    const seats = new Map<number, DOMRect>();
    const fanCounts = new Map<number, number>();
    this.seats.forEach((parts, seat) => {
      seats.set(seat, parts.avatar.getBoundingClientRect());
      fanCounts.set(seat, parts.fan.childElementCount);
    });
    return {
      hand,
      draw: this.el.draw.getBoundingClientRect(),
      seats,
      fanCounts,
      current: this.view ? this.view.current : null,
    };
  }

  /**
   * Animates the changes between the snapshot and the new render.
   * @param before - positions before the update
   * @param events - what happened
   * @param isNewDeal - whether cards were just dealt
   * @returns nothing
   */
  private animate(before: Snapshot, events: GameEvent[], isNewDeal: boolean): void {
    const v = this.view!;
    const rules = this.conn.rules;
    const handCards = [...this.el.hand.querySelectorAll<HTMLElement>('.card')];

    if (isNewDeal) {
      this.animateDeal(before.draw, handCards);
      return;
    }

    let drawDelay = 0;
    for (const e of events) {
      switch (e.type) {
        case 'played': {
          const top = this.el.discard.querySelector<HTMLElement>('.pile__slot--top .card');
          // Your card flies from its old spot in your hand (or from the draw pile
          // if it was drawn and auto-played); an opponent's from their avatar.
          const mine = before.hand.get(e.card.id);
          const from = e.seat === v.you ? (mine?.rect ?? before.draw) : before.seats.get(e.seat);
          if (top && from) flyArc(top, from, { fromRotate: e.seat === v.you ? (mine?.angle ?? 0) : 0 });
          playSound('swish');

          if (e.card.rank === '7' && rules.sevenDrawTwo && v.pendingDraw > 0) this.popPenalty();
          if (isWildJack(e.card, rules) && e.wish) pop(this.el.wishDisc, 380);
          // Bots gloat when they hit someone with a 7 or an 8.
          const hits = (e.card.rank === '7' && rules.sevenDrawTwo) || (e.card.rank === '8' && rules.eightSkips);
          if (hits && this.meta.bots[e.seat]) this.say(e.seat, STRINGS.reactionHa, 450);
          break;
        }
        case 'drew': {
          playSound('swish', drawDelay);
          if (e.seat === v.you) {
            for (const c of e.cards) {
              const el = handCards.find((h) => h.dataset.cardId === c.id);
              if (el) flyArc(el, before.draw, { delay: drawDelay });
              drawDelay += STAGGER_MS;
            }
          } else {
            const fan = this.seats.get(e.seat)?.fan;
            const added = (fan?.childElementCount ?? 0) - (before.fanCounts.get(e.seat) ?? 0);
            const backs = fan ? ([...fan.children] as HTMLElement[]).slice(-Math.max(added, Math.min(e.count, 1))) : [];
            backs.forEach((b, i) => flyArc(b, before.draw, { delay: i * STAGGER_MS, duration: 420 }));
          }
          if (e.reason === 'mau') this.mauPenalty(e.seat);
          if (e.reason === 'seven' && this.meta.bots[e.seat]) this.say(e.seat, STRINGS.reactionOhNo, 300);
          break;
        }
        case 'skipped': {
          stamp(e.seat === v.you ? this.el.meStamp : this.seats.get(e.seat)!.stamp);
          playSound('stamp', 220); // when the stamp hits (see motion.stamp)
          if (this.meta.bots[e.seat]) this.say(e.seat, STRINGS.reactionOhNo, 900);
          break;
        }
        case 'mau':
          // Bots always call Mau; only show it when the Mau rule is in play.
          if (rules.mauRequired) {
            this.say(e.seat, STRINGS.mauButton);
            playSound('mau');
          }
          break;
        case 'roundOver': {
          const pile = this.el.discard.getBoundingClientRect();
          setTimeout(() => confetti({ x: pile.left + pile.width / 2, y: pile.top + pile.height / 2 }), 450);
          playSound('win', 450);
          break;
        }
        default:
          break;
      }
    }

    // The turn marker rolls over to the next player.
    if (before.current !== null && before.current !== v.current && this.marker.isConnected) {
      this.rollMarker(before);
    }

    // Cards that stayed in your hand slide to their new spots.
    for (const el of handCards) {
      const old = before.hand.get(el.dataset.cardId!);
      if (old) {
        const now = el.getBoundingClientRect();
        const dx = old.rect.left - now.left;
        const dy = old.rect.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) > 1) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 260,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          });
        }
      }
    }
  }

  /**
   * Deal: cards fly from the draw pile, round by round, to every player.
   * @param from - draw pile position
   * @param handCards - your new hand's card elements
   * @returns nothing
   */
  private animateDeal(from: DOMRect, handCards: HTMLElement[]): void {
    const v = this.view!;
    const n = v.players.length;
    let maxDelay = 0;
    // Deal order: one card at a time around the table, starting after you.
    for (let round = 0; round < Math.max(MAX_FAN, handCards.length); round++) {
      for (let k = 1; k <= n; k++) {
        const seat = (v.you + k) % n;
        const delay = (round * n + k - 1) * STAGGER_MS;
        if (seat === v.you) {
          if (handCards[round]) flyArc(handCards[round], from, { delay });
        } else {
          const back = this.seats.get(seat)?.fan.children[round] as HTMLElement | undefined;
          if (back) flyArc(back, from, { delay, duration: 420 });
        }
        maxDelay = Math.max(maxDelay, delay);
        // A swish for every other card keeps the sound lively without a wall of noise.
        if ((round * n + k) % 2 === 0 && (seat === v.you ? handCards[round] : this.seats.get(seat)?.fan.children[round])) {
          playSound('swish', delay);
        }
      }
    }
    // Finally the starting card is turned up.
    const top = this.el.discard.querySelector<HTMLElement>('.pile__slot--top .card');
    if (top) flyArc(top, from, { delay: maxDelay + STAGGER_MS * 2 });
  }

  /**
   * Moves the die from the previous player's seat to the new one, rolling it.
   * @param before - snapshot with the previous player
   * @returns nothing
   */
  private rollMarker(before: Snapshot): void {
    const v = this.view!;
    const fromSeat = before.current!;
    const fromRect = fromSeat === v.you ? this.el.meMarker.getBoundingClientRect() : before.seats.get(fromSeat);
    this.marker.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6));
    if (fromRect) flyArc(this.marker, fromRect, { fromRotate: -180, duration: 480 });
  }

  /**
   * The 7-penalty stack grows: new chips pop in and a "+2" bubble appears.
   * @returns nothing
   */
  private popPenalty(): void {
    const chips = [...this.el.penaltyStack.children];
    chips.slice(-2).forEach((chip, i) => pop(chip, i * 90));
    playSound('clack', 120);
    this.el.penaltyBubble.textContent = STRINGS.pendingDraw(2);
    this.el.penaltyBubble.getAnimations().forEach((a) => a.cancel());
    flash(this.el.penaltyBubble, 700);
  }

  /**
   * Forgot to say Mau: the player's cards shake and an opponent teases them.
   * @param seat - the penalized seat
   * @returns nothing
   */
  private mauPenalty(seat: number): void {
    const v = this.view!;
    shake(seat === v.you ? this.el.hand : this.seats.get(seat)!.root);
    // The tease comes from the next opponent after the penalized player (not you).
    const n = v.players.length;
    for (let k = 1; k < n; k++) {
      const teaser = (seat + k) % n;
      if (teaser !== v.you && teaser !== seat) {
        this.say(teaser, STRINGS.cheekyMau, 350);
        return;
      }
    }
  }

  /**
   * Shows a speech bubble above a player (or above your hand).
   * @param seat - who speaks
   * @param text - what they say
   * @param delay - wait before showing, in ms
   * @returns nothing
   */
  private say(seat: number, text: string, delay = 0): void {
    const slot = seat === this.view!.you ? this.el.meBubble : this.seats.get(seat)?.bubble;
    if (!slot) return;
    setTimeout(() => {
      slot.firstElementChild!.textContent = text;
      slot.getAnimations().forEach((a) => a.cancel());
      flash(slot, BUBBLE_HOLD_MS);
    }, delay);
  }

  /**
   * Shows the speaker icon for the current sound setting.
   * @returns nothing
   */
  private renderSoundButton(): void {
    const on = soundEnabled();
    this.el.sound.innerHTML = on ? ICON_SOUND_ON : ICON_SOUND_OFF;
    this.el.sound.setAttribute('aria-pressed', String(on));
    this.el.sound.setAttribute('aria-label', on ? STRINGS.soundOn : STRINGS.soundOff);
    this.el.sound.title = on ? STRINGS.soundOn : STRINGS.soundOff;
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
      case 'sound':
        setSoundEnabled(!soundEnabled());
        this.renderSoundButton();
        playSound('clack');
        break;
      case 'draw':
        if (canDraw(v)) this.conn.submit({ type: 'draw', player });
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
   * A card that doesn't fit is ignored (no hint, no suit picker).
   * @param card - the clicked card
   * @returns resolves when the move was sent (or cancelled)
   */
  private async play(card: Card): Promise<void> {
    const v = this.view!;
    if (!getPlayableCards(v, this.conn.rules).some((c) => c.id === card.id)) return;
    let wish: Suit | undefined;
    if (isWildJack(card, this.conn.rules) && v.hand.length > 1) {
      const picked = await this.pickSuit();
      if (!picked) return;
      wish = picked;
    }
    this.conn.submit({ type: 'play', player: this.conn.playerId, cardId: card.id, wish });
  }

  /**
   * A drawn Bube that fits is played automatically, but you name the suit:
   * opens the suit picker (no Cancel) and plays the Bube with your choice.
   * @returns resolves when done (or when there is nothing to do)
   */
  private async playDrawnJack(): Promise<void> {
    const v = this.view;
    if (!v || this.drawnJackPending || v.phase !== 'drawn' || v.current !== v.you || !v.drawnCardId) return;
    const cardId = v.drawnCardId;
    this.drawnJackPending = true;
    await new Promise((r) => setTimeout(r, DRAWN_JACK_DELAY_MS));
    const wish = await this.pickSuit(false);
    this.drawnJackPending = false;
    // null = the table was closed meanwhile (e.g. the host left).
    if (wish) this.conn.submit({ type: 'play', player: this.conn.playerId, cardId, wish });
  }

  /**
   * Opens the suit picker: four tokens fan out of the middle.
   * @param cancellable - false hides Cancel and ignores Escape (for a drawn Bube)
   * @returns the chosen suit, or null if cancelled / closed
   */
  private pickSuit(cancellable = true): Promise<Suit | null> {
    const overlay = this.el.pickerOverlay;
    this.el.pickerCancel.hidden = !cancellable;
    overlay.hidden = false;
    // Open on the next frame so the fan-out transition starts from the stacked state.
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.picker.classList.add('suit-picker--open')));
    (overlay.querySelector('.suit-token') as HTMLElement).focus({ preventScroll: true });

    return new Promise((resolve) => {
      const finish = (suit: Suit | null) => {
        overlay.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        this.el.picker.classList.remove('suit-picker--open');
        overlay.hidden = true;
        this.closePicker = null;
        resolve(suit);
      };
      const onClick = (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-suit]');
        if (btn) finish((btn.dataset.suit || null) as Suit | null);
        else if (cancellable && e.target === overlay) finish(null); // tap outside = cancel
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && cancellable) finish(null);
      };
      overlay.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      this.closePicker = () => finish(null);
    });
  }

  /** Closes an open suit picker (used when leaving or when the host leaves). */
  private closePicker: (() => void) | null = null;

  /* ---------------------------- End of round ---------------------------- */

  /**
   * Shows the end-of-round (or match) screen with everyone's points as chips.
   * @returns nothing
   */
  private showRoundPanel(): void {
    this.roundPanelTimer = null;
    const v = this.view;
    if (!v || (v.phase !== 'roundOver' && v.phase !== 'matchOver')) return;
    const scoring = this.conn.rules.scoring;
    const winner = v.roundWinner ?? 0;
    const matchOver = v.phase === 'matchOver';
    const headline = matchOver
      ? STRINGS.matchWinner(
          (v.matchWinners ?? []).map((s) => (s === v.you ? STRINGS.you : v.players[s].name)),
          (v.matchWinners ?? []).includes(v.you),
        )
      : STRINGS.roundWinner(v.players[winner].name, winner === v.you);

    const panel = this.el.roundPanel;
    panel.innerHTML = `
      <div class="end-panel__title">${STRINGS.mauMau}</div>
      <p class="end-panel__headline"></p>
      <div class="end-panel__rows"></div>
      ${this.conn.canControlRounds ? '' : `<p class="end-panel__wait">${STRINGS.waitingForHostNext}</p>`}
      <div class="end-panel__buttons">
        ${this.conn.canControlRounds ? `<button type="button" class="btn btn--primary btn--big" data-next>${matchOver ? STRINGS.newMatch : STRINGS.nextRound}</button>` : ''}
        <button type="button" class="btn" data-leave>${STRINGS.backToMenu}</button>
      </div>`;
    panel.querySelector('.end-panel__headline')!.textContent = headline;

    // Rows from best to worst; names are user input, so they go in via textContent.
    const points = v.lastRoundPoints ?? v.players.map(() => 0);
    const seatsByScore = v.players.map((_, s) => s).sort((a, b) => (scoring ? v.scores[a] - v.scores[b] : points[a] - points[b]));
    const rows = panel.querySelector('.end-panel__rows')!;
    for (const seat of seatsByScore) {
      const row = document.createElement('div');
      row.className = `score-row ${seat === winner ? 'score-row--winner' : ''}`;
      row.innerHTML = `<div class="avatar">${this.avatarFor(seat)}</div><span class="score-row__name"></span>
        <span class="score-row__points"><span class="chips-inline">${chipsFor(points[seat])}</span><span>${points[seat]}</span>${
          scoring ? `<span class="score-row__total">${STRINGS.pointsTotal} ${v.scores[seat]}</span>` : ''
        }</span>`;
      row.querySelector('.score-row__name')!.textContent = seat === v.you ? `${v.players[seat].name} (${STRINGS.you})` : v.players[seat].name;
      rows.appendChild(row);
    }

    panel.querySelector('[data-next]')?.addEventListener('click', () => {
      this.closeRoundPanel();
      if (matchOver) this.conn.newMatch();
      else this.conn.nextRound();
    });
    panel.querySelector('[data-leave]')!.addEventListener('click', () => this.leave());

    this.el.roundOverlay.hidden = false;
    pop(panel);
    panel.querySelectorAll('.chips-inline .chip').forEach((chip, i) => pop(chip, 250 + i * 50));
  }

  /**
   * Hides the end-of-round screen and cancels a pending one.
   * @returns nothing
   */
  private closeRoundPanel(): void {
    if (this.roundPanelTimer) clearTimeout(this.roundPanelTimer);
    this.roundPanelTimer = null;
    this.el.roundOverlay.hidden = true;
  }

  /* ---------------------------- Connection notices ---------------------------- */

  /**
   * Shows a banner while reconnecting, or a panel when the host left.
   * @param notice - current connection notice
   * @returns nothing
   */
  private onNotice = (notice: ConnectionNotice): void => {
    this.el.notice.hidden = notice !== 'reconnecting';
    this.el.notice.textContent = notice === 'reconnecting' ? STRINGS.reconnecting : '';
    if (notice === 'hostLeft') {
      this.closeRoundPanel();
      this.closePicker?.();
      this.el.hostLeftOverlay.hidden = false;
      pop(this.el.hostLeftOverlay.firstElementChild!);
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
    this.closeRoundPanel();
    this.closePicker?.();
    this.unsubscribe();
    this.unsubscribeNotice();
    this.conn.close();
    this.root.removeEventListener('click', this.onClick);
    window.removeEventListener('resize', this.onResize);
    this.onLeave();
  }
}

/**
 * A small, stable tilt for a card on the discard pile (same card → same
 * angle), so the pile looks hand-thrown without jumping around on re-render.
 * @param id - card id
 * @returns angle in degrees between -3 and 3
 */
function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 61) / 10 - 3;
}
