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
