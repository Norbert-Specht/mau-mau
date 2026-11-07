/* ==========================================================================
   Network protocol
   Messages between the host (referee) and guests. Everything is plain JSON.

   Identity: each browser has a SECRET player id (localStorage). Guests send
   it only to the host in "hello". Inside the game everyone is known by a
   PUBLIC seat id ("seat-1", …) so one guest can never learn — and then
   impersonate — another player's secret id.
   ========================================================================== */

import type { Difficulty } from '../bot/bot';
import type { GameEvent, Move, Rules, VisibleState } from '../engine';

/** Maximum seats at a table (the 32-card deck comfortably supports 4 players). */
export const MAX_SEATS = 4;

export interface LobbySeat {
  publicId: string;
  name: string;
  kind: 'human' | 'bot';
  difficulty?: Difficulty;
  connected: boolean;
  isHost: boolean;
}

/* ---------------------------- Guest → Host ---------------------------- */

export type GuestMessage =
  | { t: 'hello'; secretId: string; name: string }
  | { t: 'move'; move: Move }
  /** Guest is leaving on purpose (closing the tab or pressing "Back to menu"). */
  | { t: 'bye' };

/* ---------------------------- Host → Guest ---------------------------- */

export type RejectReason = 'full' | 'started' | 'badHello';

export type HostMessage =
  | { t: 'welcome'; publicId: string }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'lobby'; seats: LobbySeat[]; rules: Rules }
  | {
      t: 'state';
      view: VisibleState;
      events: GameEvent[];
      isNewDeal: boolean;
      connected: boolean[];
      rules: Rules;
    }
  /** Host is closing the room on purpose. */
  | { t: 'bye' };

/* ---------------------------- Validation ---------------------------- */

/**
 * Checks that untrusted data from a guest is a well-formed GuestMessage.
 * The engine validates moves fully; this only guards the message shape.
 * @param data - anything received from the network
 * @returns true if it can be handled as a GuestMessage
 */
export function isGuestMessage(data: unknown): data is GuestMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  switch (msg.t) {
    case 'hello':
      return typeof msg.secretId === 'string' && msg.secretId.length > 0 && msg.secretId.length <= 100 && typeof msg.name === 'string';
    case 'move': {
      const move = msg.move as Record<string, unknown> | null;
      return !!move && typeof move === 'object' && typeof move.type === 'string';
    }
    case 'bye':
      return true;
    default:
      return false;
  }
}

/**
 * Light shape check for data from the host. The host is trusted as referee,
 * but a check keeps a broken message from crashing the guest UI.
 * @param data - anything received from the network
 * @returns true if it can be handled as a HostMessage
 */
export function isHostMessage(data: unknown): data is HostMessage {
  if (!data || typeof data !== 'object') return false;
  const t = (data as Record<string, unknown>).t;
  return t === 'welcome' || t === 'reject' || t === 'lobby' || t === 'state' || t === 'bye';
}

/** Longest player name accepted; longer names are cut. */
export const MAX_NAME_LENGTH = 20;

/**
 * Tidies a player name from the network.
 * @param name - raw name
 * @param fallback - used when the name is empty
 * @returns trimmed, length-limited name
 */
export function cleanName(name: string, fallback: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
}
