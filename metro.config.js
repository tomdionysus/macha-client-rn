const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * On `develop`, core is a `file:` link to `../macha-ts`, a symlink outside the
 * project that Metro would not otherwise watch. On `main` core comes from npm
 * and this is unused. Added only if the directory exists, since a watch folder
 * is a crawler root and a clone without `macha-ts` beside it must still build.
 */
const corePath = path.resolve(__dirname, '..', 'macha-ts');
if (fs.existsSync(corePath)) config.watchFolders = [corePath];

module.exports = config;
