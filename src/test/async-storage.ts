/** An in-memory AsyncStorage. The real one is a native module; this is its contract. */
const values = new Map<string, string>();

/**
 * Keys whose row Android's SQLite cannot read back: over the ~2 MB
 * CursorWindow, a read that touches one throws `SQLiteBlobTooBigException`,
 * and a `multiGet` fails as a whole. A test adds keys here to reproduce that.
 */
export const unreadableRows = new Set<string>();

function tooBig(key: string): Error {
  return new Error(`Row too big to fit into CursorWindow (${key})`);
}

export default {
  getAllKeys: async () => [...values.keys()],
  multiGet: async (keys: string[]) => {
    const unreadable = keys.find((key) => unreadableRows.has(key));
    if (unreadable) throw tooBig(unreadable);
    return keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]);
  },
  getItem: async (key: string) => {
    if (unreadableRows.has(key)) throw tooBig(key);
    return values.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => { values.set(key, value); },
  removeItem: async (key: string) => { values.delete(key); },
  clear: async () => { values.clear(); },
};
