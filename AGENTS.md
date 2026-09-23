# Branches and releases

Tom's convention across every Macha repo, set 2026-09-13.

Work happens on `develop`, a long-lived branch with a deliberately generic name.
Releases live on `main`, and a release **is** a tag on `main`.

Tags are bare semver — `0.4.1`, never `v0.4.1` — and annotated rather than
lightweight, so `git describe` and `--sort=v:refname` behave.

**Do not name a branch after a version.** A version-named branch is a promise
about what the next version will be, made before the work that decides it. This
repo had a `release/0.5.0` carrying a patch within a day of its being created.

**Put the version bump in the release commit**, so the tag points at a tree that
is exactly what ships rather than at one missing its own version number.

`npm run version:check` compares `package.json`, `app.json`, the tag and the
`*vX.Y.Z*` line under the README's title (Tom, 2026-09-23), and
derives `android.versionCode` as `major*10000 + minor*100 + patch`. Run it before
tagging. It exists because **Android compares `versionCode` and ignores
`versionName` entirely**: every build before 0.4.1 shipped `versionCode 1`, so
0.1.0 and 0.4.0 were the same build as far as the package manager was concerned.
The matching `versionName` drift went unnoticed for months for the same reason —
nothing compared the two files.

# Core: linked on `develop`, published on `main`

Tom's rule, 2026-09-20. `@machafoundation/core` is `file:../macha-ts` on
`develop`, so this client and core move in parallel and `../macha-ts/dist` is
what resolves — rebuild core before trusting a typecheck. A release on `main`
pins the published `^x.y.z`, and **a `file:` dependency must never reach
`main`**: that is a build that works only on one machine.

Before tagging: confirm the core version is really on npm (`npm view
@machafoundation/core version time --json` — three versions were tagged and
never published), switch `package.json` to it, `npm install` (not a lockfile
edit), confirm `test -L node_modules/@machafoundation/core` **fails**, then
typecheck, tests and a real `expo export` against the registry copy.
`npm run version:check` refuses a `file:` dependency on a tagged commit or on
`main`. `TODO/ACTIVE.md` has the full procedure.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Tests

`npm test` runs vitest. Logic only — no component rendering, deliberately:
component tests here would mostly assert what the JSX already says, and the
behaviour worth protecting is not in the views.

**Not jest-expo, despite it being what the Expo docs prescribe.** Its React
Native resolver cannot load `@macha/core` through the `file:` link: the barrel
import resolves into a mix of the package's `src` and `dist`, and core's ESM
`./host.js` specifiers then fail whatever `moduleNameMapper` you write. Vitest
handles the ESM natively and matches what core and the web client already use.
If you ever need to render components, that is the point at which a second
toolchain becomes justified rather than gratuitous.

`react-native` and AsyncStorage are aliased to stubs in `src/test/` rather than
mocked per file — they are environment facts, not collaborators. A module that
needs more than those stubs offer is a module whose logic wants separating from
its runtime; `src/playback/policy.ts` was extracted from the provider for
exactly that reason.

**Write a test to prove a specific fix, then check it fails against the code
before the fix.** Every test here that protects something real was written that
way. Coverage added to a module nobody has broken has, so far across this
project, caught nothing.

# TODO

`TODO/ACTIVE.md` and `TODO/COMPLETED.md` are where work lives — plans,
experiments, findings and conclusions, not just task lines. Read ACTIVE before
starting anything and add to it rather than holding a plan in a conversation.

Finished work moves to COMPLETED with what it measured, and **an experiment that
was tried and reverted belongs there too**: a route found not to work is worth as
much as one that shipped, and costs a day to rediscover. Two are already recorded
that way — the warm-standby and player-priming attempts at seamless failover.

# Inherited claims

This is the newest client in the project, and its documentation decays faster
than its code — the code at least fails when it is wrong. The README, the code
comments and the assumptions here were written against a Macha and a set of
sibling clients that have since moved.

**An inherited claim is not evidence.** Check it before repeating it, and
especially before repeating it to another session: a claim forwarded with a
second name attached looks corroborated when it is only travelling. Every
load-bearing correction this project has had came from someone opening the file;
every wrong one came from a plausible mechanism that fitted the symptom and was
never checked.

`TODO/COMPLETED.md` records the ones caught so far, including the retired
headers this client still generates a UUID for.
