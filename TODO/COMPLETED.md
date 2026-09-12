# Completed

Finished work, and — more usefully — what it measured or concluded. Experiments
that were reverted are recorded here too: a route that was tried and found not
to work is worth as much as one that shipped, and costs a day to rediscover.

Newest first.

---

## 2026-09-10 — the seek bar fought the viewer, and one number was a lie

Three defects behind one report — "the seek bar does not work, it 'fights' you".

**The fighting was the `PanResponder` being rebuilt mid-drag.** Its `useMemo`
depended on `[enabled, onSeek]`, and `play.tsx` passes an inline arrow, so
`onSeek` was a new function on every render — several times a second, because the
player reports a position that often. A fresh `PanResponder` starts a fresh
gesture: `dx` resets to zero and the thumb snaps back to where the finger landed,
four times a second. Both props now go through refs and the handlers are created
once. Music never fought because `NowPlayingMusic` passes `seekTo` directly,
which is stable — the same bug was one call site away from being invisible.

**Stale positions dragged the bar back after release.** Both engines keep
reporting the pre-seek position for a few frames, and much longer on a
transformed stream, so the bar snapped back to where the viewer left and jumped
forward when the seek landed. `seekStillPending` now ignores reports until one
arrives within 1.5 s of the target — a transformed stream lands on a keyframe,
not the exact target — with a 6 s deadline so a seek that never lands cannot
freeze the position for good. That also stopped the stale position being
checkpointed to Continue Watching.

**And the "negative duration" was a design choice, not a bug.** Nothing computed
a negative: the right-hand label was *remaining* time with a literal `−` prefix,
so a long film read as `−1:47:12`. It now shows total duration next to elapsed.
Worth recording because the report said "total duration is negative" and the code
was working exactly as written — the defect was that the design read as a fault.

Tests for the first two, verified failing against the pre-fix code. The
`PanResponder` fix has none: the bug is in hook wiring, which this project
deliberately does not render to test, and a test asserting "the handlers are
created once" would assert the implementation rather than the behaviour.

## 2026-09-10 — documentation rewritten against what is actually true

The README had drifted far enough to mislead: it still told the reader to enter
an API token, still listed `src/api/endpoints.ts` in the layout, still described
one best-effort membership refresh merging `api_host`/`api_port`, and never
mentioned `@macha/core` at all. 204 lines to 144.

What it gained is the part that was missing rather than wrong: **where this repo
sits.** Four clients sharing core, what the `file:../macha-ts` link actually
means — core's working tree is this client's code, resolved through `dist/` — and
the one difference that keeps causing confusion, that the other three clients
drive playback through `PlaybackCoordinator` and this one does not, so a fix made
inside it does not arrive here however the release note is worded.

The playback prose became a short **invariants** section, because that is what
someone needs before changing anything: generation ordering, availability never
derived locally, honest capabilities, and segments never passing through
`src/api/http.ts`.

`AGENTS.md` gained the TODO convention and the inherited-claims rule. This folder
was created at the same time.

## 2026-09-10 — expo-video's ducking, and a bug that cannot fire here

**Summary, because this entry corrects itself twice.** The library really does
corrupt its own volume when it ducks. On Android 8 and later the framework never
tells it to duck, so it never happens. A guard is in place anyway. Nothing on the
phone was ever observed losing volume.

**The mechanism, and the first recording was wrong about it.** It was filed as
"ducks compound, and a `GAIN` that never arrives never restores" — i.e.
conditional on a missing callback. In the source it is not conditional.

`AudioFocusManager.duckPlayer` does `player.volume /= 2f`. That assignment goes
through `VideoPlayer.kt:132-136`, whose setter does `userVolume = volume`. So the
duck **overwrites the very reference the unduck restores from**: `unduckPlayer`
sets `player.volume = player.userVolume`, which is by then the ducked value.

So every duck halves the volume permanently, `AUDIOFOCUS_GAIN` or no
`AUDIOFOCUS_GAIN`, and they compound — two interruptions is a quarter, seven is
about one percent. There is no recovery path inside the library at all. Presents
as picture fine, audio fading away across a film, no error, nothing paused, and
turning the volume up not helping.

**Fixed here rather than in the library.** `restoredVolume` in
`src/playback/policy.ts`, wired to expo-video's `volumeChange` event in
`PlaybackProvider`. Any drop below the intended volume that this client did not
ask for is written straight back; returning `undefined` on a match is what stops
the write re-triggering itself, helped by expo-video's own `IgnoreSameSet`.

**Then measured on the device, which narrowed it sharply.** Because
`willPauseWhenDucked` is never set, the framework ducks automatically on API 26+
and does **not** deliver `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` to the app. So
`duckPlayer` never runs there and the volume is never mutated.

Verified rather than reasoned: playback started on the Android 12 handset,
expo-video confirmed holding `GAIN`/`USAGE_MEDIA`/`CONTENT_TYPE_MOVIE` in
`dumpsys audio`, then a real `GAIN_TRANSIENT_MAY_DUCK` induced from a
notification. The audio ducked at the mixer and this client's focus-stack entry
still read `loss: none -- notified: false`. No `volumeChange`, no restore.

