/* ==========================================================================
   Host + guest sessions over the fake network
   ========================================================================== */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlayableCards, makeRules, type GameEvent, type VisibleState } from '../../src/engine';
import type { ConnectionNotice } from '../../src/game/connection';
import { GuestSession, type GuestStatus } from '../../src/net/guest';
import { HostSession } from '../../src/net/host';
import { isGuestMessage } from '../../src/net/protocol';
import { FakeNetwork } from './fakeTransport';

// Drawn cards never auto-play here, so a draw always ends the turn and the
// tests can step through turns predictably. (Auto-play is tested in the engine.)
const rules = makeRules({ playDrawnCard: false });

/** Lets queued promises (async connect) run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

/**
 * Starts a guest and records its statuses and table updates.
 * @param net - fake network
 * @param roomId - room to join
 * @param id - the guest's secret id
 * @param name - display name
 * @returns the session plus recorded data
 */
function joinGuest(net: FakeNetwork, roomId: string, id: string, name: string) {
  const guest = new GuestSession(net.connect, roomId, { id, name });
  const statuses: GuestStatus[] = [];
  guest.onStatus((s) => statuses.push(s));
  guest.start();
  return { guest, statuses, last: () => statuses[statuses.length - 1] };
}

/**
 * Subscribes to a guest's table and records every view.
 * @param guest - a playing guest
 * @returns recorded views and events
 */
function watchTable(guest: GuestSession) {
  const views: VisibleState[] = [];
  const events: GameEvent[][] = [];
  const connected: boolean[][] = [];
  const notices: ConnectionNotice[] = [];
  const conn = guest.tableConnection();
  conn.subscribe((v, e, _deal, meta) => {
    views.push(v);
    events.push(e);
    connected.push(meta.connected);
  });
  conn.subscribeNotice!((n) => notices.push(n));
  return { conn, views, events, connected, notices, view: () => views[views.length - 1] };
}

