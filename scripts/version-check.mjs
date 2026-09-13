#!/usr/bin/env node
/**
 * The three places a version is stated must agree.
 *
 * `package.json` is what the repo calls itself, `app.json` is what Expo writes
 * into the built app, and the git tag is what a release is found by. They have
 * drifted before and the drift is silent: the Android project carried 0.1.0
 * while the repo was at 0.3.5, and the device reported 0.1.0 for months because
 * nothing ever compared them.
 *
 * `versionCode` is checked too, and it matters more than it looks. Android
 * compares that integer and ignores the name entirely, so two builds sharing a
 * code are the same build as far as the package manager is concerned. The
 * convention here is major*10000 + minor*100 + patch, which is monotonic and
 * reads back as the version it came from.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const pkg = read('package.json');
const app = read('app.json').expo;
const problems = [];

if (pkg.version !== app.version) {
  problems.push(`package.json says ${pkg.version}, app.json says ${app.version}`);
}

const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) {
  problems.push(`${pkg.version} is not a bare x.y.z version`);
} else {
  const [, major, minor, patch] = match.map(Number);
  const expected = major * 10000 + minor * 100 + patch;
  if (app.android?.versionCode !== expected) {
    problems.push(`android.versionCode is ${app.android?.versionCode ?? 'unset'}, expected ${expected} for ${pkg.version}`);
  }
}

// Only when this commit is tagged. An untagged commit is ordinary work in
// progress, not a disagreement.
let tag;
try {
  tag = execSync('git describe --tags --exact-match', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  tag = undefined;
}
if (tag && tag !== pkg.version) {
  problems.push(`this commit is tagged ${tag} but package.json says ${pkg.version}`);
}

if (problems.length > 0) {
  console.error('Version mismatch:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`${pkg.version} (versionCode ${app.android.versionCode})${tag ? `, tagged ${tag}` : ''} — consistent`);