**So the fix is inert on every Android this app has run on.** `minSdkVersion` is
24 and expo-video takes a deprecated pre-O path below API 26 where the callback
*is* delivered, so the bug is real on Android 7.0/7.1 and only there. Kept
because it is cheap and catches any unrequested drop rather than only a duck —
**not** because anything here was ever seen to lose volume.

That distinction is the whole point of this entry. The source reading was
correct and the conclusion drawn from it was too wide; only the device settled
it.

**Considered and rejected:** handing focus to media3 via
`ExoPlayer.setAudioAttributes(..., handleAudioFocus = true)`, as the Android TV
client does — media3 keeps ducking as an internal multiplier that cannot
compound. expo-video never calls `setAudioAttributes` and exposes only `volume`,
`muted` and `audioMixingMode` to JS, so there is nothing to delegate to short of
patching the module.

Four tests, verified failing against the unfixed decision first.

## 2026-09-10 — inherited claims, and why this client keeps getting caught by them

Not a release. Recorded because it happened four times in two days and will
happen again.

**This is the newest client in the project.** Its README, its code comments and
its assumptions were written against a Macha that has since moved, and against
sibling clients whose behaviour it does not share. Documentation here decays
faster than the code, because the code at least fails when it is wrong.

What was found stale, in one sweep:

- **`Macha-Viewer-Session` and `Idempotency-Key` headers.** The README described
  every session POST as carrying both. Both are **retired** — the only trace is a
  server comment calling them "pure restatements of what the client already sent"
  (`playback.cpp:853`). A per-process UUID is still generated here and passed to a
  constructor that ignores it (now a P3).
- **A "permanent bearer token" for session control.** Described in the README and
  in three code comments, after the manual token was deleted in 0.3.4. Two of the
  three were merely ambiguous — the anonymous session's header is a bearer token —
  but the ambiguity is exactly what cost a round trip to resolve. All three now
  say "the session's Authorization header".
- **A manual API token in the connection instructions**, `src/api/endpoints.ts` in
  the layout diagram, and a cluster section describing one best-effort membership
  refresh merging `api_host`/`api_port`. All three describe versions that no
  longer exist.
- **"Sessions are node-local."** True of *playback* sessions and false of *auth*
  sessions, which are cluster-replicated and gossiped. The same word, two objects,
  one layer apart. Tom caught this one.

**The rule that comes out of it.** An inherited claim is not evidence. Check it
before repeating it, especially when repeating it to another session — a claim
forwarded with a second name attached looks corroborated when it is merely
travelling. One example this week: a `capabilities` object was reported here as
being sent by core's headless example, relayed onward as fact, and turned out not
to exist. The example was misleading; the claim was still wrong, and it was wrong
in this client's voice.

Peers are not a substitute for reading the code. Every genuinely load-bearing
correction in the last two days came from someone opening the file — the DOM
audit, the create-vs-PATCH mechanism, the two idle clocks, the coordinator split.
Every wrong one came from a plausible mechanism that fitted the symptom and was
never checked.

## 0.3.5 — core's platform-neutral abort errors

Nothing in this repository changed; what ships did, because `@macha/core` is
linked with `file:../macha-ts` and its working tree is this client's code.

**The finding.** Core called `new DOMException(...)` at twelve abort sites,
always as `signal.reason ?? new DOMException(...)`. That means the fallback
almost never ran on the web and **always** ran here — the one platform that
cannot evaluate it is the one that always reaches it. React Native's
`AbortController` comes from the `abort-controller` package, which predates
`signal.reason` and does not implement it; Hermes has no `DOMException` global,
and RN ships an implementation but never installs it on `globalThis`. So
cancelling an in-flight catalogue load or facts request raised `ReferenceError`
instead of an `AbortError`, on every screen unmount and every pull-to-refresh.

A green web client and 570 green tests were never going to find it.

**Verification done for core**, and the reusable part: their new
`types/platform-neutral.d.ts` was checked member by member against RN 0.86's
actual polyfill sources.

- `cache: 'no-store'` is **not ignored on RN — it rewrites the URL.**
  `whatwg-fetch` 3.6.20 appends `_=<epoch millis>` to the query string for
  GET/HEAD. Live at `EndpointHealthMonitor.ts:26`, which runs here on a timer.
- `{ once: true }` **is** honoured — `abort-controller` is built on
  `event-target-shim`, which implements it. A caveat claiming otherwise was
  wrong and was removed.
- RN's `Blob` has only `size`, `type` and `slice()` — no `arrayBuffer()`,
  `text()` or `stream()`. `response.blob()` is safe only because nothing calls a
  method on the result. `Response.body` does not exist at all.
- `crypto` and `DOMException` are both confirmed absent as globals.
- RN's `URL` is a regex/string-concatenation polyfill, not an RFC resolver.

