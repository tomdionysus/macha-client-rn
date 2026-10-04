/**
 * Just enough React Native for logic under test. `Platform.OS` defaults to ios.
 * Keep this to environment facts; a module needing more should separate its
 * logic from its runtime.
 */
export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select<T>(spec: { ios?: T; android?: T; web?: T; default?: T }): T | undefined {
    return spec[Platform.OS] ?? spec.default;
  },
};

/** No panel unless a test gives one, as it sets `Platform.OS`. */
export const Dimensions = {
  screen: { width: 0, height: 0, scale: 1, fontScale: 1 },
  get(_dimension: 'screen' | 'window') {
    return Dimensions.screen;
  },
};
