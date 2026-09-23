# Active

Open work for `macha-client-rn`. Plans, experiments and conclusions live here
while they are live; finished ones move to [COMPLETED.md](COMPLETED.md) with what
they measured rather than being deleted.

Ranked P1 (do next) down to P3 (real, but nobody has lost a minute of playback to
it). There is no P0 today. Items marked **putative** are speculative and may
never happen — carried deliberately, because being surprised by one costs more
than carrying it.

**An inherited claim is not evidence.** Where a peer's claim was checked against
source or a device, it says so; where it was taken on trust, it says that too.
Several entries below exist only because somebody opened the file instead of
repeating what they were told.

Last rationalised 2026-09-23, after 0.8.0 was tagged, pushed and installed on
the A85 against published core 0.18.0. The whole of 2026-09-21 — the codec
probe, seven fixes, the route cutover, five retractions and the release — is
in COMPLETED; what is left here is what is still open, with the day's evidence
cited rather than repeated.

---

## Start here

**Handover rationalised 2026-09-23 for a session starting cold after a
`/clear`. Read this before anything.**

### Where the code is

**`main` is at `7932542`, tagged `0.8.0`, pushed.** The tag is annotated, bare
semver, and `version:check` was re-run against it: `0.8.0 (versionCode 800),
tagged 0.8.0 — consistent`. That run was the first time the two checks that
fire only in a release context — the tag against `package.json`, and the
refusal of a `file:`/`link:` dependency — had ever executed on this tree.

**`develop` is `main` plus the link restoration, the tag record, and this
rationalisation.** `git log develop..main` is empty and must stay so: the
0.8.0 bump was made on `main` and `develop` was fast-forwarded onto it
afterwards, which is what keeps the next release a fast-forward rather than a
merge conflicting on `package.json`. Everything up to `96cfe5f` is on
`origin`; **the rationalisation commit is not pushed** — push is Tom's.

**Suite: 204 tests across 19 files, typecheck clean**, run both ways on
2026-09-21 — against the registry copy of core 0.18.0 on `main`, and against
core `a3b40ca` through the link on `develop`. A real `expo export` produced a
4.9 MB Hermes bundle from the registry copy. Working tree clean but for
`.claude/settings.json`, `CLAUDE.local.md` and `basemind.toml`, none of which
are this work.

### Core

`package.json` pins `file:../macha-ts` on `develop`; a release on `main` pins
the published package; **a `file:` dependency must never reach `main`**, and
`version:check` refuses one there mechanically. **Core `0.18.0` is on npm**
(2026-09-21T19:31Z) and 0.8.0 pins `^0.18.0`. `../macha-ts` was at `a3b40ca` (= `0.18.0`) on
2026-09-21 and **had moved to `51e1ad8` plus uncommitted edits by 2026-09-23
18:50** — six commits, all in `PlaybackCoordinator`/`PlaybackRuntime`, which
this client does not call. Every core export used by the 2026-09-23 work was
checked present in the `0.18.0` tag, so a release pinning `^0.18.0` still
carries them. `git -C ../macha-ts describe --tags` and a core rebuild before
trusting a typecheck.

**Use `npm run dist:hash` in core and nothing else** for the dist figure; every
hash in this file from before 2026-09-21 19:00 is the narrower `*.js`-only one
and is not comparable.

### What is on the phone

**The A85 is on an unreleased dev build, not the tagged 0.8.0.** Installed
2026-09-23 18:59:32 from `develop` at `15a1e0b`, core through the link at
`../macha-ts` `51e1ad8` (six commits past `0.18.0`, all in
`PlaybackCoordinator`/`PlaybackRuntime`, which this client does not use),
**core `dist:hash` `a02a2d979817`**, `dist` built 17:55 before that repo's
uncommitted edits. It still says `versionCode 800` because the version was
not bumped — **so the package manager cannot tell it from 0.8.0**, and
neither can anyone reading `dumpsys`. Identify it by `lastUpdateTime`.

To put the release back: build `assembleRelease` from `main` at `7932542`
with the registry core (the procedure under *Releasing*), and `install -r`.
A copy of the 0.8.0 APK was kept only in a session scratchpad, which does
not survive the session — do not count on it.

**The tagged 0.8.0 was seen running before that**, 2026-09-23 17:53 —
COMPLETED has the transcode play, and the Remux black screen it then showed.

**Build times, measured:** 90 seconds to 3.5 minutes incremental; **37 minutes
cold** (778 Gradle tasks, 2026-09-21), and that cold build shared the machine
with a concurrent Gradle build from `macha-client-rn-tv`. `expo prebuild`
clears `android/`, so the first build after a prebuild is always cold.
`assembleRelease` autolinks `modules/macha-codecs` on its own. **On
2026-09-23 `:app:packageRelease` failed once in `IncrementalSplitterRunnable`
with nothing wrong, deleted the old APK, and passed on a plain rerun** — check
the APK's timestamp, not just the exit code of the first attempt.

### Driving the phone — read this before sending a single tap

**Twice in one session blind taps landed outside the app**: once starting a
timer in the Clock app, once opening a private WhatsApp conversation. Nothing
was typed or sent either time, and both were noticed and backed out of, but
both were avoidable and neither should have happened.

**The rule already written in this file was the one broken: check
`mCurrentFocus` and abort if it is not `foundation.macha.client`.** It was
being applied as a habit rather than as a gate. **Do not send `input tap` or
`input swipe` without checking focus immediately beforehand, in the same
invocation, and abandoning the sequence if it fails.** An install, a
relaunch, or an incoming notification is enough to lose it.

Two more device facts: wireless debugging is the only route and **its port
rotates** (`41931`, then `35737` in one evening) — rediscover with `adb mdns
services`; and **two televisions also answer ADB**, so every command needs an
explicit `-s`.

**A secure lock screen is a wall.** `KEYCODE_WAKEUP` and `wm dismiss-keyguard`
wake the screen and clear a swipe keyguard; they do not clear a PIN or a
pattern, and neither does `cmd statusbar collapse` or `KEYCODE_BACK` —
`mCurrentFocus` reads `NotificationShade` throughout. Measured 2026-09-21
23:32. **Do not attempt a PIN.** Ask Tom to unlock it, and treat anything
"observed" while it was locked as not observed.

### What shipped in 0.8.0, in one line each

- **The codec claim is measured, not asserted.** `modules/macha-codecs` asks
  `MediaCodecList`; `videoCodecs`, `audioCodecs`, `videoBitDepth`, `hdr` and
  `dolbyVision` all derive from it, and the HLS delivery lists are the decode
  lists. Two films that played silently now have sound.
- **The bar no longer resets to zero** on a transformed generation.
- **A mode switch we caused no longer triggers a failover** it cannot win.
- **A refused mode switch reaches the viewer**, in a sentence rather than
  core's nested envelopes.
- **Remux asks for a transform the device can play**, and renames the mode
  when it cannot copy the audio. **Audio only** — it copied ten-bit HEVC
  the A85 cannot decode; fixed on `develop` 2026-09-23, not in 0.8.0.
- **A session granted no roles is told to sign in**, not to find an
  administrator.
- **`busy` is no longer stranded**, which had disabled Play until restart.

All seven were seen working on the A85 on 2026-09-21 — **on the dev build of
this tree, not on the tagged 0.8.0**, which nobody has yet seen past the lock
screen. The evidence for each is in COMPLETED under that date.

### Open, in the order worth taking them

1. **"Try again" after a failure started the next episode from zero.** New
   P1 below, mechanism suspected; the logging to prove it is committed and
   not yet built. The failure message now tells viewers to try again, so
   this comes first.