**The lesson, which is the part worth keeping.** Core's own audit grepped for
`window`, `document`, `localStorage` and `navigator` and reported clean while
`HTMLElement` sat in an exported signature and `DOMException` in twelve call
sites. Those four are the DOM's *nouns*. A name list was never the boundary; the
compiler is. Core now has `npm run lint:platform` as part of `build`.

The other half no absence check can find: globals that are **present but
different**. `URL` and `signal.reason` are both there and both behave otherwise.

## 0.3.4 — the manual bearer token is gone

Removed across every Macha client on Tom's instruction. Playback sessions are
minted anonymously, so a typed-in token was never load-bearing.

Gone here: the "API token" field on the connection screen and the Settings row;
`authFor(manualToken, sessions)` and the `fixedBearerToken` re-export, with the
`SessionManager` now passed as the `AuthenticatedFetch` directly;
`configure(endpoints, token)` → `configure(endpoints)`; `getApiToken`/
`setApiToken`. Net −48 lines.

**Kept deliberately:** the connection probe treats `401` as "a node is
listening". That is not leftover token tolerance — the probe runs before any
session exists, so a node with auth on answering 401 is the success case for
"is there a Macha at this address". Both other clients reached the same
conclusion independently.

**A migration was written and then reverted.** Both the NPM and RN sessions
wrote a sweep for the abandoned `apiToken` storage key. Tom's steer: Macha has
not shipped, so no device has ever had one written to it — there was no
abandoned credential to clean up. "Removing a feature is not the same as
removing its data" is a good rule; the question that decides whether it applies
is whether the data was ever written. Both sessions reasoned about the code
instead of asking that. **Default here is to delete cleanly and leave nothing
behind.** The one real exception in the tree is
`src/state/continueWatchingMigration.ts`, which covers Tom's own dev installs
across a rename.

## 0.3.3 / 0.3.2 — mid-playback failover

Failover recovers a stopped node mid-playback (`PlaybackProvider`'s video error
path → core's `ClusterPlaybackResolver.failover`), with a budget of 2 attempts
per 60 s and an in-flight guard.

**It is not seamless, and two attempts to make it so were measured and
reverted.** Recorded so they are not retried:

- **Warm standby via `prepareAlternate`:** promoted in **3 ms** and was **dead**,
  costing a second failover 3 s later. **The cause is unknown** — see the
  correction below.
- **Priming the replacement on a second player and rebinding `VideoView`:**
  worse — the video died instantly on node stop and the controls kept popping up.
  The wait is not the player: admitting a replacement takes **7–8 s** because the
  walk tries a non-answering candidate first; priming was ~1 s.

**Correction, 2026-09-10 — the explanation given for the dead standby was
wrong.** It was originally recorded as the standby aging into a reclaimed
pipeline: a node reclaims after about a minute idle, so a standby built early is
gone when wanted. Two things kill that.

`PlaybackCoordinator` arms `ALTERNATE_RECOVERY_WINDOW_MS = 30_000`
(`PlaybackCoordinator.ts:134`) which *closes* an unused standby, and the Android
TV session measured `pipeline_idle_ms: 60000` on 10.44.1.50 directly — a 2×
margin, so a coordinator-managed standby cannot age out. **And the measurement
never supported it here either:** promoted in 3 ms means the standby was three
milliseconds old and cannot have aged into anything. A true fact sitting nearby
was accepted because it fitted the shape of the symptom.

The defect filed with core on this basis has been retracted. The Android TV
client is the first that can actually promote a standby and will report what
happens; that is the real test and nobody has it yet. **Do not re-file this as a
`prepareAlternate` defect without that result.**

A fact worth keeping from the same measurement: `max_video_transcodes: 1` is
confirmed rather than folklore, so a standby on a transcode session holds the
node's only transcode slot for up to 30 s. That is an argument for preparing late
that has nothing to do with reclaim.

**Conclusion: seamless failover is a transport concern, not a player one.**
expo-video builds its `OkHttpDataSource.Factory` internally with no injection
point, so the transport cannot be wrapped.

An earlier claim that admission took 214 ms came from one lucky sample; two
later runs were 7–8 s. The general number is 7–8 s.

## 0.3.1 — convergence on `@macha/core`, and a test suite

Four modules deleted outright (`api/endpoints.ts`, `state/queue.ts`,
`state/continueWatching.ts`, `state/playlists.ts`). `api/playback.ts` went from
634 lines to 91, `api/status.ts` from 228 to ~18, `api/catalogue.ts` from 278 to
16, `types.ts` from 123 to 38. This client's named-collection `PlaylistStore` was
promoted *into* core as the better implementation.

Two real bugs found on the way, both from `ArtworkSource.requiresAuthorization`
being ignored: the lock-screen notification and the downloader were fetching
authenticated URLs without headers.

**Test suite:** vitest, logic only, no component rendering. See `AGENTS.md` for
why not jest-expo and for the failing-first rule — every test here that protects
something real was written by proving it failed against the code before the fix.
