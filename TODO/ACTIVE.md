# Active

Open work for `macha-client-rn`. Plans, experiments and conclusions live here
while they are live; finished ones move to [COMPLETED.md](COMPLETED.md) with
what they measured rather than being deleted.

Ranked P1 (do next) down to P3. There is no P0. **An inherited claim is not
evidence**: where a peer's claim was checked against source or a device, it
says so; where it was taken on trust, it says that too.

**Last rationalised 2026-09-27, for a session starting cold after a `/clear`.**
Everything finished this week is in COMPLETED under 2026-09-24 to 2026-09-27.

---

## Start here

### 0.10.0 is released (2026-09-27)

`main` = `2a314ca`, tag `0.10.0`, on published core `^0.20.0`, pushed with
`develop`. Installed on the A85 at `versionCode 1000` and given the short
look on 2026-09-28: sign-in kept, a title's page right, *2010* plays. The
record, with core's integrity hash and the fresh-clone proof, is in
COMPLETED. The next release follows *Releasing* below.

### Resume here, after a `/clear`

1. Read *Start here*, then *Open, in order*.
2. `git status --short` shows only `.claude/settings.json`,
   `CLAUDE.local.md` and `basemind.toml`, none of which are this work.
3. `test -L node_modules/@machafoundation/core` succeeds on `develop`.
4. Core moves several times a day: `git -C ../macha-ts log --oneline -1`,
   `(cd ../macha-ts && npm run -s dist:hash)`, `npx tsc --noEmit -p .
   >/dev/null; echo $?` (the exit code, never a grep), `npx vitest run`.
5. `adb mdns services` for the A85, then *Driving the phone* before any tap.
6. `ListAgents` for the peers. Act on a peer's news only after reading core's
   source or `dist`, never on the message alone. **Commit before messaging a
   peer about a change, and quote the SHA git printed** (memory
   *never-guess-commit-ids*): twice on 2026-09-27 a guessed id went out.

### Where things stand

- **`main` is `2a314ca`, tagged `0.10.0`**, pinning published core `^0.20.0`.
  It plays against server 0.58.0 and later; 0.9.0 cannot.
- **`develop`** is well past `main` (`git log --oneline main..develop`), linked to `file:../macha-ts`,
  typecheck clean, **337 tests** against core `29fa878` (dist
  `e2adced47327`).
- **The server is 0.64.x on both nodes** (fi-1, the LAN node
  `http://10.35.1.50:7438`, and gbni-1, `https://macnessa.macha.network`).
  Changes since 0.58.0 have been torrents, repair and diagnostics; status and
  playback are unchanged. **fi-1 holds little of the library** and fetches
  extents from gbni-1 over the WAN, so its transcode starts can overrun core's
  19 s budget; core walks to macnessa, which then serves.
- **Lost data, the server's to fix:** *The Cannonball Run*, *28 Days Later*,
  *Event Horizon*, *GoodFellas*, *Cowboys & Aliens*, and *Dark* S01E06 past
  46 minutes are missing extents, and the server still lists them as
  playable. Its per-file readability work waits on Tom. Do not test against
  them expecting playback.
- **The A85 has a release build of `develop` at `69d8841`** (core
  `c5292df`, dist `f7fd989fe6e8`), installed 2026-09-28 18:04:12 local. It is
  labelled `versionCode 1000` like the tagged 0.10.0, so tell them apart by
  `lastUpdateTime`. Tom is signed in. Panel **720x1612**; decoders AVC, HEVC and VP9 to
  1920x1080, AV1 to 1280x720. It does not yet show core `29fa878`'s "(4K)" and
  channel count.
- **Never run `npm run lint`**: `expo lint` installs ESLint into
  `package.json` unasked.
- **The laws are `docs/principles-and-laws.md`**: 1 control, 2 viewer, 3
  loader, 4 foot. Citations must match its text (AGENTS.md).

### Open, in order

