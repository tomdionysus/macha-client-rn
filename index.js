/**
 * Custom entry point.
 *
 * react-native-track-player's background service must be registered before the
 * app is registered, so this uses `require` rather than `import`: ES imports
 * are hoisted, which would run expo-router's entry first regardless of where
 * the registration appeared in the file.
 */
const TrackPlayer = require('react-native-track-player').default;
const { trackPlayerService } = require('./src/playback/trackPlayerService');

TrackPlayer.registerPlaybackService(() => trackPlayerService);

require('expo-router/entry');