2. **The rest of the smoke test.** Done on hardware 2026-09-23: transcode
   play, Remux blocked with its reason, the guard reporting on Direct. Still
   unrun: remux on an eight-bit title, a quality change, the create-failure
   copy (nothing failed to start), the player-failure copy. **The account cap
   still cannot be tested** — the node limit refuses first.
3. **The reaped-session probe.** P1 below. **Read `docs/resolver-direct.md` in
   core first** — it exists (checked 2026-09-23), it is the contract for hosts
   driving the resolver without a coordinator, written partly from this
   client's case, and it is unread here.
4. **The failure screen and the seek path.** P2 below — chrome over the
   panel, one `describeError` left, and whether Direct should be marked
   unavailable like Remux (Tom's call, not yet asked).
5. **Zulu.** P2 below.
6. **544 MPEG-4 Part 2 files.** P2 below.
7. **AV1 ten-bit SDR.** P2 below.

Done 2026-09-23 and in COMPLETED: 0.8.0 seen running; refusal copy through
`playbackFailureDetail`; the supersede guard reports; Remux unavailable with
a reason; a failed start in words a viewer can use.

### The habit that paid, and the one that did not

**Five claims were retracted on 2026-09-21 and every one was caught by opening
the file** — not by argument, and not by anybody's confidence. The `delay_moov`
mechanism, a codec census read mid-write, "remux is broken", a recommendation
built on an unverifiable hardware claim, and a causal story of mine about
which objection was transcoding ten-bit HEVC. They are struck through in place
rather than deleted, because the retraction is the useful part.

**Inherited claims are still the main hazard here, and relayed ones lose their
cost on the way.** "One `pm clear` and a login" is a complete instruction that
says nothing about 539 MB of downloads. Whoever relays is the last person who
can attach the price.

### Releasing — run end to end twice now, and none of it optional

0. **Leaving the link needs the ranged install; returning needs nothing
   special.** `npm install @machafoundation/core@^x.y.z` replaces the symlink
   and rewrites the lockfile entry to a registry tarball in one step. A
   `package.json` edit plus plain `npm install` does **not**, and neither does
   deleting `node_modules/@machafoundation` first — npm restores the link from
   the lockfile entry. Coming back, `package.json` to `file:../macha-ts` and a
   plain `npm install` restores the link and
   `{"resolved": "../macha-ts", "link": true}`. Measured for 0.7.0 and again
   for 0.8.0, npm 11.9.0 / node 24.14.0. **Read `resolved` in the lockfile,
   never `package.json` and never the version string.** The television
   session's competing account concerns the delete-then-plain-install case;
   that case has not been re-run and their answer has not arrived.
1. Confirm the version is **actually on npm**: `npm view @machafoundation/core
   version time --json`. Three core versions were tagged and never published,
   and one publish was announced complete after failing `EOTP`.
2. `npm install @machafoundation/core@^x.y.z`. Either on `main` after a
   fast-forward from `develop` (0.8.0), or on `develop` with `main`
   fast-forwarded to it afterwards (0.7.0). **Either way `develop` must end up
   containing the release commit.**
3. `test -L node_modules/@machafoundation/core` must **fail**, and the lockfile
   `resolved` must be a registry URL. Those two cannot lie.
4. Bump `package.json` and `app.json` (`versionCode` = major*10000 +
   minor*100 + patch) **in the same commit**; `npm install` to sync the
   lockfile's own version; `npx expo prebuild --platform android`; `npm run
   version:check`; typecheck; tests; a real `expo export`.
5. Commit; `git tag -a x.y.z`; push `main` and the tag; `version:check` once
   more with the tag in place. Then back on `develop`: `file:../macha-ts`,
   plain `npm install`, `test -L` must **succeed**, suite green, commit.
6. `assembleRelease` from `main` with the registry copy installed. Gate the
   install on `ro.product.model` **and** `ro.serialno` in the same invocation
   as `adb -s <A85> install -r`, and confirm `dumpsys package
   foundation.macha.client` reports the new `versionCode`.

**What a build contains is answerable only if you write it down.** Under the
link an APK carries whatever `../macha-ts/dist` held when Gradle ran: record
the core SHA and `npm run dist:hash` beside any device measurement. A release
build from `main` carries the registry tarball, whose integrity hash is in the
lockfile — a better identity, and COMPLETED's 0.8.0 entry records it.

### What is verified on hardware, which is the useful half of knowing

Measured on the A85 against the live cluster: the node-address rows, the media
access gate and its header warning, the access-aware empty copy, Continue
Watching filtering, seek repositioning, a wrong password, a **successful**
login, sign-in surviving a force-stop, and the 2026-09-16 run recorded in
COMPLETED (cold start, throughput abstaining, catalogue sizes). **Never used
by a person:** the QR scanner. **Never run on hardware at all:** the gate's
`no-session` branch, which needs `allow_anonymous` off to reach, and the
node-row paste path, which `adb shell input text` cannot emulate.

**None of it has been re-verified on 0.8.0.** Everything measured on
2026-09-21 was on the dev build of the same tree; the tagged build has only been
seen to install and start.

**`ReactNativeJS` logs reach `logcat` from a release build.** `adb logcat |
grep ReactNativeJS` shows core's routing, health and registry logs live. It is
the cheapest instrument this client has.


### Devices

Deploy with `adb -s <device> install -r android/app/build/outputs/apk/release/app-release.apk`
after `npx expo prebuild --platform android` and a Gradle `assembleRelease`.
**Do not skip prebuild after a version bump.** Every command needs `-s`.

- **Blackview A85**, serial `A85EEA0000005410`, Android 12. Has a **dev build
  of `15a1e0b`** labelled `versionCode 800` since 2026-09-23 18:59 (*What is
  on the phone*). Wireless debugging was at `10.35.1.164:45101` on
  2026-09-23, `:35737` and `:41931` on 2026-09-21: the port rotates, so
  rediscover with `adb mdns services` (`_adb-tls-connect._tcp`), then `adb
  connect <host>:<port>`; the first connect sometimes times out and the second
  succeeds. It drops when the phone sleeps — a screenshot of a sleeping phone
  is solid black; check `dumpsys power` for `mWakefulness` and send
  `KEYCODE_WAKEUP` before believing a blank capture. **It has a secure lock
  screen** that no ADB command here clears. It has **both** a remote TLS
  cluster (`https://macnessa.macha.network`, `ramaroja`) and a **LAN node at
  `10.35.1.50`** configured; on the last smoke test playback went to the LAN
  node while the catalogue came from `macnessa`. The LAN is `10.35.1.x`.
- **Samsung SM-G996B** (Galaxy S21+), serial `RFCRA0JJN6B`, Android 15. Has
  **0.4.0** and **no endpoints configured**, so it opens on the connect screen
  — the right device for first-run and QR in one pass.
- **Two televisions answer ADB and neither is a test target.**
  `10.34.1.115:5555` (`Smart_TV`, product `G07_4K_GB_NF`) and
  `10.35.1.133:5555` (`Smart_TV`, product `G10_4K_GB_NF_32BIT`) were both
  attached on 2026-09-21 beside the phone. An install must be gated on
  `ro.product.model` and `ro.serialno` **in the same invocation**, and every
  command needs an explicit `-s`.

**Check the foreground before driving the phone.** Blind `adb input` chains have
landed in another app mid-sequence. `dumpsys window | grep mCurrentFocus` first,
and abort if it is not `foundation.macha.client`.

### Peer sessions

Core answers to **`Macha Client Core`** — the name `ListAgents` printed on
2026-09-20 and the one a send reached first time. Earlier notes here about
`Macha NPM Core` and a name containing a slash are stale. There are two
`Macha Server` rows; the live one needs its `[ref]`. Send with
`notify_when_idle` and carry on; a reply arrives as a cross-session message.

---

---

## P1 — "Try again" after a failure started the next episode from zero

**Seen on the A85 2026-09-23 19:05, dev build `15a1e0b`. The mechanism is
suspected, not seen.** *Dark* S01E01 failed on a forced Direct play (the
guard now reports it — COMPLETED, same date); the viewer's position was
`2:21`. Tapping **Try again** stopped the session and created one for
`tmdb:episode:1375782` — a different episode — at `seekMs: 0`. `retry()`
reloads `queueRef`'s current index at `positionRef`, so a real retry would
have asked for `1279454` at about `141000`.

**What fits:** the result is exactly `advanceBy(1)` — next item, its own
remembered position — which only `skipNext` and the `playToEnd` listener
call. That listener's own comment says *"replacing a source with null can
itself emit playToEnd"*, and `load` sets `mediaRef` **before** its
`player.replace(null)`, so the `if (!media) return` guard would not stop it.
The native media session went to state 7 (error) at `141240` and then to
`0` just before the stop, which is consistent and proves nothing more.

**It may explain a second thing.** The same listener retires the item from
Continue Watching. After the 18:31 black screen on the tagged 0.8.0, *Dark*
had vanished from Continue Watching by 18:59 and S01E01's row showed no
progress bar. A spurious end would do exactly that. Also unproven.

**Not fixed, deliberately.** A `play-to-end` log line (item, position,
duration, `player.status`) is committed after `15a1e0b` and **not yet in any
build**. Next build: fail a title (Direct on *Dark* does it), tap Try again,
and read whether `play-to-end` fires with a position far from the duration
and `status: 'error'`. If it does, the fix is the listener refusing an end
that is not near the end, or one arriving while a load owns the player —
with a test built from these numbers first. The message this client now
shows on that screen **tells the viewer to try again**, so this is the next
thing to take.

---

## P1 — A reaped session is charged to the node that answered honestly

**From core 0.13.0. The resolver half reaches this client and is unused; the
coordinator half does not reach us at all.** Core initially told this client
that nothing in 0.13.0 was reachable here, then withdrew it — `sessionAlive`
and `regenerate` are public on `ClusterPlaybackResolver`, new in that tarball,
and are exactly the tools this fault needs.

**The condition.** A viewer pauses for more than `session_idle` (30 minutes;
`SERVER_SESSION_IDLE_MS`). The node reaps the play session — correctly. The
viewer resumes, the buffer plays out, media3 asks for the next fragment, gets
`404 not_found`, and raises a fatal error. `statusChange` sees `error` and
calls `failoverSource`, whose only exit is `failover`, whose first act is
`recordEndpointFailure`. So the node that answered honestly is charged,
dropped, and the viewer is sent to a node that never held the session. Core
observed exactly that live on 2026-09-17.

**This client cannot see the 404** (`PlayerError` is `{ message }`), so it
cannot classify the error. **It can ask instead.** `sessionAlive(sessionId)`
is pinned to the owning node, does no walk, and **records nothing against the
registry in either direction** — core's comment: a probe that moved the
registry "would make asking a question cost the node something, which is how
a diagnostic turns into the fault it was meant to diagnose". So probing before
spending failover budget is free.

### The sequence, corrected by core on 2026-09-20 — do not build the naive one

The obvious version ("probe; regenerate on false; failover on true or on a
throw") is wrong in its last clause, and core has measured the cost.

- **`alive === false` → `regenerate`.** Same node, no charge, and core
  releases the old session *before* creating and waits for it, because the
  node's one transcode slot is held by the session being replaced.
- **A `sessionAlive` throw is two unrelated things and they want opposite
  actions.** "no endpoint provenance" means the resolver holds no record of
  that id **because it was already released** — nothing is wrong and nothing
  needs recovering. Treating it as "could not find out" cost a viewer 82
  seconds of playable video on 2026-09-17: a late fatal named a superseded
  source, the probe threw, the throw sent it to failover, and failover
  released a replacement that was already built and waiting. A transport
  failure is the other case and gets ordinary evidence handling.
- **`regenerate` has its own distinct throw**, "has no endpoint to regenerate
  on", when the endpoint has gone from the registry. **There failover is
  right.** Two throws, two answers, and only one of them is in a docstring.
- **Regeneration must be bounded.** Core logs
  `session-regeneration-made-no-progress`: a second not-found at the same
  position means the regeneration changed nothing and the next step must
  differ. Without the bound this loops against a node that keeps answering
  the same way.

**Core survives the superseded-source trap only through coordinator machinery
this client does not have** — `failNow` checks `pendingReplacement` before
reaching the probe. So the equivalent has to be built here, and core's advice
is to **track which session id is current and ignore failures naming a
superseded one**, rather than matching on the provenance message, which is
core's text to change.

**And this client's shape makes it worse in a way core's warning does not
quite cover.** `failoverSource` reads `sessionRef.current`, so a late error
from a dying source does not probe the old id at all — it probes the **new**
one, finds it alive, and under the plan above fails over, discarding a
regeneration completed a second earlier. A dying source keeps talking; core
has that measured three ways. So the guard cannot be "ignore a throw naming
a superseded id" alone: **the error itself has to be attributable to a
generation**, and expo-video does not label it. The likely shape is a short
quiet period after `player.replace`, in the same spirit as
`errorBlamesEndpoint`'s seek window, rather than a session-id test. **Decide
this before writing the probe**, because a wrong guard here turns a fixed
fault into a worse one.

**And it gets harder, not easier, once an account may hold several live
sessions** - core's point on 2026-09-21, with the REST-resource change above.
A quiet period after `player.replace` has to hold under that too. Recorded as
a constraint on the design, not as a reason to consider it settled.

### One deliberate divergence from core, recorded as a choice

On `alive === true` core does **not** fail over: it logs
`source-not-found-on-live-session` and stops, because an alive session
answering 404 for a fragment is a fragment past the end of a live plan, the
node is fine, and replacing it fixes nothing. **This client cannot tell that
case apart**, because expo-video hides the status, so `alive → failover`
stays. It is strictly better than today, where everything fails over, and
core agrees it is defensible — but it means this client will fail over on a
case core deliberately does not. **That is a choice, not a side effect.**

### Doing it

- Add `sessionAlive` and `regenerate` to `ClusterPlaybackApi`
  (`src/api/playback.ts`).
- Put the decision in `policy.ts` as a pure function over (probe result,
  throw kind, attempt count, position) so it can be tested without the
  player, the way `errorBlamesEndpoint` already is. **Prove each branch fails
  against the current code first** — and check *why* each is red, which is
  the failure mode core and the web client both hit this week.
- **Also worth doing proactively:** on `AppState` returning to `active` with
  a session older than a few minutes, ask before the viewer presses play
  rather than after the fragment fails. Not measured; the reactive half is
  enough to stop charging the node.
- Verify on the A85: pause 31 minutes, resume, read `logcat` for a
  regenerate rather than a `failover-attempt`.

**Core owes a docs section and has filed it.** The recovery sequence is
documented nowhere — every method has a docstring, the sequence has none,
because core only ever documented it through `PlaybackCoordinator`. Three of
four clients now drive playback below that class. When
`docs/writing-a-player.md` grows a resolver-level recovery section, check it
against this item rather than replacing this item with it.

---

## P1 — media3's bytecode says a segment 500 is retried; our device said it is fatal

**Unresolved contradiction, found 2026-09-20 while answering a question from
core.** It matters because both P1s around it reason about what the player
does with a refused fragment.

**What the artifacts say.** `DefaultLoadErrorHandlingPolicy`, disassembled
from the Gradle-cached `media3-exoplayer` AARs and byte-identical in **1.8.0
and 1.9.0**:

- `isEligibleForFallback` returns true for an `InvalidResponseCodeException`
  whose status is one of **403, 404, 410, 416, 500, 503**. That governs
  *fallback* — switching track or location — not retry.
- `getRetryDelayMsFor` returns `C.TIME_UNSET` (do not retry) only for
  `ParserException`, `FileNotFoundException`, `CleartextNotPermittedException`,
  `UnexpectedLoaderException` and a position-out-of-range cause. **An HTTP
  status error is in none of those**, so it falls through to
  `min(errorCount * 1000, 5000)` — a retry with backoff.

**What this repo measured.** COMPLETED's 0.5.1 entry records, from the A85
against a real node on 2026-09-13, that a segment `500` was **fatal on first
occurrence on the HLS path**. That finding is load-bearing: it is the stated
reason the server's hold is "the entire retry budget in the system", and it is
half the argument for `seekRequiresReposition`.

**Both cannot be right.** The plausible reconciliation is that the HLS chunk
path reaches the loader through `HlsChunkSource.onChunkLoadError` and a
fallback that is unavailable with a single variant, so something above the
policy goes terminal before the retry delay is consulted. **That is a guess
and must not be recorded as anything else** — it is precisely the shape of
explanation this project keeps being caught by.

**Why P1 rather than a curiosity.** Nothing that cites it is wrong because of
it, but three things now do. If a segment 500 *is* retried, the seek-reposition
fix is protecting against something with a different mechanism than recorded,
and `SEEK_HOLD_MARGIN_MS` — 2_000 ms above the node's hold, shipped 2026-09-21
— is too small, because the hold would then be spent more than once before the
player gives up. The margin was written not sized on this deliberately; settling
it is what says whether that was generous enough.

**How to settle it, and it needs the phone:** play a transformed generation,
seek well past production, and read `logcat` for whether media3 issues repeat
fragment requests with roughly 1 s then 2 s backoff before going terminal, or
goes terminal at once. The 2026-09-13 run had the answer in front of it and
was not asking this question.

**Core is waiting on a related answer.** It has been running a 425-versus-500
question with the television session. On this stack a 425 would be retried
with backoff and would **not** be fallback-eligible, making it the *weaker*
signal here rather than the stronger one. Core has been told this is a
bytecode reading rather than a result, and that the experiment belongs on this
end. **expo-video installs no `LoadErrorHandlingPolicy` of its own**, so the
default above is what runs.

---

## P1 — The security item, and the rest of the port

**Status: scoped, not started. Corrected 2026-09-20:** every symbol below is
present in the installed core — checked by grepping `dist` in 0.12.0, 0.14.0
and `develop` — so an earlier note here that `probeNow()` was "recorded but
not built" was stale from at least 0.12.0.

**The one item that is a security change rather than a tidy-up.** The bearer
persists for **up to 30 days** in plaintext `AsyncStorage`, where before 0.5.1
it died with the process. Same storage, same permissions — but the exposure
window went from one session to a month, readable on a rooted device or in a
backup. That is a consequence of a fix that was otherwise entirely good, and
it is the argument for sequencing this sooner rather than later.

**Checked against the Expo 57 docs rather than assumed:** `expo-secure-store`
exposes **synchronous `getItem`/`setItem`**, so it satisfies core's
`StorageLike` directly — no hydrate-at-startup cache, unlike `ClientStore`.
`removeItem` wraps `deleteItemAsync` fire-and-forget, the pattern
`ClientStore.enqueue` already uses, so the adapter is about five lines. Its
config plugin also exposes **`configureAndroidBackup`**, which closes the
backup half of the exposure deliberately rather than incidentally.

**Estimate: ~1.5–2 hours of work, plus ~1.5 hours of build and device
verification.** `expo-secure-store` ships a config plugin, so it needs
`prebuild` and a **cold Gradle build — 37 minutes on 2026-09-21 with a second
Gradle build competing for the machine, 1h15m the time before** — almost all
waiting.

The mechanical hour:

- `secureStorage` via `expo-secure-store` in `configureMachaHost` — the reason
  to do this at all.
- `signOut()` — core revokes itself and throws on failure, which is what this
  client hand-rolled in `MachaProvider`. Delete our composition, keep the
  rethrow.
- `probeNow()` — retires the `monitor.stop()`/`start()` radio workaround at
  `MachaProvider.tsx:353`. Core's doc says the workaround "throws away the
  answer it was about to get in order to ask the question again"; `probeNow`
  awaits a cycle already running instead. Minutes.
- `noteArtworkLoaded` — see the P2 below.

**Settled and not to be reopened:** core's `isMachaStorageKey` must **not**
replace `owned()` in `state/storage.ts`, whatever core's docs say — it is
core's key registry, not this client's hydration filter. The reasoning is in
the comment there and pinned by the hydrate test.

**Suggested sequencing:** take the mechanical hour and the rebuild; leave
`lastIdentityChange` as its own decision (next item), because that is design
rather than wiring.

---

## P1 — At 30 days a signed-in viewer silently becomes nobody

**Consequence of the accepted TTL, surfaced by core after the decision. Not a
re-raise of the TTL — this is client work.**

Core's refresh timer **does not refresh; it re-mints**, and a re-mint presents
no credentials. So at the 30-day mark a signed-in session is replaced by
whatever an empty credential set authenticates. **Core measured it on Tom's
cluster:** an empty-credential mint returns `roles: []`, and `/catalogue/items`
then answers `403 requires the 'media_viewer' role`. What the viewer sees,
mid-use and with no explanation, is the library emptying and "This account
cannot view media": the exact refused state this client spent 0.5.0 building,
arriving as if something had broken. Worse than a logout, because a logout at
least says what happened.

**Possibly already seen.** During the 2026-09-16 A85 run the device signed
itself out between two runs, from a named account to anonymous, with Continue
Watching and downloads intact. Unexplained; it is the shape of this item, and
nothing confirms it. The next time it happens, read `lastIdentityChange`.

**What to do about it, all client-side:**

- `SessionManager.lastIdentityChange` (`{from?, to?, at}`, in core since
  0.10.0 and present in the installed `dist`) is how we notice. Core says
  nothing about what the change *means* — a 401 cannot distinguish expiry from
  revoke from a `credential_generation` bump — so the wording is ours.
- The honest fix is to ask the viewer to sign in again **before** it happens.
  Thirty days from mint is knowable in advance; the session carries
  `expires_unix_ms`.
- The access gate already renders the refused state. What it lacks is the
  distinction between "this cluster refuses you" and "your session just aged
  out", which are the same picture and very different sentences.

**Do not fold this into the TTL item.** That one is decided and closed.

**Half answered on 2026-09-21, and the half that remains is the pre-emptive
one.** A session granted no roles now maps to `no-roles` in
`describeMediaAccess` and tells the viewer to log in again rather than to find
an administrator (`767e337`, shipped in 0.8.0) — so the degraded state at least
says the right thing when it arrives. Still missing: the warning *before* it
happens, from `expires_unix_ms`, and the distinction between "this cluster
refuses you" and "your session aged out".

---

## P1 — What still needs a person holding a phone

Nothing here can be done from this machine alone. The Galaxy is the better
device for the camera and the paste — clean install, no endpoints, opens on the
connect screen.

- **Unlock the A85 and look at 0.8.0.** The tagged build was installed
  2026-09-21 23:31 and launched; the process is alive and `MainActivity` is the
  focused app, but the phone is behind a secure lock screen that no ADB command
  here clears, so nobody has seen it render. Until someone has, "the A85 has
  0.8.0" means installed, not working.
- **The camera.** Never used. The permission prompt, a real code read at a real
  distance, and the second refusal — where the prompt becomes a link to
  Settings rather than another request.
- **Pasting a list of addresses into a node row.** `editRow`'s split path is
  unit-tested only; `adb shell input text` cannot emulate a clipboard paste.
- **The 31-minute pause** for the reaped-session P1 above, once it is wired.
- **The two open segment-hold measurements** in the native-player-error-opacity
  note (COMPLETED, 2026-09-08): whether a cold session on either engine ever
  receives a 500 before its own read timeout, and the prefetch arithmetic. Both
  are cheaper now that the node states its hold: read `session.source.budgets`
  off `logcat` and compare against media3's 8000 ms music read timeout.

**The marker's inherited claim was wrong and is retired.** It said a deployed
node "names no user". `session_json` writes `username` beside `user_id`
whenever the session names one; the device agrees, and a successful login has
since confirmed it for a signed-in user. No `users.me()` fallback needs writing.

---

## P1 — Delete `firstReachable`; core ships that gate now

**Small, and it removes a mirror.** `src/app/connect.tsx` has its own pre-save
connection gate. Core's `checkEndpointConfiguration(urls, fetch, timeoutMs)` —
present in the installed `dist` — does the same job and more: it returns
`unconfirmed`, naming endpoints that answered without a 2xx, so the screen can
say "reached, but it did not identify itself as a Macha server" rather than
silently accepting a mistyped address, and it separates "still pending" from
"unreachable" behind a UI deadline, so a slow node does not read as a dead one.

**Why a copy exists at all is the part worth keeping.** Core's gate was broken
until 0.9.0 — it counted an endpoint available only on `response.ok` against a
route every node answers 401 to unauthenticated, so a fresh install could not
be configured. This client routed around a genuine defect. But nobody goes back
without being told, which is how one rule ends up in four places with four
opinions.

`CONNECTION_CHECK_TIMEOUT_MS = 6_000` in `connect.tsx` goes with it. If any of
ours is kept, say what shape core's result does not give — core asked, because
that would be a gap in theirs rather than a preference.

---

## P2 — Two things seen on the failure screen and the seek path

- **The transport chrome is drawn over the failure panel.** On the A85
  2026-09-23 19:04 the ±10 s and play buttons sat on top of the failure
  message, in `src/app/play.tsx`: the failure `View` renders before the
  chrome, and `chromeVisible` stays true in `failed`. Hide the transport
  while `status === 'failed'`, or render the panel above it. Not verified
  whether a tap on an overlapping area reaches the button underneath.
- **A refused rebuilding seek still shows core's log line.** `repositionTo`'s
  `catch` uses `describeError`, the last playback site that does. Same shape
  as `updateRefusalMessage`, but the honest lead differs — whether the old
  generation is still playing after a refused seek has not been checked.

**Direct play has the same video hole Remux had, and was left alone on
purpose** — `transformFor`'s docblock argues a viewer who names Direct gets
what they asked for. Tom's 2026-09-23 decision was about Remux. With the
guard now reporting, Direct on an undecodable title ends in an honest
failure rather than a black screen; whether it should instead be marked
unavailable like Remux is Tom's call and has not been asked.

---

## P2 — What the route cutover left open

The cutover itself is done and on hardware — COMPLETED, 2026-09-21, *Playback
sessions as a REST resource*. Three things from it are still open:

- **The account cap has never fired for real.** `max_sessions: 8` node-wide
  refuses before `max_sessions_per_account: 32` can (`reserve_session_slot`,
  `playback.cpp:1404` then `:1409`), so every branch of
  `classifyCreateRefusal` and `spendsFailoverBudget` for
  `account_session_limit` — create path and failover path — has run only
  against constructed errors. The first genuine one will be the first real run.
  Until the node limits are raised, the only 429 observable from here is the
  node-scoped `resource_limit`, which `classifyCreateRefusal` calls `fatal` on
  purpose; a cap test before then looks like the handling failing when it is
  working.
- **A 410 reaches this client opaque and cannot be made to arrive.**
  `PlayerError` is `{ message }`; expo-video builds its `OkHttpDataSource`
  internally with no injection point. The mode-switch case is closed without
  seeing one (`selfSupersededGeneration`); a 410 this client did **not** cause
  is not, and the only route that covers it is the television's — a native
  media3 module feeding `httpStatus` into core's classifier. A build, not a
  patch; not started.
- **`GET /api/v1/playback/sessions` adoption listing** — not built; nobody
  needs it. Node-local by design, so provenance is free when it is.

Standing condition on all of it: **`source.url` stays absolute and
server-supplied** — core's stated commitment — and every consumer here feeds a
native player or a downloader rather than a fetch, so a relative URL would
break at once and silently. Worth a test if core ever reworks the session shape.

**And failover on mobile does not work — Tom, 2026-09-21.** Anything above
whose value is "failover behaves better" is worth less than it reads until that
changes; see *Deferred by Tom*.

---

## P2 — The seek control: it works, and two things around it make it feel broken

**Driven on the A85 2026-09-21, app 0.6.0, against the live cluster.** Raised
by Tom as "the Seek control is still broken".

**The scrubber does seek, and that was verified twice.** Dragging to the
midpoint while paused moved the bar to 57:53 and playback resumed at the HAL
9000 scene, about 58 minutes in; dragging while playing landed in a different
scene again. `canSeek: true` in the session, and `seekTo` is reached.

**Fault one: a seek while paused does not repaint the frame.** The bar updates
to the new time and stays there, and the picture holds the *old* frame until
playback resumes. Measured: paused at 11:14, dragged to 57:53, the video
region was unchanged across captures at +1 s, +4 s and +8 s; on resume the
film continued from 57:53. So the seek is applied and only the presentation is
stale. Whether that is expo-video's behaviour on `player.currentTime` while
paused or something this client does is **not yet established** — that is the
next step, and it wants checking against expo-video's source rather than
guessed.

**Fault two, and it is the one that makes the control feel dead:** chrome
hides `CONTROLS_HIDE_DELAY_MS = 3_500` after the last touch, and the first
touch afterwards is consumed re-showing it. So any gesture aimed at the bar
more than 3.5 s after the last one does nothing at all. A viewer who looks at
the screen, decides where to drag, and then drags, loses the first attempt
every time.

**A measurement hazard worth recording, because it cost most of this session's
device time.** Observe-then-act does not work on this screen: reading a
screenshot takes longer than 3.5 s, so the chrome has always hidden by the
time the next command lands, and a tap that should have hit the pause button
only revealed the chrome. Three "faults" were recorded and then withdrawn that
way. **Drive this screen with the whole sequence in one `adb shell`
invocation**, capturing to `/sdcard` between steps and pulling afterwards.
Also lock rotation first: the app forces landscape in fullscreen and portrait
coordinates then land somewhere else entirely.

**None of this is verified against the current tree.** The A85 runs 0.6.0,
which predates the seek-window work in 0.7.0 and everything since.

---

## P2 — Honour `seekOffsetMs`; the cluster is already past the floor

**New in core 0.14.0, and no longer latent — the live node is on `0.47.0`,
measured 2026-09-20.** This file previously said it would stay dormant until
the cluster moved past 0.40.0. It has.

A remux generation now begins at the last keyframe **at or before** the
request, and the session reports `seekMs` (the baseline), `seekOffsetMs` (how
far into the generation the requested position sits) and `seekRequestedMs`.
Before 0.46.0 a node snapped a remux seek *forward* to the next keyframe, by up
to 9.3 s measured. `seekOffsetMs === undefined` means an older node.

**Where this client reads `seekMs` as the viewer's position:** `load` sets
`positionMs: session.seekMs` for a transformed generation, and `repositionTo`
sets `positionRef`, `bufferedRef` and the bar to `next.seekMs`. On a 0.46.0
node both are early by the offset, and the player starts at the keyframe rather
than where the viewer asked. ~~The fix is small: where `seekOffsetMs` is
defined, seek the player to `seekRequestedMs` after the source is applied and
report that as the position.~~

**That proposed fix was wrong, and core said so on 2026-09-21 before it was
built.** Core's `docs/choosing-playback.md` states *"the core consumes these; a
host must not"* — the coordinator converts between the two timelines, and a
host that also corrects by the offset double-corrects into something
"self-consistent and wrong". **And the offset would have corrected nothing
anyway:** it is `0` on transcode and direct, which is precisely the case
measured, and on remux the remainder is already inside `seekRequestedMs`.

**What was actually missing is `seekMs`, the generation's origin** — and the
reason nobody was adding it is that this client drives
`ClusterPlaybackResolver` directly and constructs no `PlaybackCoordinator`, so
the conversion core's rule assumes simply was not happening. Core named this
client as the case its own docs do not cover, and offered either "do the
conversion yourself, deliberately, in one place" or "raise it as core owing a
documented answer for resolver-direct hosts". **Done the first; the second is
still core's to record, and core agreed it is theirs rather than ours.**

**Fixed 2026-09-21** in `generationOriginMs` / `titlePositionMs` /
`generationLocalMs` (`src/playback/policy.ts`), wired into the `timeUpdate`
listener and `seekTo`, with `src/playback/timeline.test.ts` carrying the
measured *Avatar* case. **What remains of this item** is the original
0.46.0-era point: starting the player at `seekOffsetMs` into the generation so
a *remux* begins where the viewer asked rather than up to 9.3 s earlier at the
keyframe. That is a real remaining gap, it is remux-only, and it could not be
tested today because no remux would start.

**The timeline question this item used to end on is answered, and measured:**
`currentTime` on a transformed generation is **generation-local** (A85,
2026-09-21, *Avatar* and *Arrival*, bar reading `0:13` after a seek to
1:44:35), which is exactly what `titlePositionMs` now converts. So the
remaining remux-only gap is wrong in one known direction, not two.

---

## P2 — Zulu

**Tom's ruling, 2026-09-21:** display local *with the zone labelled*; Zulu for
anything interchanged — logs, bug reports, anything that will be read beside a
node journal. This client renders server times device-local with no zone
shown, and is the device most likely to be in a different zone from its node.
Find every place a server time is rendered or logged and put it on the right
side of that line. Not started.

---

## P2 — 544 MPEG-4 Part 2 files, 15% of the library, and this client claims no `mpeg4`

The complete census, 2026-09-21: **3,553 files — hevc 2,054 (1,872 of them
`yuv420p10le`), h264 954, mpeg4 544, av1 1.** This client's declared video list
is `h264, hevc, vp9` plus whatever `withProbedAdditions` adds from the probe,
and `mpeg4` is not among them — while the A85 lists a `video/mp4v-es` decoder.
That is 544 titles transcoding against one for AV1. Before claiming it: check
which containers those files are in (`avi` is not claimed — see the
capabilities item below), and that software decode at their resolutions is
acceptable. Not started.

---

## P2 — AV1 ten-bit SDR is unverified

The A85's AV1 decoder advertises profiles `[1, 4096, 8192]` — `Main8`,
`Main10HDR10`, `Main10HDRPlus` — and **plain `AV1ProfileMain10` (2) is
absent**. `TEN_BIT_PROFILES` in `codecProbe.ts` reads the two HDR10 entries as
evidence of ten-bit decode, the usual reading since HDR10 *is* Main10 plus
metadata, but *The Cannonball Run* is AV1 `yuv420p10le` and almost certainly
SDR, so the claim rests on an inference about what an HDR10-only profile list
implies for SDR ten-bit content. The same shape of assumption this file keeps
catching.

**The test:** force **Direct play** on *The Cannonball Run* from the options
sheet — its Opus audio is decodable, so only the video question remains. Three
attempts to open the sheet failed on 2026-09-21: the chrome does not auto-hide
while paused, a "reveal" tap dismisses it, and the layers icon eats the next
tap. Tap the icon with the chrome already visible and verify the sheet opened
before tapping a row.

---

## P2 — What `deviceCapabilities()` still asserts rather than measures

The probe (`modules/macha-codecs` + `codecProbe.ts`) settles `videoCodecs`,
`audioCodecs`, `videoBitDepth`, `hdr`, `dolbyVision` and the HLS delivery
lists on Android. Left over from the 2026-09-21 audit (COMPLETED):

- **`containers`** — a fixed list. `MediaCodecList` says nothing about
  containers and ExoPlayer's extractors are fixed at build time. Asserted with
  reasoning, **and missing `avi`**, which the television claims and which the
  MPEG-4 item above needs settled.
- **`hlsFmp4`, `hlsTs`** — unconditional. media3 facts, never checked against
  the media3 version actually linked.
- **`dash: true`** — inherited without reasoning, and **dead**: core reads
  `capabilities.dash` nowhere. Delete it.
- **The whole iOS and web branches** — asserted end to end, no probe, no
  device. iOS `videoBitDepth: 8` is very likely wrong (iPhones decode ten-bit
  HEVC), and `ac3`/`eac3` are still claimed unconditionally there.

---

## P2 — Two defects left in the access gate deliberately

Both raised, both declined at the time, both still true.

- **The `generation` bump fires on the healthy path.** `HomeScreen` loads via
  `useAsync(..., [media, generation])`, and access goes `unknown → granted` on
  every successful launch, so **every cold start runs the catalogue load
  twice**. A flapping cluster can oscillate it. It should key on
  `mayRequestMedia(access)` changing, a boolean that only flips when the answer
  does, rather than on `access.kind`.
- **One node's 401 stands for the whole cluster.** `isAuthRefusal` in
  `MediaApi.serve` collapses to the local library without trying another node,
  and the router will not walk on a 4xx. Usually right, because sessions and
  roles are replicated — but during a rolling upgrade an older build's session
  carries a role vocabulary the newer one refuses.

---

## P2 — Wire `MediaApi.noteArtworkLoaded` when artwork is next touched

`Artwork.tsx` walks candidate URLs in order and moves on only when one actually
fails. `noteArtworkLoaded(url)` — **called on success only** — keeps an artwork
URL byte-identical across an endpoint swap, which otherwise renames every
poster and re-downloads bytes the device already holds.

Related and already true: **key any artwork cache on `ref.id`, never on
`ref.url`.** `id` is the SHA-256 of the artwork bytes, identical on every node;
the signed `url` is re-signed per catalogue read. Server 0.40.0 quantizes `exp`
into a TTL bucket, so the URL is stable for up to 24 hours anyway.

---

## P2 — Verify the container restatement reaches the wire

**Status: fixed in core (`withServedSegmentContainer`, present in the installed
`dist`); verification outstanding.** Needs a node stopped mid-playback, so it
happens on Tom's next run rather than on demand.

**The defect.** A failover from this client **creates** a session rather than
PATCHing one, and the server starts a create from a default-constructed
`PlaybackPreferences` whose container is `"fmp4"`. So a replacement generation
was fMP4 whatever the original had been. Latent on this device only because
`deviceCapabilities()` claims both `hlsFmp4` and `hlsTs`. Where it bites — the
web client's measured Samsung case — the replacement prepares, playback never
starts, nothing is fetched, and about fifteen seconds later the cluster is
exhausted with healthy nodes in it.

**What is left is the measurement:** capture the failover's session **POST**
with `container` present. If `output.container` turns out to be absent on this
cluster, core's restatement no-ops and a client-side fix is needed after all.

**Blocked in practice, 2026-09-21: failover on mobile does not work** (Tom; see
the 410 section and *Deferred by Tom*). There is no failover `POST` to capture
from this client until that does, so this measurement is behind that and should
not be scheduled as though a stopped node would produce it.

**Note for whoever takes it:** session ids are namespaced by endpoint
(`http://a::session-1`) while the URL carries only the node-local half.

---

## P2 — A session is leaked on process death, and only the server can close it

The session, and with it the video transcode entitlement, lives until
`session_idle` at **30 minutes** (`SERVER_SESSION_IDLE_MS`), not the 60 s
`pipeline_idle` that reclaims the engine. So process death costs a one-slot
node its only transcode slot for half an hour.

`releaseSession` runs on stop, on replacement and on reconfiguration, but not
when the app is swiped away or killed. Backgrounding deliberately does *not*
release — music is meant to keep playing — so the gap is process death
specifically.

**No client fix closes this, and no core fix either:** a process that is gone
cannot send a `DELETE`. Kept as the standing argument for the server-side
change under consideration (below) rather than as work to do.

## P2 — Nothing anywhere knows about speaker layout

**Status:** putative for this client, live elsewhere.

Core's `choosePlaybackInstruction` decides audio purely on codec and never
reads `channels`. Since 2026-09-21 `ac3` and `eac3` are probe-gated on Android
and absent on the A85, so it cannot arise there; on an Android device that
*does* decode them, and on iOS where both are still claimed unconditionally, a
5.1 track can be Direct Played to two speakers with no channel awareness. Whether media3 downmixes transparently is **unverified** —
that is the measurement that decides whether this is a phone problem or only a
television one.

**Related, checked while here:** `hlsVideoCodecs`/`hlsAudioCodecs` are set
explicitly on android and ios, narrower than the direct lists. Leaving them
unset makes core fall back to the *direct* lists silently, which would claim
E-AC-3 in fMP4 — an independent black-picture path. The `web` fallback branch
does leave them unset: dead code on a device, but recorded rather than trusted.

## P2 — Stall detection, if it is ever wired

**Status:** deliberately not started.

Core has `MediaStartWatchdog` / `MediaStallWatchdog`, deliberately *not* wired
into `PlaybackCoordinator` — each host wires its own. Since 0.14.0 the stall
watchdog takes its budget from the serving node (`useSourceBudgets(source)`,
`mediaStallTimeoutMs(source)`), which removes the calibration argument that
used to be the hard part. Three things are already known and must not be
rediscovered:

- **A source that has never started has not stalled.** Arming on first sight
  killed *every* replacement in the web client.
- **Absent buffering must stay absent.** `note(positionMs, bufferedEndMs?)`
  takes the buffer figure as optional specifically for expo-video, which
  publishes a position and nothing trustworthy about buffered ranges. A
  fabricated zero reads as evidence about the node. And a stall reported
  without a buffer figure must not record endpoint health.
- **Any timeout must be calibrated against the node's hold and say so** — now
  `budgets.segmentHoldMs`, not a constant.

Adopting `PlaybackCoordinator` itself is a much larger move and wants its own
argument: it would bring the reaped-session and budget work above for free,
but it needs a `Player` implementation over expo-video, and the standby defect
once cited as a reason against it has been retracted.

---

## P3 — Throughput is browse-driven, and downloads are the only other source

**Migrated to core 0.12.0 on 2026-09-15, measured abstaining on 2026-09-16.**
Core owns the recorder; this client hand-builds its services, so
`MachaProvider` attaches its own bandwidth store — and **must**, because
`recordTransferByUrl` is a silent no-op when nothing is attached. The client id
is a function guarded on `clientStore.isHydrated`, pinned by
`state/clientId.test.ts`.

**What settles what this axis runs on:** catalogue listings are 7–26x the
32 KB sampling floor, `artist` only 1.3x, and the health cycle's status and
liveness calls are all under it. **So the ten-second health cycle contributes
no throughput evidence at all; throughput is browse-driven**, and a viewer who
resumes a download without listing anything produces none except through
`DownloadManager`. On the A85 core logged `throughput-unavailable /
insufficient-samples` at 211 ms on every launch, exactly as designed.

**Still the reason this is P3:** the endpoint a download uses is the one
ranking already preferred, so samples accumulate on the incumbent and rarely
on a challenger. Throughput mostly confirms a ranking rather than overturning
one, and earns its keep on failover.

**Not verified on hardware:** someone downloading on the A85 and the
`macha-client-bandwidth:` record read back. Attribution is by URL; core builds
the stream URL as `${baseUrl}${path}` and matches `startsWith(baseUrl + '/')`,
so misattribution cannot occur by construction.

---

## P3 — Dead viewer-session identity

`MachaProvider.tsx` generates a per-process UUID and hands it to
`ClusterPlaybackApi`, whose constructor takes it as `_viewerSession` — the
underscore being the previous author's note that it goes nowhere. It also sits
in a `useMemo` dependency array.

`Macha-Viewer-Session` is **retired** server-side; the logical viewer session
is keyed on the **auth** session id, which is cluster-replicated. Delete the
UUID, the constructor parameter and the dependency.

---

## Open observations from the A85, 2026-09-16

The run itself is recorded in COMPLETED. Two things from it are still open:

- **The startup delay that is real** is a degraded node: seven route-attempts
  to `macnessa` between 213 ms and 230 ms, then nothing until **4231 ms**, when
  the walk gives up and reaches `ramaroja`. A four-second wait on a dead node,
  and a cluster-health question rather than a client one. Core's `develop`
  now routes status reads advisorily and takes a signal on discovery, which
  may change the shape; re-measure on the next run.
- **The device signed itself out between two runs.** See the 30-day P1.

## Cluster membership can shrink and regrow on its own

**Not a fault, and it will look like one.** gbni-2 (`inverbeg`) was removed on
2026-09-13, so the Cluster screen correctly reads **2 known endpoints**. Each
remaining node's membership file lists one known peer plus a tombstone for
`[inverbeg.macha.network]:7437`. **That tombstone is a freshness boundary, not
a permanent exclusion**: if that machine completes a handshake again it
rejoins, and the count goes back to three with nobody having done anything.
Do not chase a self-changing node count as a bug.

---

## Waiting on other sessions

- **The mint-failed window is still open and is core's**, confirmed by core
  on 2026-09-20 against its `develop`, and by diff here: `0.12.0` through
  `0.14.0` ship a byte-identical `SessionManager.js`. Core carries it as a P1
  visibility failure with no fix date; do not build around it changing this
  week. **When it lands, re-check `describeMediaAccess` and the comment in
  `account/access.ts` together**: a wait turns a fast wrong answer into a
  slow right one, which changes what `unknown` means in time rather than in
  kind. It has its own go/no-go round; ask to be on it.
- **Core wants two things from this client, neither urgent:** this platform's
  own readings of expo-video and media3 (it holds only the television's and
  will not assume they transfer), and whether the player here does a source
  handover. Answered 2026-09-20: it does not — one `expo-video` player,
  `player.replace(source)`, a visible reload, no join point computed; the two
  priming attempts are in COMPLETED. The expo-video readings core needs are
  the native-player-error-opacity note (COMPLETED, 2026-09-08) and the ducking
  entry (2026-09-10); both were read from this tree.
- **`view_status` gates the diagnostic routes only**, never liveness. A
  role-less session learns no cluster membership and — new with 0.14.0 — no
  node budgets, so the failover pool stays at the bootstrap list and the
  published floors apply until someone signs in. **Tom has ruled that correct;
  do not build around it.**
- **Core's accounts layer is what login here is built on, and it is untested
  and unreviewed.** Core volunteered that: there is no test file for
  `UsersApi`, `MachaUsersApi` or `ClusterUsersApi`. Treat a failure there as
  plausibly core's before assuming it is this client's.
- **`ClusterUsersApi.list()` is broken in core and cannot bite us.** The server
  writes `body["users"]` while core reads `response.items`. This client never
  calls `list()`.
- **Standby dead on arrival — retracted as a core defect.** The explanation
  was wrong (see COMPLETED). The Android TV client is the first that can
  promote a standby and will report what actually happens. **Do not re-file
  without that result.**
- **Core `0.18.0` is on npm** (2026-09-21T19:31Z) and 0.8.0 pins it. `0.15.0`
  and `0.16.0` were superseded and will never be published; `0.17.0` was
  tagged and overtaken. Everything they carried — the walk fix, the bounded
  recovery, the encoder-speed reading, the three accessors, and the breaking
  `hlsWalkTargets` → `HlsManifestUnavailableError` change — arrived with
  0.18.0. **No caller here** for the break: `hlsWalk|HlsManifestUnavailable|walkTargets`
  is empty across `src`, re-checked 2026-09-23.
- **The television session owes two answers**, both asked directly on
  2026-09-21 rather than through core: whether a segment 500 on their stack has
  ever produced repeat fragment requests with ~1 s then ~2 s backoff before
  going terminal (the media3 P1 above), and whether they actually ran the
  delete-then-plain-`npm install` case their account of the `file:` link rests
  on (the release procedure, step 0). Neither has arrived.
- **The two React Native clients are two codebases.** Stated by Tom on
  2026-09-20 to core: nothing measured on the television's tree (its media3
  module, its `OkHttpDataSource` deadlines, its `PlaybackError.kt`) transfers
  to this one. Ask again; do not inherit. **The television answers to
  `Macha Android TV RN Client`** - reached directly on 2026-09-21, and that is
  the right address for anything of theirs rather than core as a relay.
  Asked them, explicitly framed as a reading from their stack and not as
  evidence about this one, whether a segment 500 there has ever produced
  repeat fragment requests with ~1 s then ~2 s backoff before going terminal.
  A yes would say the bytecode path is reachable somewhere; it would still not
  be a result about expo-video.

## Possible server change worth watching

**Tying the video transcode entitlement to the engine rather than the session**
is under consideration, so pipeline reclaim at 60 s frees the slot and a
resuming session re-acquires it. It closes the hole no client can — crashes,
power loss, force-quit — but it is **client-visible**: a session could be
*refused on resume* where today admission is guaranteed for its lifetime. That
is a new state this client would have to handle rather than treat as an error.
With the reaped-session P1 wired, `regenerate` failing on the owning node is
exactly the branch that state would arrive in. No action until the server
session says which way it goes.

## Deferred by Tom

- **Subtitles: ignore for now, on every client.** Tom, 2026-09-21, relayed by
  the web client session: *"Tell the other clients and the core to ignore
  subtitle issues FOR NOW."* The hole is the web client's — the server's
  subtitle manifest carries durations only, no names and no URLs, so that
  client composes `segment-${index}.vtt` against the manifest URL, and core has
  never heard of the manifest type and is not taking it or a URL builder. **The
  reason it can wait is that there is exactly one copy of that convention**, so
  the instruction here is negative and this client is already compliant:
  checked 2026-09-21, `.vtt` appears nowhere in `src` and there is no segmented
  subtitle path — only track *selection* in `PlaybackOptionsSheet.tsx` and the
  provider, which is unaffected. **Do not grow one and do not copy the naming.**
  If subtitles come up in the joint test, note it and move on.

- **Seamless failover. Failover on mobile does not work at all — Tom,
  2026-09-21**, superseding the 2026-09-08 device note that recorded it working
  but not seamless. So this is no longer a polish item waiting on a transport:
  the recovery it was going to make seamless is not there to smooth. The
  seamlessness gap, when it matters again, is
  transport, not player: expo-video builds its `OkHttpDataSource` internally
  with no injection point. The routes that would work are a native media3
  module with a failover `DataSource`, or TLS on the cluster. Two attempts were
  made and reverted — see COMPLETED for what they measured. Core 0.14.0's
  `continue`/`relocate` transition is the coordinator-side half of the same
  idea and confirms the framing: whether a swap can be hidden is a property of
  the two sources, and this client has no second managed presentation to cut
  to. **If it ever comes back, it should come back to the Android TV client
  rather than here.**

## Checked and already correct

Recorded so they are not re-raised.

- **The tree compiles against published core 0.18.0 and against the link at
  `a3b40ca`** with no edits — both on 2026-09-21 during the release — and
  against 0.14.0 and core's then-`develop` on 2026-09-20 by pointing `tsc` at
  each `dist` in turn.
- **No storage key changed between core 0.12.0 and `develop`**, by grep of the
  three `dist` trees. `OWNED_KEY_PREFIXES` stands.
- **TV key events cannot reach a bridgeless build, and this client has no
  exposure.** `useTVEventHandler`, `onHWKeyEvent` and the rest return nothing
  across `src`. Inert rather than inapplicable: the day this client grows a
  keyboard shortcut or a remote, it inherits the bug whole.
- **Core's two endpoint normalisers do not disagree.** Same four-line function
  under two names; this client uses `normalizeBaseUrl` alone, and the scan path
  ends in `new URL(...).origin`. Pinned in `src/scan/endpoint.test.ts`.
- **Artwork** goes straight to the image element from a signed capability URL;
  headers only when `source.requiresAuthorization`.
- **No custom HTTP header is sent or read**, including on the two paths that
  cannot set one: `createDownloadResumable` and the native player's
  `VideoSource`. **Macha's media URLs must need no headers**, because two of
  this client's paths could not send one if they did. Core's
  `PlaybackSource.headers` is documented as never set by core, which keeps
  that true.
- **Audio focus and keep-awake.** expo-video requests `AUDIOFOCUS_GAIN` with
  `USAGE_MEDIA`/`CONTENT_TYPE_MOVIE`, confirmed in `dumpsys audio`, and pauses
  rather than muting on a real focus loss. `useKeepAwake()` is live in
  `play.tsx`.
- **Session drop paths: one leak, and it was core's.** `load`, superseded
  create, `stop` and `update` all handle their sessions correctly; only
  `failover` dropped one, fixed in core.
- **`failover` restates the transform itself** (`{ mode, ...transformFor(mode) }`),
  so core `develop`'s `withRestatedTransforms` changes nothing here; when it
  publishes, the restatement in `src/api/playback.ts` becomes redundant rather
  than wrong.
