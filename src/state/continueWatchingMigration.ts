import type { ContinueWatchingStore, PlaybackProgress } from '@machafoundation/core';
import { clientStore } from './storage';

/**
 * This client's own legacy Continue Watching key. (Core migrates its own
 * legacy `macha-client-progress:` key itself; that works only because `macha-`
 * is in `OWNED_KEY_PREFIXES`, so `clientStore` hydrates it.)
 */
function legacyKey(clientId: string): string {
  return `macha.progress.v1:${clientId}`;
}

function readLegacy(clientId: string): PlaybackProgress[] {
  try {
    const raw = clientStore.getItem(legacyKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlaybackProgress[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Unreadable history is not worth failing a launch over.
    return [];
  }
}

/**
 * Copies legacy resume positions into core's store via `update()`, so core's
 * rules apply. Only when the store is empty, so newer progress is never
 * overwritten; the old key is kept for rollback. Falls back to the
 * `anonymous` key, where stores write before hydration supplies the client id.
 */
export function adoptLegacyContinueWatching(store: ContinueWatchingStore, clientId: string): void {
  if (store.list().length > 0) return;
  const legacy = readLegacy(clientId);
  const entries = legacy.length > 0 ? legacy : readLegacy('anonymous');
  for (const entry of entries) store.update(entry);
}
