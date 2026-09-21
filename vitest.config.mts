import { defineConfig } from 'vitest/config';

// Logic tests only, deliberately. Component tests mostly assert what the JSX
// already says, and the behaviour worth protecting here is not in the views.
//
// `node` rather than a DOM: nothing under test touches one. The native modules
// that pure logic reaches — the platform constant, the storage backend and the
// UUID source — are aliased to stubs rather than mocked per file, because they
// are environment facts rather than collaborators.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Array form rather than the object map, because the codec probe is
    // imported by a relative specifier and only a pattern can catch it
    // wherever it is imported from.
    alias: [
      { find: 'react-native', replacement: new URL('./src/test/react-native.ts', import.meta.url).pathname },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: new URL('./src/test/async-storage.ts', import.meta.url).pathname,
      },
      { find: 'expo-crypto', replacement: new URL('./src/test/expo-crypto.ts', import.meta.url).pathname },
      // The codec probe is a device fact, and there is no device here.
      {
        find: /^.*modules\/macha-codecs\/src\/MachaCodecsModule$/,
        replacement: new URL('./src/test/macha-codecs.ts', import.meta.url).pathname,
      },
    ],
  },
});
