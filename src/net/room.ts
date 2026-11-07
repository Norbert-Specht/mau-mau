/* ==========================================================================
   Rooms and share links
   A room is identified by a short code. The share link is
   https://<site>/#room=<code>. The PeerJS peer id is the code with a
   prefix, so our ids don't collide with other apps on the public broker.
   ========================================================================== */

const ROOM_PREFIX = 'maumau-';
/** No 0/o, 1/l/i: codes may be read aloud or typed by hand. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** 8 characters from 31 → ~8.5 × 10^11 codes; collisions on the broker are very unlikely. */
const ROOM_CODE_LENGTH = 8;
const JOINED_ROOM_KEY = 'mau-mau.joinedRoom';

/**
 * Creates a random room code.
 * @returns e.g. "k3m9xq2a"
 */
export function newRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * PeerJS id for a room code.
 * @param roomId - room code
 * @returns the peer id the host registers on the broker
 */
export function peerIdFor(roomId: string): string {
  return ROOM_PREFIX + roomId;
}

/**
 * Builds the link guests open to join.
 * @param roomId - room code
 * @returns full URL with #room=<code>
 */
export function roomLink(roomId: string): string {
  return `${location.origin}${location.pathname}#room=${roomId}`;
}

/**
 * Reads the room code from a URL hash.
 * @param hash - e.g. location.hash
 * @returns the room code, or null if the hash isn't a room link
 */
export function roomFromHash(hash: string): string | null {
  const match = /^#room=([a-z0-9]{4,16})$/.exec(hash);
  return match ? match[1] : null;
}

/**
 * Removes #room=… from the address bar without reloading.
 * @returns nothing
 */
export function clearRoomHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

/* ---------------------------- Auto-rejoin ---------------------------- */
/* Remember which room this browser joined, so a reload rejoins straight away. */

/**
 * Stores (or clears, with null) the room this browser has joined.
 * @param roomId - room code or null
 * @returns nothing
 */
export function setJoinedRoom(roomId: string | null): void {
  try {
    if (roomId) localStorage.setItem(JOINED_ROOM_KEY, roomId);
    else localStorage.removeItem(JOINED_ROOM_KEY);
  } catch {
    // Storage blocked: the player just sees the join screen again after reload.
  }
}

/**
 * The room this browser last joined, if any.
 * @returns room code or null
 */
export function getJoinedRoom(): string | null {
  try {
    return localStorage.getItem(JOINED_ROOM_KEY);
  } catch {
    return null;
  }
}
