import { defineConfig } from 'vitest/config';

// Logic tests only, deliberately. Component tests mostly assert what the JSX
// already says, and the behaviour worth protecting here is not in the views.
//
// `node` rather than a DOM: nothing under test touches one. The two React
// Native modules that pure logic reaches — the platform constant and the
// storage backend — are aliased to stubs rather than mocked per file, because
// they are environment facts rather than collaborators.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'react-native': new URL('./src/test/react-native.ts', import.meta.url).pathname,
      '@react-native-async-storage/async-storage': new URL('./src/test/async-storage.ts', import.meta.url).pathname,
    },
  },
});
