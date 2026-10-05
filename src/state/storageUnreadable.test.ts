import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unreadableRows } from '../test/async-storage';
import { clientStore } from './storage';

/**
 * A row over Android's CursorWindow makes `multiGet` throw; it must cost only
 * that row. Its own file because `hydrate()` runs once per process.
 */
describe('ClientStore.hydrate with a row too big to read', () => {
  it('keeps every other key', async () => {
    await AsyncStorage.setItem('macha.endpoints.v1', '{"version":1,"urls":["https://node"]}');
    await AsyncStorage.setItem('macha.clientId.v1', 'client-1');
    await AsyncStorage.setItem('macha.playbackQueue.v1.client-1', 'x'.repeat(10));
    unreadableRows.add('macha.playbackQueue.v1.client-1');

    await clientStore.hydrate();

    expect(clientStore.getItem('macha.endpoints.v1')).toBe('{"version":1,"urls":["https://node"]}');
    expect(clientStore.getItem('macha.clientId.v1')).toBe('client-1');
    expect(clientStore.getItem('macha.playbackQueue.v1.client-1')).toBeNull();
    // So nothing may treat an absent key as never written, e.g. the download sweep.
    expect(clientStore.readEverything).toBe(false);
  });
});
