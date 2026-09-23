/**
 * Every playback session this install holds open, kept where the next process
 * can find it.
 *
 * **The gap is process death.** `releaseSession` runs on stop, on replacement
 * and on reconfiguration, but not when the app is swiped away, killed, or
 * replaced by `install -r` — and backgrounding deliberately does not release,
 * so music can keep playing. A session left that way holds its node's video
 * transcode slot and counts against the account until `session_idle` reaps it,
 * thirty minutes later. On the A85 2026-09-23 the LAN node refused a create
 * `429 resource_limit` "video transcode limit reached", most likely holding this
 * client's own orphans.
 *
 * **The dead process cannot close them; the next one can.** Core's
 * `docs/resolver-direct.md`: a resolver-direct host owns every session it
 * creates, including those left by a process that died, and `stop()` acts on an
 * id it has no record of — core mints `${endpoint.id}::${nodeSessionId}` and
 * recovers the node from it, and an untracked close never throws and never
 * charges the node. So the ids are written down as they are handed out and
 * closed at the next launch.
 *
 * **Taken once per process, at hydration.** The playback services are rebuilt
 * on every connection generation; a reclaim that re-read the ledger each time
 * would close the session playing right now. The snapshot is taken before any
 * endpoint exists to create one on.
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
      // A value this cannot read closes nothing; it must not stop the app.
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

  /**
   * The ids a previous process left, once. Every later call answers empty, so
   * nothing this process records can be mistaken for an orphan.
   */
  takeOrphans(): string[] {
    if (this.taken) return [];
    this.taken = true;
    return this.ids();
  }
}

/**
 * Close each orphan and forget it, whether or not the close worked.
 *
 * Forgotten on failure too: a node that will not answer reaps the session on
 * its own clock, and keeping the id would retry it on every launch for ever.
 * Sequential, because they are few and a burst of `DELETE`s at startup buys
 * nothing over a trickle.
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
      // Core's untracked close does not throw; this is for a close that does.
    } finally {
      ledger.forget(sessionId);
    }
  }
}
