import type { ContinueWatchingStore, PlaybackProgress } from '@macha/core';
import { clientStore } from './storage';

/**
 * This repo's own pre-rename Continue Watching key.
 *
 * Core adopts the *web* client's legacy key (`macha-client-progress:`) inside
 * its own `read()`. This one is ours alone — `macha.progress.v1:` predates the
 * convention core now follows — so a migration for it in the shared package
 * would be dead code for every other consumer forever.
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
    // Unreadable history is not worth failing a launch over. The viewer loses
    // their resume positions, which is what happens anyway if we throw.
    return [];
  }
}

/**
 * Copy pre-rename resume positions into core's store, once.
 *
 * Entries go in through `update()` rather than by writing core's key directly,
 * so core owns its own key and its own rules — the finished filter, the
 * minimum progress floor and the limit all apply exactly as they would to a
 * fresh entry. That also means this never has to be revised if core renames
 * again, which is the failure it exists to clean up after.
 *
 * Runs only when the store is empty, so a viewer who has watched anything
 * since upgrading can never be dragged back to where they were before it. The
 * old key is left in place: it costs a few hundred bytes and is the only way
 * back if this build is rolled back.
 *
 * `anonymous` is swept too. Every store here is constructed
 * `new Store(clientId || 'anonymous')`, and `clientId` is empty during the
 * first render before hydration completes, so a write landing in that window
 * is filed under a real key that nothing later reads.
 */
export function adoptLegacyContinueWatching(store: ContinueWatchingStore, clientId: string): void {
  if (store.list().length > 0) return;
  const legacy = readLegacy(clientId);
  const entries = legacy.length > 0 ? legacy : readLegacy('anonymous');
  for (const entry of entries) store.update(entry);
}
