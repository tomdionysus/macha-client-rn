/** An in-memory AsyncStorage. The real one is a native module; this is its contract. */
const values = new Map<string, string>();

export default {
  getAllKeys: async () => [...values.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]),
  setItem: async (key: string, value: string) => { values.set(key, value); },
  removeItem: async (key: string) => { values.delete(key); },
  clear: async () => { values.clear(); },
};
