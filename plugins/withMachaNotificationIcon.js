const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Puts the Macha mark in the media notification's status-bar slot.
 *
 * expo-video uses media3's `media3_icon_circular_play` drawable as the small
 * icon. An app resource of the same name wins in resource merging, so copying
 * ours in replaces it without patching the module, and surviving
 * `expo prebuild --clean`.
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
