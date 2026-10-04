import { describe, expect, it } from 'vitest';
import { reclaimOrphans, SessionLedger, type LedgerStorage } from './sessionLedger';

/**
 * Sessions a dead process left open, closed by the next launch. Core's
 * `stop()` recovers the node from the id and never throws or charges for an
 * untracked one; left open, orphans hold transcode slots until reaped.
 */

const memory = (): LedgerStorage & { raw: Map<string, string> } => {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => void raw.set(key, value),
  };
};

describe('SessionLedger', () => {
  it('remembers what it records, across instances, once each', () => {
    const storage = memory();
    const ledger = new SessionLedger(storage);
    ledger.record('node-a::1');
    ledger.record('node-a::1');
    ledger.record('node-b::2');
    expect(new SessionLedger(storage).ids()).toEqual(['node-a::1', 'node-b::2']);
  });

  it('forgets what it is told to', () => {
    const ledger = new SessionLedger(memory());
    ledger.record('node-a::1');
    ledger.record('node-b::2');
    ledger.forget('node-a::1');
    expect(ledger.ids()).toEqual(['node-b::2']);
  });

  it('hands over the previous process’s ids once, and never this one’s', () => {
    // Services are rebuilt per connection generation; re-reading would close the
    // session now playing, so the snapshot is taken once.
    const storage = memory();
    new SessionLedger(storage).record('left-behind::1');
    const ledger = new SessionLedger(storage);
    expect(ledger.takeOrphans()).toEqual(['left-behind::1']);
    ledger.record('this-process::2');
    expect(ledger.takeOrphans()).toEqual([]);
  });

  it('survives a corrupt or foreign value rather than failing startup', () => {
    const storage = memory();
    storage.setItem('macha.playbackSessions.v1', '{not json');
    expect(new SessionLedger(storage).takeOrphans()).toEqual([]);
    storage.setItem('macha.playbackSessions.v1', JSON.stringify(['ok::1', 7, null]));
    expect(new SessionLedger(storage).ids()).toEqual(['ok::1']);
  });
});

describe('reclaimOrphans', () => {
  it('closes each orphan and forgets it, whether or not the close worked', async () => {
    // An unresponsive node reaps on its own clock; retrying every launch never ends.
    const ledger = new SessionLedger(memory());
    ledger.record('gone::1');
    ledger.record('refuses::2');
    const orphans = ledger.takeOrphans();
    const closed: string[] = [];
    await reclaimOrphans(orphans, ledger, async (id) => {
      closed.push(id);
      if (id === 'refuses::2') throw new Error('unreachable');
    });
    expect(closed).toEqual(['gone::1', 'refuses::2']);
    expect(ledger.ids()).toEqual([]);
  });

  it('leaves a session this process created alone', async () => {
    const ledger = new SessionLedger(memory());
    ledger.record('orphan::1');
    const orphans = ledger.takeOrphans();
    ledger.record('playing-now::2');
    const closed: string[] = [];
    await reclaimOrphans(orphans, ledger, async (id) => void closed.push(id));
    expect(closed).toEqual(['orphan::1']);
    expect(ledger.ids()).toEqual(['playing-now::2']);
  });
});
