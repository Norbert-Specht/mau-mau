/* ==========================================================================
   In-memory transport for tests
   A fake "network": channel pairs that deliver messages synchronously
   (after a JSON round-trip, like the real wire), and a room registry.
   ========================================================================== */

import type { Channel, ConnectFn, HostTransport } from '../../src/net/transport';

interface End extends Channel {
  peer: End | null;
  closed: boolean;
  messageListeners: ((m: unknown) => void)[];
  closeListeners: (() => void)[];
}

/**
 * Creates one end of a channel.
 * @returns an unconnected end
 */
function makeEnd(): End {
  const end: End = {
    peer: null,
    closed: false,
    messageListeners: [],
    closeListeners: [],
    send(message) {
      if (end.closed || !end.peer || end.peer.closed) return;
      // JSON round-trip: proves nothing relies on object identity or non-JSON values.
      const copy = JSON.parse(JSON.stringify(message));
      end.peer.messageListeners.forEach((l) => l(copy));
    },
    close() {
      if (end.closed) return;
      end.closed = true;
      end.closeListeners.forEach((l) => l());
      end.peer?.close();
    },
    onMessage(l) {
      end.messageListeners.push(l);
    },
    onClose(l) {
      end.closeListeners.push(l);
    },
  };
  return end;
}

/** A fake network with rooms that guests can connect to. */
export class FakeNetwork {
  private rooms = new Map<string, (ch: Channel) => void>();
  /** Every guest-side channel ever opened, for dropping connections in tests. */
  readonly guestChannels: Channel[] = [];

  /**
   * Opens a room.
   * @param roomId - room code
   * @returns a HostTransport for the host session
   */
  openRoom(roomId: string): HostTransport {
    const listeners: ((c: Channel) => void)[] = [];
    this.rooms.set(roomId, (ch) => listeners.forEach((l) => l(ch)));
    return {
      roomId,
      onChannel: (l) => listeners.push(l),
      close: () => this.rooms.delete(roomId),
    };
  }

  /** Guest connect function, like connectToRoom. */
  connect: ConnectFn = async (roomId) => {
    const accept = this.rooms.get(roomId);
    if (!accept) throw 'notFound';
    const hostEnd = makeEnd();
    const guestEnd = makeEnd();
    hostEnd.peer = guestEnd;
    guestEnd.peer = hostEnd;
    accept(hostEnd);
    this.guestChannels.push(guestEnd);
    return guestEnd;
  };
}
