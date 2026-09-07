const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * `@macha/core` is consumed through an npm `file:` link, which npm materialises
 * as a symlink out of the project. Metro only watches the project directory,
 * so the package's real location has to be named explicitly or its modules are
 * invisible to the bundler.
 */
config.watchFolders = [path.resolve(__dirname, '..', 'macha-ts')];

module.exports = config;
