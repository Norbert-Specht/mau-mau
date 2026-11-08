/* ==========================================================================
   Guest session
   Connects to a host, says hello, shows the lobby, then forwards move
   intents and receives this player's VisibleState. If the connection drops
   without the host saying goodbye, it retries; if the room is gone, the
   player is told the host left.
   ========================================================================== */

import type { GameEvent, Rules, VisibleState } from '../engine';
import type { ConnectionNotice, TableConnection, TableMeta, ViewListener } from '../game/connection';
import { isHostMessage, type GuestMessage, type HostMessage, type LobbySeat, type RejectReason } from './protocol';
import type { Channel, ConnectError, ConnectFn } from './transport';

/** Waits between reconnect attempts (ms). After the last one, we give up. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

export type GuestStatus =
  | { kind: 'connecting' }
  | { kind: 'lobby'; seats: LobbySeat[]; publicId: string }
  | { kind: 'playing' }
  | { kind: 'rejected'; reason: RejectReason }
  | { kind: 'notFound' }
  | { kind: 'hostLeft' }
  | { kind: 'error' };

interface LatestState {
  view: VisibleState;
  events: GameEvent[];
  isNewDeal: boolean;
  meta: TableMeta;
}

export class GuestSession {
  private channel: Channel | null = null;
  private publicId: string | null = null;
  private rules: Rules | null = null;
  private latest: LatestState | null = null;
  private status: GuestStatus = { kind: 'connecting' };
  private notice: ConnectionNotice = null;
  private readonly statusListeners = new Set<(s: GuestStatus) => void>();
  private readonly viewListeners = new Set<ViewListener>();
  private readonly noticeListeners = new Set<(n: ConnectionNotice) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** True once we leave or the session ends for good; stops reconnecting. */
  private ended = false;

  /**
   * @param connect - opens a channel to a room (PeerJS or a test fake)
   * @param roomId - room code from the link
   * @param profile - this browser's secret id and the player's name
   */
  constructor(
    private readonly connect: ConnectFn,
    readonly roomId: string,
    private readonly profile: { id: string; name: string },
  ) {}

  /**
   * Starts connecting.
   * @returns nothing
   */
  start(): void {
    void this.attempt(0);
  }

  /**
   * Subscribes to status changes; called immediately with the current status.
   * @param listener - callback
   * @returns unsubscribe function
   */
  onStatus(listener: (s: GuestStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Leaves on purpose: tells the host and stops reconnecting.
   * @returns nothing
   */
  leave(): void {
    this.ended = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.send({ t: 'bye' });
    this.channel?.close();
    this.channel = null;
    this.statusListeners.clear();
    this.viewListeners.clear();
    this.noticeListeners.clear();
  }

  /**
   * The table connection for this guest. Use once status is "playing".
   * @returns a TableConnection
   */
  tableConnection(): TableConnection {
    // Captured as non-null: "playing" is only reached after welcome + first state.
    const playerId = this.publicId ?? '';
    const rules = this.rules!;
    return {
      playerId,
      rules,
      canControlRounds: false,
      subscribe: (listener) => {
        this.viewListeners.add(listener);
        // A fresh table gets the latest state as a new deal (no animations to replay).
        if (this.latest) listener(this.latest.view, [], true, this.latest.meta);
        return () => this.viewListeners.delete(listener);
      },
      subscribeNotice: (listener) => {
        this.noticeListeners.add(listener);
        listener(this.notice);
        return () => this.noticeListeners.delete(listener);
      },
      // The host replaces "player" with our seat anyway; we send ours for clarity.
      submit: (move) => this.send({ t: 'move', move: { ...move, player: playerId } }),
      nextRound: () => {},
      newMatch: () => {},
      close: () => this.leave(),
    };
  }

  /* ---------------------------- Connection ---------------------------- */

  /**
   * One connection attempt (first connect or a reconnect).
   * @param retry - how many reconnects have been tried so far
   * @returns resolves when the attempt finished
   */
  private async attempt(retry: number): Promise<void> {
    let channel: Channel;
    try {
      channel = await this.connect(this.roomId);
    } catch (err) {
      if (this.ended) return;
      this.onConnectFailed(err as ConnectError, retry);
      return;
    }
    if (this.ended) {
      channel.close();
      return;
    }
    this.channel = channel;
    channel.onMessage((raw) => {
      if (this.channel === channel && isHostMessage(raw)) this.handle(raw);
    });
    channel.onClose(() => {
      if (this.channel === channel) this.onDropped();
    });
    this.send({ t: 'hello', secretId: this.profile.id, name: this.profile.name });
  }

  /**
   * A connect attempt failed.
   * @param err - why
   * @param retry - reconnects tried so far
   * @returns nothing
   */
  private onConnectFailed(err: ConnectError, retry: number): void {
    const wasJoined = this.publicId !== null;
    if (err === 'notFound') {
      // No host registered under this room any more.
      this.end(wasJoined ? { kind: 'hostLeft' } : { kind: 'notFound' });
    } else if (wasJoined && retry < RECONNECT_DELAYS_MS.length) {
      this.scheduleReconnect(retry);
    } else {
      this.end(wasJoined ? { kind: 'hostLeft' } : { kind: 'error' });
    }
  }

  /**
   * The channel closed without a goodbye: try to get back in.
   * @returns nothing
   */
  private onDropped(): void {
    this.channel = null;
    if (this.ended) return;
    if (this.publicId === null) {
      this.end({ kind: 'error' });
      return;
    }
    this.setNotice('reconnecting');
    this.scheduleReconnect(0);
  }

  /**
   * Waits, then tries to reconnect.
   * @param retry - reconnects tried so far
   * @returns nothing
   */
  private scheduleReconnect(retry: number): void {
    this.setNotice('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attempt(retry + 1);
    }, RECONNECT_DELAYS_MS[retry]);
  }

  /* ---------------------------- Messages ---------------------------- */

  /**
   * Handles one message from the host.
   * @param msg - the message
   * @returns nothing
   */
  private handle(msg: HostMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.publicId = msg.publicId;
        this.setNotice(null);
        break;
      case 'reject':
        this.end({ kind: 'rejected', reason: msg.reason });
        break;
      case 'lobby':
        this.rules = msg.rules;
        if (this.publicId) this.setStatus({ kind: 'lobby', seats: msg.seats, publicId: this.publicId });
        break;
      case 'state': {
        this.rules = msg.rules;
        // Older hosts don't send bots: treat every seat as human then.
        const meta = { connected: msg.connected, bots: msg.bots ?? msg.connected.map(() => false) };
        this.latest = { view: msg.view, events: msg.events, isNewDeal: msg.isNewDeal, meta };
        if (this.status.kind !== 'playing') this.setStatus({ kind: 'playing' });
        else this.viewListeners.forEach((l) => l(msg.view, msg.events, msg.isNewDeal, meta));
        break;
      }
      case 'bye':
        this.end({ kind: 'hostLeft' });
        break;
    }
  }

  /* ---------------------------- Helpers ---------------------------- */

  /**
   * Sends a message to the host if connected.
   * @param msg - message
   * @returns nothing
   */
  private send(msg: GuestMessage): void {
    this.channel?.send(msg);
  }

  /**
   * Ends the session for good with a final status.
   * @param status - final status (hostLeft, rejected, …)
   * @returns nothing
   */
  private end(status: GuestStatus): void {
    this.ended = true;
    this.channel?.close();
    this.channel = null;
    if (status.kind === 'hostLeft') this.setNotice('hostLeft');
    this.setStatus(status);
  }

  /**
   * Updates the status and tells listeners.
   * @param status - new status
   * @returns nothing
   */
  private setStatus(status: GuestStatus): void {
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  /**
   * Updates the connection notice shown on the table.
   * @param notice - new notice
   * @returns nothing
   */
  private setNotice(notice: ConnectionNotice): void {
    if (this.notice === notice) return;
    this.notice = notice;
    this.noticeListeners.forEach((l) => l(notice));
  }
}
