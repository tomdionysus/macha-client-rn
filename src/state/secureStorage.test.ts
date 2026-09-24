import { beforeEach, describe, expect, it } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { secureStorage } from './secureStorage';

const stub = SecureStore as unknown as typeof SecureStore & { settle(): void; reset(): void };

/**
 * Core keeps the session token in `secureStorage`, which it reads and writes
 * synchronously. SecureStore deletes asynchronously only, so a delete issued
 * by a logout can land after the login that followed it.
 */
describe('secureStorage', () => {
  beforeEach(() => stub.reset());

  it('reads back what it wrote', () => {
    secureStorage.setItem('macha.session.v1', 'token-a');
    expect(secureStorage.getItem('macha.session.v1')).toBe('token-a');
  });

  it('forgets at once on removal, before any delete could land', () => {
    secureStorage.setItem('macha.session.v1', 'token-a');
    secureStorage.removeItem('macha.session.v1');
    expect(secureStorage.getItem('macha.session.v1')).toBeNull();
  });

  // Logout, then a quick login. With a fire-and-forget delete, the delete
  // landed after the login's write and erased the new token, so the next
  // launch came up anonymous: the silent logout this storage exists to end.
  it('keeps a token written after a removal, whenever the removal settles', () => {
    secureStorage.setItem('macha.session.v1', 'token-a');
    secureStorage.removeItem('macha.session.v1');
    secureStorage.setItem('macha.session.v1', 'token-b');
    stub.settle();
    expect(secureStorage.getItem('macha.session.v1')).toBe('token-b');
  });
});
