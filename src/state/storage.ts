import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readValidatedJson as coreReadValidatedJson,
  writeJson as coreWriteJson,
} from '@machafoundation/core';

/**
 * Keys this client restores at startup: core uses both `macha.` and `macha-`
 * keys (e.g. `macha-client-progress:`). Anchored on the separator so other
 * libraries' `macha...` keys stay out.
 *
 * Do not swap in core's `isMachaStorageKey`: it lists only core's keys, not
 * this client's (`macha.clientId.v1`, `macha.endpoints.v1`, downloads, ...),
 * and losing the client id orphans every per-client store.
 */
const OWNED_KEY_PREFIXES = ['macha.', 'macha-'] as const;

function owned(key: string): boolean {
  return OWNED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * A synchronous persistence seam over AsyncStorage. Screens read client state
 * during render, so the store is hydrated into memory once at startup, reads
 * come from that cache, and writes update it at once and persist in the
 * background.
 */
class ClientStore {
  private cache = new Map<string, string>();
  private hydrated = false;
  private lostRows = false;
  private writes = Promise.resolve();

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    let keys: string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter(owned);
    } catch (error) {
      this.lostRows = true;
      console.warn('[macha] [storage] unreadable-keys', { error: String(error) });
    }
    try {
      const entries = await AsyncStorage.multiGet(keys);
      for (const [key, value] of entries) if (value !== null) this.cache.set(key, value);
    } catch {
      // One row over Android's ~2 MB CursorWindow fails the whole `multiGet`.
      // Read key by key so only that row is lost, not the client id and config.
      for (const key of keys) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value !== null) this.cache.set(key, value);
        } catch (error) {
          this.lostRows = true;
          console.warn('[macha] [storage] unreadable-key', { key, error: String(error) });
        }
      }
    }
    this.hydrated = true;
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  /** Hydrated with every row: an absent key really is absent, not lost. */
  get readEverything(): boolean {
    return this.hydrated && !this.lostRows;
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  /** Every key hydrated or written since, for reading stores back by name. */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.enqueue(() => AsyncStorage.setItem(key, value));
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    this.enqueue(() => AsyncStorage.removeItem(key));
  }

  /** Serialized so two writes to the same key cannot land out of order. */
  private enqueue(operation: () => Promise<void>): void {
    this.writes = this.writes.then(operation).catch(() => undefined);
  }
}

export const clientStore = new ClientStore();

// Core's helpers, bound to `clientStore`.
export function readValidatedJson<T>(key: string, validate: (value: unknown) => value is T): T | undefined {
  return coreReadValidatedJson(clientStore, key, validate);
}

export function writeJson<T>(key: string, value: T): T {
  return coreWriteJson(clientStore, key, value);
}
