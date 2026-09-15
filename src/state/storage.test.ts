import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientStore } from './storage';

/**
 * One hydrate, deliberately. `clientStore` is a singleton and `hydrate()`
 * returns early once it has run, which is the behaviour the app wants and makes
 * a per-case fixture impossible without exporting the class purely for tests.
 * Everything is seeded first and asserted after the single pass.
 */
describe('ClientStore.hydrate', () => {
  it('restores what belongs to Macha and nothing else', async () => {
    // Core's session cache. The key is hyphenated — `macha-session` — and a
    // filter of `macha.` silently excluded it, so the signed-in token was
    // written on every launch and never read back. Signing in therefore lasted
    // exactly as long as the process did. Nothing errored and nothing logged,
    // because an anonymous session re-mints in milliseconds and hides it; the
    // only symptom was a *person* being signed out on every cold start.
    await AsyncStorage.setItem('macha-session', '{"token":"t","expiresAtMs":1}');
    // This client's own convention, which always worked.
    await AsyncStorage.setItem('macha.endpoints.v1', '{"version":1,"urls":[]}');
    // Keys this client owns that core's `isMachaStorageKey` registry does not
    // list. They are here so that swapping core's helper in for `owned()` —
    // which core's own doc comment recommends — fails loudly instead of
    // silently ceasing to restore them. `macha.clientId.v1` is the worst of
    // them: it namespaces every per-client store, so losing it orphans
    // Continue Watching, the queue, the playlists and the music library too.
    await AsyncStorage.setItem('macha.clientId.v1', 'client-1');
    await AsyncStorage.setItem('macha.discoveredEndpoints.v1', '{"version":1,"urls":[]}');
    await AsyncStorage.setItem('macha.downloads.v1.client-1', '{"version":1,"items":[]}');
    await AsyncStorage.setItem('macha.musicLibrary.v1.client-1', '{"favourites":[],"plays":{},"recent":[]}');
    await AsyncStorage.setItem('macha.progress.v1:client-1', '{"version":1,"items":[]}');
    // Core's *own* pre-0.10.0 Continue Watching key, which its
    // `ContinueWatchingStore.read()` adopts when the current key is empty. Core
    // reads through this store (`configureMachaHost({ storage: clientStore })`)
    // and `getItem` answers only from the hydrated cache, so failing to hydrate
    // this would silently defeat core's own migration on any device that ran a
    // build of this client from before core 0.10.0.
    await AsyncStorage.setItem('macha-client-progress:client-1', '[]');
    // Anchored on purpose: another library's key that merely begins with the
    // same letters must not be pulled into this cache.
    await AsyncStorage.setItem('machaSomethingElse', 'x');
    await AsyncStorage.setItem('unrelated', 'y');

    await clientStore.hydrate();

    expect(clientStore.getItem('macha-session')).toBe('{"token":"t","expiresAtMs":1}');
    expect(clientStore.getItem('macha.endpoints.v1')).toBe('{"version":1,"urls":[]}');
    expect(clientStore.getItem('macha.clientId.v1')).toBe('client-1');
    expect(clientStore.getItem('macha.discoveredEndpoints.v1')).toBe('{"version":1,"urls":[]}');
    expect(clientStore.getItem('macha.downloads.v1.client-1')).toBe('{"version":1,"items":[]}');
    expect(clientStore.getItem('macha.musicLibrary.v1.client-1')).toBe('{"favourites":[],"plays":{},"recent":[]}');
    expect(clientStore.getItem('macha.progress.v1:client-1')).toBe('{"version":1,"items":[]}');
    expect(clientStore.getItem('macha-client-progress:client-1')).toBe('[]');
    expect(clientStore.getItem('machaSomethingElse')).toBeNull();
    expect(clientStore.getItem('unrelated')).toBeNull();
  });
});
