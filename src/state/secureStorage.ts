import * as SecureStore from 'expo-secure-store';
import type { StorageLike } from '@machafoundation/core';

/**
 * Core's `secureStorage` (where it keeps the session token), on the Android
 * Keystore and iOS Keychain; without it core would use plain AsyncStorage.
 * `configureAndroidBackup` in app config keeps it out of Android Auto Backup.
 *
 * `removeItem` writes `''` (read back as absent) because SecureStore deletes
 * only asynchronously, and a late delete could erase the token of a login
 * that followed. Keys: alphanumerics plus `.`, `-`, `_`.
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
