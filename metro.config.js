const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * On `develop`, `@machafoundation/core` is consumed through an npm `file:`
 * link to `../macha-ts`, which npm materialises as a symlink out of the
 * project. Metro only watches the project directory, so the package's real
 * location has to be named explicitly or its modules are invisible to the
 * bundler.
 *
 * A release on `main` pins the published package instead, at which point the
 * dependency is a real directory inside `node_modules` and this entry is
 * unnecessary — but it must not be the tree that resolves. `version:check`
 * refuses a `file:` dependency on a tagged commit for exactly that reason.
 *
 * **Named only when it is actually there**, because a watch folder is a crawler
 * root rather than a hint: a clone on a machine with no `macha-ts` beside it —
 * which is precisely what a release is for — would otherwise hand Metro a root
 * that does not exist. Whether it survives that was never measured, and this
 * removes the need to know.
 */
const corePath = path.resolve(__dirname, '..', 'macha-ts');
if (fs.existsSync(corePath)) config.watchFolders = [corePath];

module.exports = config;
