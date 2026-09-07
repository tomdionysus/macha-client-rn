const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Puts the Macha mark in the media notification's status-bar slot.
 *
 * expo-video's playback service calls
 * `setSmallIcon(androidx.media3.session.R.drawable.media3_icon_circular_play)`,
 * which is a generic play glyph. An application resource with the same name
 * wins over a library's during resource merging, so dropping our drawable in
 * replaces it without patching the module.
 *
 * This lives in a plugin rather than being edited into `android/` by hand so it
 * survives `expo prebuild --clean`, which regenerates that directory.
 */
module.exports = function withMachaNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (innerConfig) => {
      const source = path.join(innerConfig.modRequest.projectRoot, 'plugins', 'media3_icon_circular_play.xml');
      const targetDir = path.join(
        innerConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable',
      );
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, path.join(targetDir, 'media3_icon_circular_play.xml'));
      return innerConfig;
    },
  ]);
};
