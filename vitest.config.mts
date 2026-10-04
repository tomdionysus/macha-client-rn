import { defineConfig } from 'vitest/config';

// Logic tests only, in `node`: nothing under test touches a DOM. Native modules
// that logic reaches are aliased to stubs in src/test/, not mocked per file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Array form so a regex can catch the codec probe's relative imports.
    alias: [
      { find: 'react-native', replacement: new URL('./src/test/react-native.ts', import.meta.url).pathname },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: new URL('./src/test/async-storage.ts', import.meta.url).pathname,
      },
      { find: 'expo-crypto', replacement: new URL('./src/test/expo-crypto.ts', import.meta.url).pathname },
      { find: 'expo-secure-store', replacement: new URL('./src/test/expo-secure-store.ts', import.meta.url).pathname },
      {
        find: /^.*modules\/macha-codecs\/src\/MachaCodecsModule$/,
        replacement: new URL('./src/test/macha-codecs.ts', import.meta.url).pathname,
      },
    ],
  },
});
