const { getDefaultConfig } = require('expo/metro-config');

/**
 * `@machafoundation/core` is installed from the registry, so it is a real
 * directory inside `node_modules` and Metro finds it without help.
 *
 * This file used to add `../macha-ts` to `watchFolders`, because core was
 * consumed through an npm `file:` link that npm materialises as a symlink out
 * of the project and Metro only watches the project directory. That went with
 * the link: pointing the bundler at a sibling working tree it no longer
 * compiles against is how a second copy of core gets into a bundle.
 */
module.exports = getDefaultConfig(__dirname);
