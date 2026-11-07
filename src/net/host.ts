/* ==========================================================================
   Host session
   The host's browser is the referee: it runs the GameController (engine +
   bots), accepts guests, applies their move intents, and sends every guest
   only their own VisibleState.

   Lobby phase: guests join/leave freely, the host adds/removes bots.
   Game phase: seats are fixed. A guest who drops out keeps their seat and
   can rejoin (same secret id from localStorage); the game waits on their turn.
   ========================================================================== */

import type { Difficulty } from '../bot/bot';
import { getVisibleState, redactEvents, type GameEvent, type GameState, type Rules } from '../engine';
import { GameController, type SeatConfig } from '../game/controller';
import type { TableConnection, ViewListener } from '../game/connection';
import { STRINGS } from '../i18n/strings';
import { cleanName, isGuestMessage, MAX_SEATS, type HostMessage, type LobbySeat, type RejectReason } from './protocol';
import type { Channel, HostTransport } from './transport';

/** Time for a reject message to arrive before the channel is closed. */
const REJECT_CLOSE_DELAY_MS = 1000;

interface HostSeat {
  publicId: string;
  name: string;
  kind: 'human' | 'bot';
  difficulty?: Difficulty;
  /** Secret id from the player's localStorage (humans only). Never sent to other players. */
  secretId?: string;
  /** Live channel for a connected guest; null for the host, bots, and offline guests. */
  channel: Channel | null;
  isHost: boolean;
}

/** Called when the lobby changes; `started` flips to true when the game begins. */
export type LobbyListener = (seats: LobbySeat[], started: boolean) => void;

export class HostSession {
  readonly roomId: string;
  readonly rules: Rules;
  private readonly transport: HostTransport;
  private readonly seats: HostSeat[];
  private controller: GameController | null = null;
  private readonly lobbyListeners = new Set<LobbyListener>();
  private readonly viewListeners = new Set<ViewListener>();
  /** Seat ids are never reused, so a stale message can't land on a new player. */
  private nextSeatNumber = 1;
  private closed = false;

  /**
   * Opens a room session.
   * @param transport - connected room (PeerJS or a test fake)
   * @param host - the host's secret id and name
   * @param rules - rules for this table
   * @param seed - RNG seed for the deal (random by default)
   */
  constructor(
    transport: HostTransport,
    host: { secretId: string; name: string },
    rules: Rules,
    private readonly seed: number = crypto.getRandomValues(new Uint32Array(1))[0],
  ) {
    this.transport = transport;
    this.roomId = transport.roomId;
    this.rules = rules;
    this.seats = [
      { publicId: 'seat-0', name: host.name, kind: 'human', secretId: host.secretId, channel: null, isHost: true },
    ];
    transport.onChannel((ch) => this.handleChannel(ch));
  }

  get started(): boolean {
    return this.controller !== null;
  }

  /* ---------------------------- Lobby ---------------------------- */

  /**
   * Public view of the seats (no secret ids).
   * @returns lobby seats in seat order
   */
  lobbySeats(): LobbySeat[] {
    return this.seats.map((s) => ({
      publicId: s.publicId,
      name: s.name,
      kind: s.kind,
      difficulty: s.difficulty,
      connected: this.isConnected(s),
      isHost: s.isHost,
    }));
  }

  /**
   * Subscribes to lobby changes; called immediately with the current lobby.
   * @param listener - callback
   * @returns unsubscribe function
   */
  onLobbyChange(listener: LobbyListener): () => void {
    this.lobbyListeners.add(listener);
    listener(this.lobbySeats(), this.started);
    return () => this.lobbyListeners.delete(listener);
  }

  /**
   * Adds a bot seat (lobby only).
   * @param difficulty - bot strength
   * @returns false if the table is full or the game has started
   */
  addBot(difficulty: Difficulty): boolean {
    if (this.started || this.seats.length >= MAX_SEATS) return false;
    const used = new Set(this.seats.map((s) => s.name));
    const name = STRINGS.botNames.find((n) => !used.has(n)) ?? `Bot ${this.nextSeatNumber}`;
    this.seats.push({ publicId: `seat-${this.nextSeatNumber++}`, name, kind: 'bot', difficulty, channel: null, isHost: false });
    this.broadcastLobby();
    return true;
  }

