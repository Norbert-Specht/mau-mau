/* ==========================================================================
   PeerJS transport
   The only file that touches PeerJS. Uses the free public PeerJS broker
   for signaling; game data then flows directly between browsers (WebRTC).
   PeerJS is loaded on demand, so games against bots never download it.
   ========================================================================== */

import type { DataConnection, Peer as PeerType } from 'peerjs';
import { newRoomId, peerIdFor } from './room';
import type { Channel, ConnectError, HostTransport } from './transport';

/** How often each side sends a heartbeat. */
const PING_MS = 4000;
/** Silence longer than this means the other side is gone (sleeping phone, lost network).
 *  Generous because browsers slow down timers in background tabs. */
const TIMEOUT_MS = 20000;
/** Give up on reaching the broker / host after this long. */
const CONNECT_TIMEOUT_MS = 15000;

/**
 * Loads PeerJS on first use.
 * @returns the Peer class
 */
async function loadPeer(): Promise<typeof PeerType> {
  const mod = await import('peerjs');
  return mod.Peer;
}

/**
 * Wraps a PeerJS DataConnection as a Channel with a heartbeat.
 * @param conn - an open data connection
 * @param onClosed - extra cleanup when the channel closes (e.g. destroy the guest's peer)
 * @returns the channel
 */
function wrapConnection(conn: DataConnection, onClosed?: () => void): Channel {
  const messageListeners: ((m: unknown) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  let closed = false;
  let lastSeen = Date.now();

  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try {
      conn.close();
    } catch {
      // Already closed.
    }
    onClosed?.();
    closeListeners.forEach((l) => l());
  };

  const heartbeat = setInterval(() => {
    if (Date.now() - lastSeen > TIMEOUT_MS) return finish();
    if (conn.open) conn.send({ t: 'ping' });
  }, PING_MS);

  conn.on('data', (data) => {
    lastSeen = Date.now();
    if ((data as { t?: string } | null)?.t === 'ping') return;
    messageListeners.forEach((l) => l(data));
  });
  conn.on('close', finish);
  conn.on('error', finish);

  return {
    send(message) {
      if (!closed && conn.open) conn.send(message);
    },
    close: finish,
    onMessage(listener) {
      messageListeners.push(listener);
    },
    onClose(listener) {
      if (closed) listener();
      else closeListeners.push(listener);
    },
  };
}

/**
 * Registers a peer with a given id on the broker.
 * @param Peer - the PeerJS class
 * @param id - wanted peer id
 * @returns the open peer; rejects with the PeerJS error type (e.g. "unavailable-id")
 */
function openPeer(Peer: typeof PeerType, id: string): Promise<PeerType> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0 });
    const timer = setTimeout(() => {
      peer.destroy();
      reject('network');
    }, CONNECT_TIMEOUT_MS);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err.type);
    });
  });
}

/**
 * Creates a room on the broker for the host.
 * @returns the host transport; rejects with 'network' if the broker can't be reached
 */
export async function openRoom(): Promise<HostTransport> {
  const Peer = await loadPeer();
  let peer: PeerType | null = null;
  let roomId = '';
  // A taken id is astronomically unlikely, but retrying is cheap.
  for (let attempt = 0; attempt < 3 && !peer; attempt++) {
    roomId = newRoomId();
    try {
      peer = await openPeer(Peer, peerIdFor(roomId));
    } catch (type) {
      if (type !== 'unavailable-id') throw 'network';
    }
  }
  if (!peer) throw 'network';
  const openPeerRef = peer;

  const channels = new Set<Channel>();
  const listeners: ((c: Channel) => void)[] = [];

  openPeerRef.on('connection', (conn) => {
    conn.on('open', () => {
      const channel = wrapConnection(conn);
      channels.add(channel);
      channel.onClose(() => channels.delete(channel));
      listeners.forEach((l) => l(channel));
    });
  });
  // Losing the broker doesn't drop existing games, but new guests need it: reconnect.
  openPeerRef.on('disconnected', () => {
    if (!openPeerRef.destroyed) openPeerRef.reconnect();
  });
  // Errors after opening (e.g. a guest failing to connect) don't end the room.
  openPeerRef.on('error', () => {});

  return {
    roomId,
    onChannel(listener) {
      listeners.push(listener);
    },
    close() {
      channels.forEach((c) => c.close());
      openPeerRef.destroy();
    },
  };
}

/**
 * Connects a guest to a room.
 * @param roomId - room code from the share link
 * @returns an open channel to the host; rejects with 'notFound' or 'network'
 */
export async function connectToRoom(roomId: string): Promise<Channel> {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let settled = false;
    const fail = (reason: ConnectError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(reason);
    };
    const timer = setTimeout(() => fail('network'), CONNECT_TIMEOUT_MS);

    peer.once('open', () => {
      const conn = peer.connect(peerIdFor(roomId), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrapConnection(conn, () => peer.destroy()));
      });
    });
    // "peer-unavailable" = no host with this id on the broker: the room is gone.
    peer.on('error', (err) => fail(err.type === 'peer-unavailable' ? 'notFound' : 'network'));
  });
}
