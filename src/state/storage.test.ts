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
    // Anchored on purpose: another library's key that merely begins with the
    // same letters must not be pulled into this cache.
    await AsyncStorage.setItem('machaSomethingElse', 'x');
    await AsyncStorage.setItem('unrelated', 'y');

    await clientStore.hydrate();

    expect(clientStore.getItem('macha-session')).toBe('{"token":"t","expiresAtMs":1}');
    expect(clientStore.getItem('macha.endpoints.v1')).toBe('{"version":1,"urls":[]}');
    expect(clientStore.getItem('machaSomethingElse')).toBeNull();
    expect(clientStore.getItem('unrelated')).toBeNull();
  });
});
