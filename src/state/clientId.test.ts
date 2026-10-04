import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientStore } from './storage';
import { getClientId } from './connection';

/**
 * Before hydration an existing client id reads as absent, so calling
 * `getClientId()` early would mint over it and orphan per-client data; callers
 * must guard on `clientStore.isHydrated`. `clientStore` is a singleton that
 * hydrates once, so this shows the misleading read rather than the mint.
 */
describe('getClientId and hydration', () => {
  it('cannot see a persisted id before hydration, and does not mint over it after', async () => {
    await AsyncStorage.setItem('macha.clientId.v1', 'persisted-id');

    // On disk, but the store answers null; `getClientId()` here would mint.
    expect(clientStore.isHydrated).toBe(false);
    expect(clientStore.getItem('macha.clientId.v1')).toBeNull();

    await clientStore.hydrate();

    // Twice: a mint would also be stable within a launch.
    expect(getClientId()).toBe('persisted-id');
    expect(getClientId()).toBe('persisted-id');
  });
});
