import { beforeEach, describe, expect, it } from 'vitest';
import { ContinueWatchingStore, type PlaybackProgress } from '@machafoundation/core';
import { clientStore } from './storage';
import { adoptLegacyContinueWatching } from './continueWatchingMigration';

const entry = (mediaId: string, positionMs = 60_000): PlaybackProgress => ({
  mediaId,
  positionMs,
  durationMs: 3_600_000,
  updatedAt: Date.now(),
});

const legacyKey = (clientId: string) => `macha.progress.v1:${clientId}`;

describe('adoptLegacyContinueWatching', () => {
  beforeEach(() => {
    for (const key of ['client', 'anonymous']) clientStore.removeItem(legacyKey(key));
    clientStore.removeItem('macha.continueWatching.v1.client');
  });

  it('carries pre-rename resume positions into core’s store', () => {
    clientStore.setItem(legacyKey('client'), JSON.stringify([entry('macha:one'), entry('macha:two')]));
    const store = new ContinueWatchingStore('client', clientStore);

    adoptLegacyContinueWatching(store, 'client');

    expect(store.list().map((e) => e.mediaId).sort()).toEqual(['macha:one', 'macha:two']);
  });

  it('never drags a viewer back to where they were before upgrading', () => {
    // The store already has something, so the viewer has watched since the
    // rename. Adopting on top of that would resurrect stale positions.
    const store = new ContinueWatchingStore('client', clientStore);
    store.update(entry('macha:current'));
    clientStore.setItem(legacyKey('client'), JSON.stringify([entry('macha:stale')]));

    adoptLegacyContinueWatching(store, 'client');

    expect(store.list().map((e) => e.mediaId)).toEqual(['macha:current']);
  });

  it('sweeps the anonymous pool written before hydration finished', () => {
    // Every store is built `new Store(clientId || 'anonymous')`, and clientId is
    // empty during the first render — so a write in that window lands under a
    // real key that nothing later reads.
    clientStore.setItem(legacyKey('anonymous'), JSON.stringify([entry('macha:early')]));
    const store = new ContinueWatchingStore('client', clientStore);

    adoptLegacyContinueWatching(store, 'client');

    expect(store.list().map((e) => e.mediaId)).toEqual(['macha:early']);
  });

  it('prefers the real client id over the anonymous pool when both exist', () => {
    clientStore.setItem(legacyKey('client'), JSON.stringify([entry('macha:real')]));
    clientStore.setItem(legacyKey('anonymous'), JSON.stringify([entry('macha:early')]));
    const store = new ContinueWatchingStore('client', clientStore);

    adoptLegacyContinueWatching(store, 'client');

    expect(store.list().map((e) => e.mediaId)).toEqual(['macha:real']);
  });

  it('leaves the old key in place, so a rollback still finds it', () => {
    clientStore.setItem(legacyKey('client'), JSON.stringify([entry('macha:one')]));
    adoptLegacyContinueWatching(new ContinueWatchingStore('client', clientStore), 'client');

    expect(clientStore.getItem(legacyKey('client'))).not.toBeNull();
  });

  it('survives unreadable legacy history rather than failing the launch', () => {
    clientStore.setItem(legacyKey('client'), '{ not json');
    const store = new ContinueWatchingStore('client', clientStore);

    expect(() => adoptLegacyContinueWatching(store, 'client')).not.toThrow();
    expect(store.list()).toEqual([]);
  });
});
