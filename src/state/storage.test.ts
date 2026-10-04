import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientStore } from './storage';

/** One case: `clientStore` is a singleton and `hydrate()` runs once per process. */
describe('ClientStore.hydrate', () => {
  it('restores what belongs to Macha and nothing else', async () => {
    // Core's hyphenated legacy session key.
    await AsyncStorage.setItem('macha-session', '{"token":"t","expiresAtMs":1}');
    await AsyncStorage.setItem('macha.endpoints.v1', '{"version":1,"urls":[]}');
    // Keys core's `isMachaStorageKey` does not list; guards against swapping it in for `owned()`.
    await AsyncStorage.setItem('macha.clientId.v1', 'client-1');
    await AsyncStorage.setItem('macha.discoveredEndpoints.v1', '{"version":1,"urls":[]}');
    await AsyncStorage.setItem('macha.downloads.v1.client-1', '{"version":1,"items":[]}');
    await AsyncStorage.setItem('macha.musicLibrary.v1.client-1', '{"favourites":[],"plays":{},"recent":[]}');
    await AsyncStorage.setItem('macha.progress.v1:client-1', '{"version":1,"items":[]}');
    // Core's legacy Continue Watching key; core's migration reads it through this cache.
    await AsyncStorage.setItem('macha-client-progress:client-1', '[]');
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
