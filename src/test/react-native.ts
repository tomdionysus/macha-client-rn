/**
 * Just enough React Native for logic under test.
 *
 * `Platform.OS` defaults to ios; a test that cares sets it. Anything else this
 * grows should be a fact about the environment rather than a stand-in for a
 * collaborator — a module needing more than this is a module whose logic wants
 * separating from its runtime.
 */
export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select<T>(spec: { ios?: T; android?: T; web?: T; default?: T }): T | undefined {
    return spec[Platform.OS] ?? spec.default;
  },
};
