/* ==========================================================================
   Player profile
   A random player id and the player's name, kept in localStorage so the
   same browser keeps the same identity across reloads (needed for
   rejoining multiplayer seats in step 3).
   ========================================================================== */

import { STRINGS } from '../i18n/strings';

const STORAGE_KEY = 'mau-mau.profile';

export interface Profile {
  id: string;
  name: string;
}

/**
 * Loads the stored profile, creating and saving a new one if needed.
 * Storage can be unavailable (private mode), so failures fall back to a
 * fresh in-memory profile.
 * @returns the player's profile
 */
export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (typeof parsed.id === 'string' && typeof parsed.name === 'string') {
        return { id: parsed.id, name: parsed.name };
      }
    }
  } catch {
    // Ignore unreadable storage and start fresh.
  }
  const profile = { id: crypto.randomUUID(), name: STRINGS.defaultName };
  saveProfile(profile);
  return profile;
}

/**
 * Saves the profile to localStorage (silently ignores storage errors).
 * @param profile - the profile to save
 * @returns nothing
 */
export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage may be blocked; the game still works for this session.
  }
}