  /**
   * Removes a bot seat (lobby only).
   * @param publicId - the bot's seat id
   * @returns nothing
   */
  removeBot(publicId: string): void {
    if (this.started) return;
    const index = this.seats.findIndex((s) => s.publicId === publicId && s.kind === 'bot');
    if (index < 0) return;
    this.seats.splice(index, 1);
    this.broadcastLobby();
  }

  /**
   * Starts the game with the current seats.
   * @returns false if there are fewer than 2 seats or it already started
   */
  start(): boolean {
    if (this.started || this.closed || this.seats.length < 2) return false;
    const configs: SeatConfig[] = this.seats.map((s) =>
      s.kind === 'bot'
        ? { kind: 'bot', id: s.publicId, name: s.name, difficulty: s.difficulty ?? 'normal' }
        : { kind: 'human', id: s.publicId, name: s.name },
    );
    this.controller = new GameController(configs, this.rules, this.seed);
    this.lobbyListeners.forEach((l) => l(this.lobbySeats(), true));
    // subscribe() immediately emits the first deal, which reaches every guest.
    this.controller.subscribe((state, events, isNewDeal) => this.broadcastState(state, events, isNewDeal));
    return true;
  }

  /**
   * The host's own table connection (seat 0).
   * @returns a TableConnection for the host's UI
   */
  hostConnection(): TableConnection {
    const hostId = this.seats[0].publicId;
    return {
      playerId: hostId,
      rules: this.rules,
      canControlRounds: true,
      subscribe: (listener) => {
        this.viewListeners.add(listener);
        if (this.controller) {
          const state = this.controller.state;
          listener(getVisibleState(state, hostId), [], true, { connected: this.connectedList() });
        }
        return () => this.viewListeners.delete(listener);
      },
      submit: (move) => this.controller?.submit({ ...move, player: hostId }),
      nextRound: () => this.controller?.nextRound(),
      newMatch: () => this.controller?.newMatch(),
      close: () => this.close(),
    };
  }

  /**
   * Closes the room: tells every guest, then shuts down.
   * @returns nothing
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const seat of this.seats) seat.channel?.send({ t: 'bye' } satisfies HostMessage);
    this.controller?.dispose();
    this.transport.close();
    this.lobbyListeners.clear();
    this.viewListeners.clear();
  }

  /* ---------------------------- Guests ---------------------------- */

  /**
   * Handles a new guest channel: waits for "hello", then routes messages.
   * @param ch - the guest's channel
   * @returns nothing
   */
  private handleChannel(ch: Channel): void {
    let seat: HostSeat | null = null;
    ch.onMessage((raw) => {
      // Never trust guest data: anything malformed is ignored.
      if (this.closed || !isGuestMessage(raw)) return;
      if (!seat) {
        if (raw.t === 'hello') seat = this.admit(ch, raw.secretId, raw.name);
        return;
      }
      if (seat.channel !== ch) return; // replaced by a newer connection
      if (raw.t === 'move') {
        // The move always counts for the sender's own seat, whatever "player" it claims.
        this.controller?.submit({ ...raw.move, player: seat.publicId });
      } else if (raw.t === 'bye') {
        this.detach(seat, ch);
        ch.close();
      }
    });
    ch.onClose(() => {
      if (seat) this.detach(seat, ch);
    });
  }

