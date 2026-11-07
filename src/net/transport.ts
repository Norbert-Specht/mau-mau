/* ==========================================================================
   Transport interfaces
   The host and guest sessions talk through these small interfaces instead
   of PeerJS directly. That keeps the session logic testable with an
   in-memory fake (see tests/net) and keeps PeerJS in one file.
   ========================================================================== */

/** One two-way message channel (host ↔ one guest). */
export interface Channel {
  send(message: unknown): void;
  /** Closes the channel. onClose listeners still fire. */
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Fires once when the channel is closed from either side or times out. */
  onClose(listener: () => void): void;
}

/** The host's side: a room that guests connect to. */
export interface HostTransport {
  /** Short room code used in the share link. */
  readonly roomId: string;
  onChannel(listener: (channel: Channel) => void): void;
  /** Closes the room and every channel. */
  close(): void;
}

/** Why connecting to a room failed. */
export type ConnectError = 'notFound' | 'network';

/** Opens a channel from a guest to a room. Rejects with a ConnectError. */
export type ConnectFn = (roomId: string) => Promise<Channel>;
