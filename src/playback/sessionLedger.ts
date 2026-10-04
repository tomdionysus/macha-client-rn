/**
 * Persists every playback session this install holds open, so the next
 * process can close those a dead one left behind.
 *
 * `releaseSession` does not run when the app is killed or replaced, and
 * backgrounding deliberately keeps sessions so music plays on. An orphan holds
 * a transcode slot and counts against the account until `session_idle` reaps it
 * (thirty minutes), and can make the node refuse creates with `429 resource_limit`.
 *
 * Core's `stop()` closes an id it has no record of (it recovers the node from
 * the id, never throws, never charges the node), so ids are recorded as issued
 * and closed at the next launch.
 *
 * Orphans are taken once per process, at hydration, before any endpoint exists:
 * services are rebuilt per connection generation, and re-reading would close
 * the session now playing.
 */

/** The synchronous half of `clientStore`, which is all this needs. */
export interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SESSION_LEDGER_KEY = 'macha.playbackSessions.v1';

export class SessionLedger {
  private taken = false;

  constructor(
    private readonly storage: LedgerStorage,
    private readonly key = SESSION_LEDGER_KEY,
  ) {}

  ids(): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getItem(this.key) ?? '[]');
    } catch {
      // An unreadable value closes nothing and must not stop the app.
      return [];
    }
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  }

  record(sessionId: string): void {
    const ids = this.ids();
    if (ids.includes(sessionId)) return;
    this.storage.setItem(this.key, JSON.stringify([...ids, sessionId]));
  }

  forget(sessionId: string): void {
    const ids = this.ids();
    if (!ids.includes(sessionId)) return;
    this.storage.setItem(this.key, JSON.stringify(ids.filter((id) => id !== sessionId)));
  }

  /** The ids a previous process left, once; later calls answer empty so this process's ids are never orphans. */
  takeOrphans(): string[] {
    if (this.taken) return [];
    this.taken = true;
    return this.ids();
  }
}

/**
 * Close each orphan sequentially and forget it whether or not the close
 * worked: an unresponsive node reaps on its own clock, and retrying every
 * launch would never end.
 */
export async function reclaimOrphans(
  orphans: readonly string[],
  ledger: SessionLedger,
  close: (sessionId: string) => Promise<void>,
): Promise<void> {
  for (const sessionId of orphans) {
    try {
      await close(sessionId);
    } catch {
      // Core's untracked close does not throw; this guards a close that does.
    } finally {
      ledger.forget(sessionId);
    }
  }
}