  /**
   * Seats a guest (new or rejoining) or rejects them.
   * @param ch - guest channel
   * @param secretId - the guest's secret player id
   * @param rawName - the name they typed
   * @returns their seat, or null if rejected
   */
  private admit(ch: Channel, secretId: string, rawName: string): HostSeat | null {
    // Same browser as the host (e.g. the link opened in another tab of the host's browser).
    if (secretId === this.seats[0].secretId) return this.reject(ch, 'badHello');

    const existing = this.seats.find((s) => s.kind === 'human' && !s.isHost && s.secretId === secretId);
    if (existing) {
      // Rejoin: the newest connection wins.
      const old = existing.channel;
      existing.channel = ch;
      if (old && old !== ch) old.close();
      ch.send({ t: 'welcome', publicId: existing.publicId } satisfies HostMessage);
      this.broadcastPresence();
      return existing;
    }

    if (this.started) return this.reject(ch, 'started');
    if (this.seats.length >= MAX_SEATS) return this.reject(ch, 'full');

    const seat: HostSeat = {
      publicId: `seat-${this.nextSeatNumber++}`,
      name: cleanName(rawName, STRINGS.defaultName),
      kind: 'human',
      secretId,
      channel: ch,
      isHost: false,
    };
    this.seats.push(seat);
    ch.send({ t: 'welcome', publicId: seat.publicId } satisfies HostMessage);
    this.broadcastLobby();
    return seat;
  }

  /**
   * Sends a rejection and closes the channel shortly after.
   * @param ch - guest channel
   * @param reason - why
   * @returns null (for convenient `return this.reject(...)`)
   */
  private reject(ch: Channel, reason: RejectReason): null {
    ch.send({ t: 'reject', reason } satisfies HostMessage);
    setTimeout(() => ch.close(), REJECT_CLOSE_DELAY_MS);
    return null;
  }

  /**
   * A guest's channel closed. In the lobby they lose their seat;
   * in a running game they stay seated as "offline" and may rejoin.
   * @param seat - their seat
   * @param ch - the channel that closed
   * @returns nothing
   */
  private detach(seat: HostSeat, ch: Channel): void {
    if (seat.channel !== ch) return; // an older connection; a newer one is active
    seat.channel = null;
    if (!this.started) {
      const index = this.seats.indexOf(seat);
      if (index >= 0) this.seats.splice(index, 1);
      this.broadcastLobby();
    } else {
      this.broadcastPresence();
    }
  }

  /* ---------------------------- Broadcasting ---------------------------- */

  /**
   * Is this seat's player at the table right now?
   * @param s - seat
   * @returns true for the host, bots, and guests with a live channel
   */
  private isConnected(s: HostSeat): boolean {
    return s.isHost || s.kind === 'bot' || s.channel !== null;
  }

  /**
   * Connection flags in seat order.
   * @returns connected[seat]
   */
  private connectedList(): boolean[] {
    return this.seats.map((s) => this.isConnected(s));
  }

  /**
   * Sends the lobby to every guest and the host UI.
   * @returns nothing
   */
  private broadcastLobby(): void {
    const seats = this.lobbySeats();
    const msg: HostMessage = { t: 'lobby', seats, rules: this.rules };
    for (const s of this.seats) s.channel?.send(msg);
    this.lobbyListeners.forEach((l) => l(seats, this.started));
  }

  /**
   * Someone connected or dropped: refresh the lobby, or re-send the table
   * (without events) so everyone sees who is online.
   * @returns nothing
   */
  private broadcastPresence(): void {
    if (this.controller) this.broadcastState(this.controller.state, [], false);
    else this.broadcastLobby();
  }

  /**
   * Sends every player their own view of the game.
   * @param state - full state (never sent as a whole)
   * @param events - events of the last move
   * @param isNewDeal - true after dealing
   * @returns nothing
   */
  private broadcastState(state: GameState, events: GameEvent[], isNewDeal: boolean): void {
    const connected = this.connectedList();
    this.seats.forEach((seat, index) => {
      const view = getVisibleState(state, seat.publicId);
      const visibleEvents = redactEvents(events, index);
      if (seat.isHost) {
        this.viewListeners.forEach((l) => l(view, visibleEvents, isNewDeal, { connected }));
      } else if (seat.channel) {
        seat.channel.send({ t: 'state', view, events: visibleEvents, isNewDeal, connected, rules: this.rules } satisfies HostMessage);
      }
    });
  }
}
