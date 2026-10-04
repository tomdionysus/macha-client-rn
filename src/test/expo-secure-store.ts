/**
 * Keychain / Keystore stub: synchronous get and set, asynchronous delete.
 * `settle()` lets a test choose when pending deletes land, since the real
 * module promises no ordering.
 */
const values = new Map<string, string>();
const pending: Array<() => void> = [];

export function getItem(key: string): string | null {
  return values.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  values.set(key, value);
}

export function deleteItemAsync(key: string): Promise<void> {
  return new Promise((resolve) => {
    pending.push(() => {
      values.delete(key);
      resolve();
    });
  });
}

/** Test-only: land every delete queued so far. */
export function settle(): void {
  for (const land of pending.splice(0)) land();
}

/** Test-only. */
export function reset(): void {
  values.clear();
  pending.length = 0;
}
