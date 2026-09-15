import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientStore } from './storage';
import { getClientId } from './connection';

/**
 * Why this exists: `getClientId()` mints when the key is absent, and
 * `ClientStore` answers only from a cache hydrated once at startup — so before
 * hydration an *existing* id reads as no id at all. Anything calling it early
 * mints a fresh identity and writes it, silently orphaning everything keyed
 * under the previous one. That is the fault core spent 0.12.0 removing from its
 * own bandwidth store.
 *
 * `MachaProvider` hands core's `EndpointBandwidth` a lazy id guarded on
 * `clientStore.isHydrated` for exactly this reason: core resolves it at write
 * time, so answering `undefined` early costs nothing and minting early would
 * cost the record. The guard is the whole defence.
 *
 * One hydrate per file, as in `storage.test.ts` — `clientStore` is a singleton
 * and `hydrate()` returns early once it has run. So the hazard is shown by the
 * read that misleads, rather than by performing the destructive mint.
 */
describe('getClientId and hydration', () => {
  it('cannot see a persisted id before hydration, and does not mint over it after', async () => {
    await AsyncStorage.setItem('macha.clientId.v1', 'persisted-id');

    // The indistinguishability itself: the id is on disk, and the store — which
    // is what `getClientId()` reads — answers null. Calling it here would mint.
    expect(clientStore.isHydrated).toBe(false);
    expect(clientStore.getItem('macha.clientId.v1')).toBeNull();

    await clientStore.hydrate();

    // Hydrated, the persisted identity is found and kept. Twice, because a
    // mint would also be stable within a launch and only differ across them.
    expect(getClientId()).toBe('persisted-id');
    expect(getClientId()).toBe('persisted-id');
  });
});
