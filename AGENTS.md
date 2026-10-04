# Principles and laws

[`docs/principles-and-laws.md`](docs/principles-and-laws.md) holds the laws
shared by every Macha project, numbered the same everywhere: **1 control,
2 viewer, 3 loader, 4 do not shoot thyself in the foot**. Its client review
gates apply to any material change.

Cite a law only for a point its own words make; otherwise cite the principle by
name. Never rewrite who said or recorded something, or when, in `TODO/`.

# Branches and releases

- Work on `develop`. Releases are annotated tags on `main`, bare semver
  (`0.4.1`, not `v0.4.1`).
- Never name a branch after a version.
- Put the version bump in the release commit, so the tag is exactly what ships.
- Run `npm run version:check` before tagging. It compares `package.json`,
  `app.json`, the tag and the `*vX.Y.Z*` line under the README title, and
  checks `android.versionCode = major*10000 + minor*100 + patch`. Android
  compares only `versionCode`, so a stale one ships as the old build.

# Core: linked on `develop`, published on `main`

On `develop`, `@machafoundation/core` is `file:../macha-ts` and
`../macha-ts/dist` is what resolves: rebuild core before trusting a typecheck.
`main` pins the published `^x.y.z`; **a `file:` dependency must never reach
`main`**, and `version:check` refuses one.

Before tagging: confirm the version is on npm (`npm view @machafoundation/core
version time --json`), set it in `package.json`, `npm install`, confirm
`test -L node_modules/@machafoundation/core` fails, then typecheck, test and
run `expo export`. Full procedure in `TODO/ACTIVE.md`.

# Expo

Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing code; the APIs have changed.

# Tests

`npm test` runs vitest over logic only; no component rendering.

Not jest-expo: its resolver cannot load core through the `file:` link (it mixes
core's `src` and `dist`, and the ESM specifiers then fail). Vitest handles the
ESM natively, as in core and the web client.

`react-native` and AsyncStorage are aliased to stubs in `src/test/`. A module
that needs more than those stubs should have its logic separated from its
runtime, as `src/playback/policy.ts` is.

**Prove a test protects a fix**: check it fails against the code before the
fix. Coverage for its own sake has caught nothing here.

There is no linter. Do not run `npm run lint`: `expo lint` installs ESLint into
`package.json` without asking. Typecheck and tests are the gate.

# TODO

`TODO/ACTIVE.md` holds current plans and findings; read it before starting
and add to it rather than keeping a plan in a conversation. Finished work moves
to `TODO/COMPLETED.md` with what it measured, including experiments that were
tried and reverted.

# Verify before repeating

Documentation and comments decay faster than code. Treat any claim here, in
the README or in a comment as unverified until you have opened the code it
describes, especially before passing it to another session.