describe('host and guest sessions', () => {
  let net: FakeNetwork;
  let host: HostSession;

  beforeEach(() => {
    vi.useFakeTimers();
    net = new FakeNetwork();
    host = new HostSession(net.openRoom('room1'), { secretId: 'host-secret', name: 'Hana' }, rules, 7);
  });

  afterEach(() => {
    host.close();
    vi.useRealTimers();
  });

  /* ---------------------------- Lobby ---------------------------- */

  it('seats a guest and shows everyone the lobby', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    expect(a.last()).toEqual({
      kind: 'lobby',
      publicId: 'seat-1',
      seats: [
        { publicId: 'seat-0', name: 'Hana', kind: 'human', connected: true, isHost: true },
        { publicId: 'seat-1', name: 'Ali', kind: 'human', connected: true, isHost: false },
      ],
    });
  });

  it('never sends secret ids to guests', async () => {
    const spy = vi.fn();
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    net.guestChannels[0].onMessage(spy);
    joinGuest(net, 'room1', 'secret-b', 'Bea');
    host.addBot('normal');
    host.start();
    await flush();
    const everything = JSON.stringify(spy.mock.calls);
    expect(everything).not.toContain('secret-');
    expect(everything).not.toContain('host-secret');
    a.guest.leave();
  });

  it('lets the host add and remove bots, up to 4 seats', async () => {
    joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    expect(host.addBot('hard')).toBe(true);
    expect(host.addBot('easy')).toBe(true);
    expect(host.addBot('easy')).toBe(false);
    expect(host.lobbySeats().map((s) => s.name)).toEqual(['Hana', 'Ali', 'Anna', 'Jonas']);
    host.removeBot(host.lobbySeats()[2].publicId);
    expect(host.lobbySeats()).toHaveLength(3);
  });

  it('rejects a fifth player, and anyone new once the game has started', async () => {
    host.addBot('easy');
    host.addBot('easy');
    joinGuest(net, 'room1', 'secret-a', 'Ali');
    const full = joinGuest(net, 'room1', 'secret-b', 'Bea');
    await flush();
    expect(full.last()).toEqual({ kind: 'rejected', reason: 'full' });

    host.removeBot(host.lobbySeats()[1].publicId);
    host.start();
    const late = joinGuest(net, 'room1', 'secret-c', 'Cem');
    await flush();
    expect(late.last()).toEqual({ kind: 'rejected', reason: 'started' });
  });

  it("rejects the host's own browser joining as a guest", async () => {
    const self = joinGuest(net, 'room1', 'host-secret', 'Hana again');
    await flush();
    expect(self.last()).toEqual({ kind: 'rejected', reason: 'badHello' });
  });

  it('frees a lobby seat when a guest leaves before the start', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    a.guest.leave();
    expect(host.lobbySeats()).toHaveLength(1);
  });

  it('reports a missing room', async () => {
    const lost = joinGuest(net, 'room1', 'secret-a', 'Ali');
    const nowhere = joinGuest(net, 'nope', 'secret-b', 'Bea');
    await flush();
    expect(nowhere.last()).toEqual({ kind: 'notFound' });
    lost.guest.leave();
  });

  it('cleans up long names', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', '   A   very    long name that keeps going   ');
    await flush();
    expect(host.lobbySeats()[1].name).toBe('A very long name tha');
    a.guest.leave();
  });

  /* ---------------------------- Playing ---------------------------- */

  it('starts the game and sends each guest only their own hand', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    const hostViews: VisibleState[] = [];
    host.hostConnection().subscribe((v) => hostViews.push(v));
    expect(host.start()).toBe(true);
    expect(a.last()).toEqual({ kind: 'playing' });

    const table = watchTable(a.guest);
    const guestView = table.view();
    const hostView = hostViews[hostViews.length - 1];
    expect(guestView.you).toBe(1);
    expect(hostView.you).toBe(0);
    expect(guestView.hand).toHaveLength(5);
    // The guest's data contains none of the host's cards.
    const guestJson = JSON.stringify(table.views);
    for (const card of hostView.hand) expect(guestJson).not.toContain(card.id);
  });

  it("applies a guest's move only to the guest's own seat", async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const table = watchTable(a.guest);
    // Host (seat 0) moves first. The guest tries to draw "as the host": must be ignored.
    net.guestChannels[0].send({ t: 'move', move: { type: 'draw', player: 'seat-0' } });
    expect(table.view().current).toBe(0);
    expect(table.view().players[0].cardCount).toBe(5);

    // Host draws; then it's the guest's turn.
    const hostConn = host.hostConnection();
    hostConn.submit({ type: 'draw', player: 'seat-0' });
    expect(table.view().current).toBe(1);

    const before = table.view().hand.length;
    table.conn.submit({ type: 'draw', player: 'seat-1' });
    expect(table.view().hand.length).toBe(before + 1);
  });

  it('hides cards drawn by other players in the events', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const table = watchTable(a.guest);
    host.hostConnection().submit({ type: 'draw', player: 'seat-0' });
    const drew = table.events.flat().find((e) => e.type === 'drew');
    expect(drew).toMatchObject({ seat: 0, count: 1, cards: [] });
  });

  it('runs bot turns on the host and shows them to guests', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.addBot('normal');
    host.start();
    const table = watchTable(a.guest);
    // Host draws → guest draws → bot's turn after 700 ms.
    const hostConn = host.hostConnection();
    hostConn.submit({ type: 'draw', player: 'seat-0' });
    table.conn.submit({ type: 'draw', player: 'seat-1' });
    expect(table.view().current).toBe(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(table.view().current).not.toBe(2);
  });

  /* ---------------------------- Disconnects ---------------------------- */

  it('keeps a dropped guest seated as offline and lets them rejoin', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const table = watchTable(a.guest);
    const hand = table.view().hand.map((c) => c.id);

    // Connection drops (no goodbye): host marks the seat offline.
    const hostSide: boolean[][] = [];
    host.hostConnection().subscribe((_v, _e, _d, meta) => hostSide.push(meta.connected));
    net.guestChannels[0].close();
    expect(hostSide[hostSide.length - 1]).toEqual([true, false]);
    expect(table.notices).toContain('reconnecting');

    // The guest reconnects automatically and gets the same seat and hand back.
    await vi.advanceTimersByTimeAsync(1100);
    expect(hostSide[hostSide.length - 1]).toEqual([true, true]);
    expect(table.view().you).toBe(1);
    expect(table.view().hand.map((c) => c.id)).toEqual(hand);
    expect(table.notices[table.notices.length - 1]).toBeNull();
  });

  it('rejoins the same seat from a new session (page reload)', async () => {
    const first = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const hand = watchTable(first.guest).view().hand.map((c) => c.id);
    first.guest.leave();

    const again = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    expect(again.last()).toEqual({ kind: 'playing' });
    const view = watchTable(again.guest).view();
    expect(view.you).toBe(1);
    expect(view.hand.map((c) => c.id)).toEqual(hand);
  });

  it('tells guests when the host closes the room', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const table = watchTable(a.guest);
    host.close();
    expect(a.last()).toEqual({ kind: 'hostLeft' });
    expect(table.notices[table.notices.length - 1]).toBe('hostLeft');
  });

  it('reports the host as gone if the room vanished without a goodbye', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    // Simulate a crashed host tab: the room disappears and the channel drops silently.
    (host as unknown as { transport: { close(): void } }).transport.close();
    net.guestChannels[0].close();
    await vi.advanceTimersByTimeAsync(1100);
    expect(a.last()).toEqual({ kind: 'hostLeft' });
  });

  it('a guest can play a whole round against the host', async () => {
    const a = joinGuest(net, 'room1', 'secret-a', 'Ali');
    await flush();
    host.start();
    const table = watchTable(a.guest);
    const hostViews: VisibleState[] = [];
    const hostConn = host.hostConnection();
    hostConn.subscribe((v) => hostViews.push(v));

    for (let i = 0; i < 500 && table.view().phase !== 'roundOver'; i++) {
      const v = table.view().current === 1 ? table.view() : hostViews[hostViews.length - 1];
      const conn = v.you === 1 ? table.conn : hostConn;
      const player = v.you === 1 ? 'seat-1' : 'seat-0';
      const playable = getPlayableCards(v, rules);
      if (playable.length) {
        conn.submit({ type: 'play', player, cardId: playable[0].id, wish: 'hearts', mau: v.hand.length === 2 });
      } else {
        conn.submit({ type: 'draw', player });
      }
    }
    expect(table.view().phase).toBe('roundOver');
  });
});

describe('isGuestMessage', () => {
  it('accepts valid messages and rejects junk', () => {
    expect(isGuestMessage({ t: 'hello', secretId: 'x', name: 'A' })).toBe(true);
    expect(isGuestMessage({ t: 'move', move: { type: 'draw', player: 'p' } })).toBe(true);
    expect(isGuestMessage({ t: 'bye' })).toBe(true);
    expect(isGuestMessage(null)).toBe(false);
    expect(isGuestMessage('hello')).toBe(false);
    expect(isGuestMessage({ t: 'hello', secretId: '', name: 'A' })).toBe(false);
    expect(isGuestMessage({ t: 'hello', secretId: 'x'.repeat(200), name: 'A' })).toBe(false);
    expect(isGuestMessage({ t: 'move', move: null })).toBe(false);
    expect(isGuestMessage({ t: 'state' })).toBe(false);
  });
});
