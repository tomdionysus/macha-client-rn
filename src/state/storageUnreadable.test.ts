import { describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unreadableRows } from '../test/async-storage';
import { clientStore } from './storage';

/**
 * On the A85, 2026-09-28: a play queue started from the Tracks tab held the
 * whole library, its row outgrew Android's CursorWindow, and the one
 * `multiGet` of every Macha key threw. `hydrate()` swallowed it and started
 * with nothing: the Connect screen, as if never configured, and a fresh
 * client id minted over the real one. One unreadable row must cost that row,
 * not the store. Its own file because `hydrate()` runs once per process.
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
  });
});
