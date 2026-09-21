/**
 * The codec probe as a test environment sees it: absent.
 *
 * There is no device under vitest, so `MediaCodecList` cannot be asked and the
 * honest answer is "not known". `codecProbe.ts` decides the consequences of
 * that and covers both branches directly — this stub only keeps the Expo
 * native runtime out of a logic suite, the same way `react-native` and
 * AsyncStorage are kept out.
 */
export default null;
