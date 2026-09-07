import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A tiny persistence seam over AsyncStorage.
 *
 * AsyncStorage is asynchronous, but the screens that read client state (the
 * play queue, Continue Watching, the endpoint list) need it synchronously
 * during render. So the store is hydrated once at startup into memory, reads
 * are synchronous from that cache, and writes update the cache immediately and
 * persist in the background. A failed write costs the *next* cold start, never
 * the current session.
 */
class ClientStore {
  private cache = new Map<string, string>();
  private hydrated = false;
  private writes = Promise.resolve();

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('macha.'));
      const entries = await AsyncStorage.multiGet(keys);
      for (const [key, value] of entries) if (value !== null) this.cache.set(key, value);
    } catch {
      // A device with unreadable storage still gets a working, forgetful app.
    }
    this.hydrated = true;
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
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

export function readValidatedJson<T>(key: string, validate: (value: unknown) => value is T): T | undefined {
  const raw = clientStore.getItem(key);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) return parsed;
  } catch {
    // Fall through: invalid persisted state is discarded rather than repaired.
  }
  clientStore.removeItem(key);
  return undefined;
}

export function writeJson<T>(key: string, value: T): T {
  clientStore.setItem(key, JSON.stringify(value));
  return value;
}
