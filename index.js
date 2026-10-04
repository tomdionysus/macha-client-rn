/**
 * Custom entry point. The track-player service must register before the app, so
 * this uses `require`: hoisted `import`s would run expo-router's entry first.
 */
const TrackPlayer = require('react-native-track-player').default;
const { trackPlayerService } = require('./src/playback/trackPlayerService');

TrackPlayer.registerPlaybackService(() => trackPlayerService);

require('expo-router/entry');
