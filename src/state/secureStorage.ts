import * as SecureStore from 'expo-secure-store';
import type { StorageLike } from '@machafoundation/core';

/**
 * Core's `secureStorage`, on the Android Keystore and the iOS Keychain.
 *
 * **Why.** Core keeps the session token here, and falls back to plain
 * `storage` (AsyncStorage) when a host supplies none. That token lives for up
 * to 30 days, in plaintext, readable on a rooted device or in a backup. The
 * app's config plugin sets `configureAndroidBackup`, which keeps this store
 * out of Android Auto Backup.
 *
 * **Removal overwrites, synchronously.** SecureStore can only delete
 * asynchronously, and core expects `removeItem` to take effect at once. A
 * fire-and-forget delete issued by a logout could land after the login that
 * followed it and erase the new token, so the next launch came up anonymous.
 * Writing `''` is synchronous and removes the secret at once, and `getItem`
 * reads `''` as absent. The key itself stays, holding nothing.
 *
 * Keys must be alphanumeric plus `.`, `-` and `_`. Core's one key here is
 * `macha.session.v1`.
 */
export const secureStorage: StorageLike = {
  getItem(key) {
    const value = SecureStore.getItem(key);
    return value === '' ? null : value;
  },
  setItem(key, value) {
    SecureStore.setItem(key, value);
  },
  removeItem(key) {
    SecureStore.setItem(key, '');
  },
};