1. **What the device runs have not reached**, each needing Tom or a second
   viewer: failover mid-play and the container restatement (a node taken
   down, only on Tom's word); a switch back into transcode refused
   `resource_limit` (a second viewer holding the slot); the mobile-data
   ceiling and the unreachable-cluster wording (the network changed); the
   wrong-password wording (a logout, and Tom's password); the camera and a
   pasted node list (the Galaxy, by hand); the login-lapse notices (a session
   near expiry). AV1 at 720p or below playing Direct needs such a file.
   **Not built:** the proactive half of the reaped-session recovery (asking
   when `AppState` returns with an old session). The reactive half is
   proven on the A85 (COMPLETED 2026-09-28).
2. **Decisions for Tom, from the A85 runs.** Ruled 2026-09-28:
   - **Direct on a file whose audio the device cannot decode** (*2010*,
     AC-3 on the A85) **stays available in the sheet, but is never the
     default.** Tom, 2026-09-28: "The phone should always transcode if it
     needs to (the audio won't work) - principle of least astonishment,
     phone clients should 'just work'. If the user forces direct, that's on
     them." **Already true, checked in source:** automatic play takes its
     audio list from `MediaCodecList` (`capabilities.ts`, which drops `ac3`
     and `eac3` on the A85), so *2010* plays with its audio transcoded, as
     it did on the A85 on 2026-09-28. Pinned by `capabilities.test.ts` (no
     unprobed `ac3`/`eac3` claim) and `policy.test.ts` (`audioCopyable`). A
     resume restores Direct only where the viewer chose it. Do not grey it
     out, and do not make it the default.
   - **Continue Watching is films and episodes only**; a music track does
     not belong there. **Done `bb4ce14`**, checked on the A85 (COMPLETED).
   - **The Albums tab's indicator:** it had one nobody could see. **Done
     `69d8841`**, large and red now; checked on the A85 (COMPLETED).
   - Still open: **the mobile-data default is core's 720p**, not a ruling;
     and **the secure store's backup side effect:** AsyncStorage (Continue
     Watching, the queue, playlists) leaves Android Auto Backup with the
     token.
3. **Downloads naming a version.**
   **Tom, 2026-09-28: Download opens a chooser** on a multi-file title,
   listing each file (a download is always a copy of one file, never a
   transcode). **Done** (`a669e5a`, and cancel stops the transfer
   `c8f03c7`), checked on the A85 (COMPLETED 2026-09-28). **Still open:**
   - **For Tom:** the chooser offers files this device cannot decode (4K
     ten-bit HEVC on the A85, 50 GB), and a download always plays off the
     disk. Mark them, hide them, or leave it?
   - **Orphaned partial files** are never deleted: a download killed with
     the app (a force-stop, a crash) leaves its bytes in
     `documentDirectory/macha/media/`. One is on the A85 now, a few hundred
     MB. A startup sweep of files no record names would clear it.
   - Not yet run: a film downloaded to completion and played off the disk.
4. **The media3 segment-500 contradiction** (P1 below), and the P2s.

---

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

### Peer sessions

Sessions are addressed **by name** (`ListAgents` lists them): **`Macha
Client Core`**, **`Macha Server`**, **`Macha Client`** (the web client) and
**`Macha Android TV RN Client`**. Socket paths change every run; reply to a
message by copying its `from` address. **Relayed rulings are confirmed with
Tom before building** — two hops is where a claim stops being checked.
Rulings core says Tom gave it *directly* have been accepted, and one (the
music lines) was still asked about because it changed work already done.
**Do not edit another session's repo while it is live**: send the brief and
let the owner do it by meaning (the laws renumbering, 2026-09-24).

### Releasing — run end to end three times now, and none of it optional

0. **Leaving the link needs the ranged install; returning needs nothing
   special.** `npm install @machafoundation/core@^x.y.z` replaces the symlink
   and rewrites the lockfile entry to a registry tarball in one step. A
   `package.json` edit plus plain `npm install` does **not**, and neither does
   deleting `node_modules/@machafoundation` first — npm restores the link from
   the lockfile entry. Coming back, `package.json` to `file:../macha-ts` and a
   plain `npm install` restores the link and
   `{"resolved": "../macha-ts", "link": true}`. Measured for 0.7.0, 0.8.0 and
   0.9.0, npm 11.9.0 / node 24.14.0. **Read `resolved` in the lockfile,
   never `package.json` and never the version string.** The television
   session's competing account concerns the delete-then-plain-install case;
   that case has not been re-run and their answer has not arrived.
1. Confirm the version is **actually on npm**: `npm view @machafoundation/core
   version time --json`. Three core versions were tagged and never published,
   and one publish was announced complete after failing `EOTP`.
2. `npm install @machafoundation/core@^x.y.z`. Either on `main` after a
   fast-forward from `develop` (0.8.0), or on `develop` with `main`
   fast-forwarded to it afterwards (0.7.0, 0.9.0). **Either way `develop` must end up
   containing the release commit.**
3. `test -L node_modules/@machafoundation/core` must **fail**, and the lockfile
   `resolved` must be a registry URL. Those two cannot lie.
4. Bump `package.json`, `app.json` (`versionCode` = major*10000 +
   minor*100 + patch) and the README's `*vX.Y.Z*` line **in the same
   commit**; `npm install` to sync the
   lockfile's own version; `npx expo prebuild --platform android`; `npm run
   version:check`; typecheck; tests; a real `expo export`.
   **Then prove it standalone:** clone the tag into a scratch directory with
   no `../macha-ts` beside it, `npm ci`, typecheck, tests (first done for
   0.9.0).
5. Commit; `git tag -a x.y.z`; push `main` and the tag; `version:check` once
   more with the tag in place. Then back on `develop`: `file:../macha-ts`,
   plain `npm install`, `test -L` must **succeed**, suite green, commit.
   `version:check` refuses the link while `HEAD` is still the tagged commit.
   That is by design, and it passes once the relink is committed.
6. `assembleRelease` from `main` with the registry copy installed. Gate the
   install on `ro.product.model` **and** `ro.serialno` in the same invocation
   as `adb -s <A85> install -r`, and confirm `dumpsys package
   foundation.macha.client` reports the new `versionCode`.

**What a build contains is answerable only if you write it down.** Under the
link an APK carries whatever `../macha-ts/dist` held when Gradle ran: record
the core SHA and `npm run dist:hash` beside any device measurement. A release
build from `main` carries the registry tarball, whose integrity hash is in the
lockfile — a better identity. COMPLETED's 0.8.0 and 0.9.0 entries record
theirs.

### What is verified on hardware, which is the useful half of knowing

Measured on the A85 against the live cluster: the node-address rows, the media
access gate and its header warning, the access-aware empty copy, Continue
Watching filtering, seek repositioning, a wrong password, a **successful**
login, sign-in surviving a force-stop, and the 2026-09-16 run recorded in
COMPLETED (cold start, throughput abstaining, catalogue sizes). **Never used
by a person:** the QR scanner. **Never run on hardware at all:** the gate's
`no-session` branch, which needs `allow_anonymous` off to reach, and the
node-row paste path, which `adb shell input text` cannot emulate.

**None of it has been re-verified on a tagged build.** Everything measured on
2026-09-21 was on a dev build of the 0.8.0 tree. The tagged 0.8.0 was only
seen to install and start, and 0.9.0 has not been installed anywhere.

**`ReactNativeJS` logs reach `logcat` from a release build.** `adb logcat
-v UTC | grep ReactNativeJS` shows core's routing, health and registry logs
live. It is the cheapest instrument this client has. **Always read it with
`-v UTC`** (Tom's Zulu ruling): our log lines carry no timestamp of their
own, so logcat's is the only one, and it is device-local by default.

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

### Devices

Deploy with `adb -s <device> install -r android/app/build/outputs/apk/release/app-release.apk`
after `npx expo prebuild --platform android` and a Gradle `assembleRelease`.
**Do not skip prebuild after a version bump.** Every command needs `-s`.

- **Blackview A85**, serial `A85EEA0000005410`, Android 12, panel 720x1612.
  Has **`aebbc44`** since 2026-09-27 15:20Z (*Where things stand*). The
  wireless ADB port rotates on every enable (`34471`, `43777`, `41479` on
  2026-09-27 alone). The port rotates, so
  rediscover with `adb mdns services` (`_adb-tls-connect._tcp`), then `adb
  connect <host>:<port>`; the first connect sometimes times out and the second
  succeeds. It drops when the phone sleeps — a screenshot of a sleeping phone
  is solid black; check `dumpsys power` for `mWakefulness` and send
  `KEYCODE_WAKEUP` before believing a blank capture. **It has a secure lock
  screen** that no ADB command here clears. It has **both** a remote TLS
  cluster (`https://macnessa.macha.network`, gbni-1) and a **LAN node at
  `10.35.1.50`** (fi-1) configured; `ramaroja` is gone from the list. The
  LAN is `10.35.1.x`. **Focus-gated helpers** used on 2026-09-27 (`tap.sh`,
  `key.sh`, `ui.sh` in the job's tmp) are worth rewriting the same way: each
  checks `mCurrentFocus` in the same invocation, and `ui.sh` deletes the old
  dump first (a failed `uiautomator dump` otherwise reads back the previous
  screen).
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

**None of this is verified against the current tree.** It was driven on 0.6.0,
before the seek-window work in 0.7.0 and everything since.

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

**Blocked on data, 2026-09-27:** *The Cannonball Run*'s file has lost
extents, and both nodes refuse it (`read media: extent unavailable`), so it
cannot be the test until the server restores it or another ten-bit AV1 file
exists. **The test, when it can run:** force **Direct play** on it from the
options sheet — its Opus audio is decodable, so only the video question remains. Three
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
  `capabilities.dash` nowhere. **It cannot be deleted from here**, checked
  2026-09-24: `dash: boolean` is a required field of core's
  `DeviceCapabilities` (`types.ts:210`). Dropping it is core's change; ask
  when next talking to core rather than setting it to `false` to look tidy.
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
  **Do not make that change on its own; checked 2026-09-24.** After
  `d5a7273` the first cold-start load, which fires before the session
  manager starts, is answered with the downloads (`isSessionNotStarted`), and
  the `unknown → granted` bump is the **only** thing that reloads the real
  catalogue afterwards. Keying on the boolean removes that reload, and a cold
  start sits on downloads alone. It needs its own trigger first: bump
  `generation` once the session manager has started. **Related risk to check
  on the phone:** if access stays `unknown` (the whoami never answers),
  nothing reloads at all. That screen used to be an error with a retry
  button; it is now the downloads with no error, and only pull-to-refresh
  gets the catalogue.
- **One node's 401 stands for the whole cluster.** `isAuthRefusal` in
  `MediaApi.serve` (which could not fire at all before `d5a7273`) collapses to the local library without trying another node,
  and the router will not walk on a 4xx. Usually right, because sessions and
  roles are replicated — but during a rolling upgrade an older build's session
  carries a role vocabulary the newer one refuses.

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

---

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

**The laws standardisation is done everywhere** (COMPLETED 2026-09-24):
- the server renumbered in `c85ba51`;
- core removed its "numbering disagrees" note in `89df8b3` and swept its
  citations in `b3fd7a7`;
- the web client and the TV corrected theirs.

The server wrote a merged `docs/principles-and-laws.md`; **if core adopts it,
this repo's copy should follow**. Its header names the core commit it came
from (`284e52e`).

**Optional, from core `b47773d`:** `seedEndpoints({ configured, environment?,
remembered? })` is the shared form of what `MachaProvider.tsx` does with
`applyAdvertisement`. Ours is already the right shape, so adopting it removes
a mirror and fixes nothing.

**Server keys added since 0.56.0** (the top-level `"status"`, 0.63.0's
`threads`, 0.64.1's `prompt_replication`) reach this client only through
core; no parse failure has been seen on the A85 runs of 2026-09-25 and 27.

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
- **Core `0.20.0` is being cut** (2026-09-27) for the release above; `0.19.0`
  (2026-09-24T17:42Z) is the newest on npm at the rationalisation, and 0.9.0
  pins it. Before
  it, `0.18.0` (2026-09-21T19:31Z) was pinned by 0.8.0. `0.15.0`
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

---

## Possible server change worth watching

**Tying the video transcode entitlement to the engine rather than the session**
is under consideration, so pipeline reclaim at 60 s frees the slot and a
resuming session re-acquires it. **Since 2026-09-23 this client closes what a
killed process left at its next launch** (COMPLETED), so the hole left for
the server is the phone that is not opened again inside thirty minutes —
smaller than "no client can", not gone. It is **client-visible**: a session could be
*refused on resume* where today admission is guaranteed for its lifetime. That
is a new state this client would have to handle rather than treat as an error.
With the reaped-session P1 wired, `regenerate` failing on the owning node is
exactly the branch that state would arrive in. No action until the server
session says which way it goes.

---

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

---

## Checked and already correct

Recorded so they are not re-raised.

- **0.9.0 compiles and passes 290 tests against published core 0.19.0**,
  including from a fresh clone with no `../macha-ts` (2026-09-24). **The
  tree compiled against published core 0.18.0 and against the link at
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
