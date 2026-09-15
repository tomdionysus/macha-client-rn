# Completed

Finished work, and — more usefully — what it measured or concluded. Experiments
that were reverted are recorded here too: a route that was tried and found not
to work is worth as much as one that shipped, and costs a day to rediscover.

Newest first.

---

## 2026-09-15 — core moved to its real name, and a recommendation that would have broken hydration

**The dependency was named after a package that does not exist.** `@macha/core`
resolved only because its value was a `file:` path; the entire `@macha` scope is
unclaimed on npm, and `../macha-ts` has called itself `@machafoundation/core`
since core settled the name. **npm does not check that a `file:` dependency's
key matches the package it points at** — verified in a scratch install, not
assumed — which is why the mismatch was invisible and would have stayed so.

The security case for not leaving it: anyone may register `@macha` and publish
`core` into it, and any install that loses the `file:` override would fetch a
stranger's package and run its install scripts. Today that 404s, which is the
only thing making the failure loud.

**Done:** `@machafoundation/core@^0.11.1` from the registry, all 38 imports
renamed, lockfile regenerated and resolving to the tarball by integrity hash.
Only 0.8.1 and 0.11.1 exist on npm — 0.9.0, 0.10.0 and 0.11.0 were tagged in git
and never published, so a `^0.10.0` range would not have resolved. No local link
retained, per Tom.

**`metro.config.js` went with it.** Its `watchFolders` entry named `../macha-ts`
because npm materialises a `file:` dependency as a symlink out of the project
and Metro only watches the project directory. Left in place it would have
pointed the bundler at a sibling tree the client no longer compiles against.
Nothing in vitest would have caught that — `react-native` is stubbed and Metro
never runs — so the acceptance test was a real `expo export`, which produced a
4.8MB Hermes bundle from a fresh clone with no `macha-ts` on disk.

**The regeneration also swept two extraneous lockfile entries**, one pointing at
another session's scratchpad.

**The trap the core session flagged, and it was right:** `npm install` reuses an
existing link rather than fetching, and because the local tree is *also* 0.11.1
the version check passes and the suite goes green while you are still compiling
against the sibling directory. `test -L node_modules/@machafoundation/core` and
the lockfile `resolved` URL are the honest checks; a fresh clone is the honest
acceptance test.

### The part of the same message that was wrong for this client

Core 0.11.1 added `macha-client-progress:` to `isMachaStorageKey`, and core's
doc comment tells hosts to use that helper **rather than a prefix test of their
own**. This client's `ClientStore.hydrate` uses its own prefix test, so the
recommendation appeared to land squarely on it. Taking it would have caused the
incident it is named after.

`isMachaStorageKey` is a registry of the keys **core** owns. `owned()` filters
every key **this client** must restore, which is a strictly larger set. Core
lists none of `macha.clientId.v1`, `macha.endpoints.v1`,
`macha.discoveredEndpoints.v1`, `macha.downloads.v1.`, `macha.musicLibrary.v1.`
or `macha.progress.v1:`, and no longer lists `macha-session` either. The
`macha.progress.v1:` detail matters: this client's legacy Continue Watching key
is **not** `macha-client-progress:`, so the one item described as "directly
yours" was not.

**A correction inside the correction, and it is the point of this entry.** In
telling core that, I said `macha-client-progress:` was the *web* client's key.
It is not — it is **core's own** pre-`0.10.0` key, adopted inside
`ContinueWatchingStore.read()` and deleted by its `clearAll()`. I took that
straight from the comment atop `state/continueWatchingMigration.ts` in this
repo, repeated it to core with a second name attached, and core had to correct
it. Exactly the failure `AGENTS.md` warns about: a claim forwarded looks
corroborated when it is only travelling, and being right about the larger point
is what made this one easy to carry along unexamined.

The comment is now fixed at source, and checking it turned up something
load-bearing nobody had written down: any device that ran a build of this client
from before core `0.10.0` still holds that key, so core's adoption is live here,
and it works **only** because `macha-` is in `OWNED_KEY_PREFIXES`.
`configureMachaHost({ storage: clientStore })` means core reads through this
store, and `getItem` answers only from the hydrated cache — a key that is not
hydrated is a key core sees as absent. Now pinned by the hydrate test.

Worst of the six is `macha.clientId.v1`, the namespace the per-client stores are
keyed under — a fresh client id on every cold start would orphan Continue
Watching, the queue, the playlists and the music library as well. Silent, like
the sign-out before it.

**Nothing needed changing for `macha-client-progress:`**: `macha-` already
matches it, and this client clears storage by key rather than by enumeration, so
the case core fixed does not arise here.

The hydrate test now seeds those six keys, so the swap fails loudly. Checked by
making it — substituting `isMachaStorageKey` fails on `macha-session` at the
first assertion — rather than by writing a test that passed on the first run.

**This is the fourth inherited claim to arrive with a plausible mechanism and
not survive being opened.** It came from a session that had just been right
about three harder things, which is precisely when one stops checking.

## 0.5.1 — a seek stopped costing a healthy node, and a login started surviving

Two defects, both **measured on a device** rather than reasoned about, and both
found by doing the thing rather than reading about it.

**A seek evicted a healthy node.** Seeking an hour into a 2:43 film on a
transcoded generation asked for segments hundreds past anything being produced.
Measured on the A85 against gbni-1: `Response code: 500` at 15:58:00.724,
`failover-attempt` 45 ms later, session stopped on macnessa, fresh session on
ramaroja, **6.2 s gap** — a working node abandoned and its transcode discarded
for refusing something it had never been asked to build.

Three facts nobody had: **the 500 does arrive** (4.7 s, well inside media3's
deadline); **media3 does not retry it** — fatal on first occurrence on the HLS
path, so the server's hold is the entire retry budget in the system; and **this
client converted a retry signal into a node eviction.**

The server session then corrected the mechanism, and the correction mattered:
that 500 was **not** the hold expiring. `public_stream_response` has two refusal
paths — inside the window a request is *held* up to `segment_timeout`; beyond it
the answer is immediate, sub-millisecond, `beyond_hold_window`. **No timeout
would have helped.** Production has to move to where the viewer went.

Fixed by repositioning the generation: a forward seek past what the player has
buffered issues a seek-only PATCH and repoints the player at the URL from the
response *before* resuming. The repoint is **forced**, not conditional on the URL
changing — a seek PATCH creates a new generation, the URL carries it in its path,
and the old one answers **404 by design**. Our existing update path only repoints
when the URL differs, which would have worked in testing and failed on the one
path where the generation is the only difference. **Verified: zero refusals, zero
failovers, one PATCH of 2482 ms**, and the node's keyframe answer 6.7 s past the
target — which is why the node's figure is believed over ours.

Keyed on buffered-end rather than the node's hold window, deliberately: we cannot
see that window and must not keep a second copy of it. It errs toward a
reposition that was not needed, costing one cheap PATCH, rather than toward
losing a node.

**Signing in lasted exactly one process.** Core caches the session under a
*hyphenated* key; this client namespaces its own `macha.` and hydrated storage
with a dotted filter, so the token was written to disk faithfully every launch
and never read back. Nothing errored, nothing logged — an anonymous session
re-mints in milliseconds, so the only symptom was a **person** being signed out
on every cold start, invisible until an account mattered. Verified: force-stop,
reinstall, relaunch, still signed in.

Core confirmed it was their bug and audited: **two undocumented conventions**,
eight hyphenated keys and five dotted. A client filtering one misses half of
them, including the session, with every reason to think it had covered them.
`isMachaStorageKey()` is now exported so no host has to grep a dependency.

**The first diagnosis was wrong, and that is the lesson.** Ephemeral storage was
blamed — and it had already been pointed at persistent storage deliberately, with
a comment saying why. A plausible mechanism that fitted the symptom exactly. This
project's standing failure mode, committed again by the person who wrote the
warning about it into `AGENTS.md`.

**Two near-misses caught before shipping, the same shape both times: the thing
verified and the thing shipped drifting apart silently.**

- **The APK was lying about its version.** `android/` is generated by prebuild
  from `app.json`, and Gradle reads the *generated* `build.gradle`. Bump without
  re-running prebuild and the APK carries the old version. Every build installed
  after the 0.5.0 bump was labelled **0.4.1 / versionCode 401** — the JS was
  current so the measurements hold, but the device reported the wrong version all
  day. `version:check` cannot catch it and still cannot; that is open.
- **The release commit was missing the code it released.** `PlaybackProvider.tsx`
  was left out of `git add`, so the commit held the policy functions and their
  tests but not the wiring that calls them — and the tag pointed at that tree
  while the tested APK came from the working tree. Caught in the pre-push check,
  amended, re-tagged. Exactly what AGENTS.md's rule about the release commit
  exists to prevent.

**Also in this release:** core 0.10.0 landed in `dist` mid-release and broke the
typecheck in three places, all deletions rather than migration. Running on core
**0.11.0** as of tonight, verified rather than assumed: typecheck clean, 90 tests.

## 0.5.0 — a cluster that refuses you, and one warning that means everything

**The shape of it:** a viewer the cluster will not serve gets the app with their
own downloaded media in it, and one warning in the header that says why. No
wall, no raw server error, no claim the library is empty when it is only
unreadable.

**What the server actually does, and the premise it broke.** Removing the media
view role from anonymous does **not** produce a session with no roles — at the
time it stopped the mint entirely. `PasswordCredentialValidator::validate`
(`macha/src/session_api.cpp:87-97`) maps both `!allow_anonymous` *and*
`user->roles.empty()` onto `CredentialOutcome::disabled`, answering
**403 `anonymous_disabled`**, so the client held no token and every later request
met the global bearer gate with **401 "a valid session bearer token is
required"** — not the 403 the role check produces. Tom called that a server
defect and changed it; the client handles both states regardless. Found with one
curl after reading the source, having first designed against the wrong premise.

**The gate is three-state, and that is the whole point.** `describeMediaAccess`
(`src/account/access.ts`) answers `unknown` / `granted` / `denied`, and only
`denied` may gate anything. `SessionManager.fetch` waits on a mint only when one
is *already* in flight, so a request in the window after a failed mint goes out
tokenless, is answered 401, and returns unretried — reading exactly like a
refusal. A two-state gate on that sends a fully privileged viewer to a login
screen on any cold start against a slow cluster. **Ten tests; four of them fail
against a naive two-state implementation**, which was checked by writing one
rather than assumed.

**The probe that was written, measured working, and deleted.** Core discarded
the reason a mint failed, so the client classified it by calling
`mintAnonymousSession` directly. It worked on a device. It was also a polyfill of
core's session lifecycle: it walked `endpoints` rather than
`registry.candidates()` — no health ranking, no `recordSuccess`/`recordFailure` —
and minted a real session it then discarded on the path where it succeeded,
feeding the very `session_idle` leak this file already tracks. Removed, and core
asked to report the fact instead. Core shipped `lastMintFailure` carrying
`reason: 'refused' | 'unreachable'` — answering the status-to-meaning question
once, so four clients cannot drift on it. **Only `refused` may offer a login.**

**One warning, not four booleans.** `src/state/problems.ts` is the single source
for the header badge, the line under it, the popover, the empty-shelf copy and
the Continue Watching filter, so those five cannot disagree about whether
something is wrong. It reports root causes only — with the device's radio off,
"cannot reach your cluster" adds nothing — but an account refusal *is* reported
alongside an outage, because it outlives one.

- **`network-down` is now distinct from `cluster-unreachable`.** Both used to be
  "offline", which told a viewer with Wi-Fi switched off exactly what it told a
  viewer whose node had died. **Still deliberately no "no internet":** this
  client ignores `isInternetReachable` on purpose, because a LAN with no route
  out is a fine home for a cluster.
- **Continue Watching was offering items it could not play**, because it filtered
  on `offline` — one of four ways the answer is no. A refused cluster answers
  promptly, is offline by no measure, and can play nothing. Measured: the rail
  dropped from three items to the downloaded ones.
- **"No films in this catalogue yet" is a claim about the catalogue**, and only
  admissible when one can be seen. Refused, it now reads "This account cannot
  view films"; showing local media, "No films downloaded".

**Reachability handed back to core.** The 60s backstop called
`services.media.status()` → `/api/v1/status`, which server 0.38.5 gates behind a
new `view_status` role: it would have begun answering 403 and reporting a
healthy cluster as unreachable. Deleted rather than repointed — core answers the
same question every 10s (`ENDPOINT_HEALTH_INTERVAL_MS`) from a liveness route
needing no session and no role, so ours was a slower second opinion, and two
independently chosen timeouts colliding is already four bugs here.
`Connectivity` is now a mirror of core's transitions via
`subscribeConnectionState`. The NetInfo listener stays and **no longer votes**:
it records the device's own radio as its own fact and kicks core's monitor when
the radio returns.

**The connect gate was broken in waiting.** `firstReachable` probed
`/api/v1/catalogue/status`, which needs `media_viewer` — and the client using
that gate is the one with neither session nor role. It survived only because the
probe is tokenless and so got 401, which it tolerated; **it did not tolerate
403**, so the first node to answer 403 would have made it impossible to save a
node address at all. Switched to core's `LIVENESS_PATH`. Core then reported that
their own gate had the mirror-image defect — it required `response.ok` against
the same route, so a fresh install could not be configured — fixed in 0.9.0, and
`checkEndpointConfiguration` should replace ours entirely.

**Measured on the A85** (Blackview A85, `A85EEA0000005410`, Android 12) against
the three-node TLS cluster at `macnessa`/`ramaroja`/`inverbeg`, 0.38.0–0.38.1:
no crash; `probe-cycle` holding at `reachable: 3, known: 3` throughout, so a
refusal demotes nothing; local media, artwork included, rendering from
`OfflineLibrary`; the access-aware empty copy on Films and TV. **The
`no-session` branch has never run on hardware** — anonymous exists with zero
roles, so the device reports `no-role`. Seeing the other path needs
`allow_anonymous` off.

**Two defects left in deliberately, raised and declined:** the `generation` bump
fires on the healthy path (`unknown → granted` on every launch), so a cold start
runs the catalogue load twice; and `isAuthRefusal` lets one node's 401 stand for
the whole cluster without trying another, which is usually right because
sessions and roles are replicated, but is an assumption.

**Core moved 0.8.1 → 0.9.0 underneath us.** A `file:` link carries no version
signal, so the rebuild delivered a breaking surface with nothing to announce it.
All three breaks checked and none reach this client. **The lesson core recorded:
when a defect in a shared function is fixed, tell the clients that routed around
it** — nobody would otherwise go back, and one rule ends up in four places with
four opinions.

## 2026-09-13 — the Claude attribution trailers were stripped from every commit

Every commit on `main` and `develop` carried `Co-Authored-By: Claude …` and
`Claude-Session: …`. All nine were rewritten out and force-pushed, so **`0.4.0`
and `0.4.1` name different SHAs than they did**: `0.4.0` → `57a625e`,
`0.4.1` → `8796ce8`. Trees are byte-identical and commit counts unchanged —
messages only. Any clone taken before this diverges and should be re-cloned
rather than merged.

Two things to know if it is ever done again. `filter-branch -- --all` rewrites
`refs/remotes/origin/*` as well, which makes `--force-with-lease` refuse with
"stale info" until a `git fetch` restores the tracking refs to the truth. And
tags push independently of branches, so a half-finished attempt can leave the
remote with tags pointing at commits no branch can reach.

**Nothing in this repo should ever add those trailers again.**

## 2026-09-13 — every build this client ever made was `versionCode 1`

Found while tagging, and it is the most expensive thing in this batch.

`app.json` set no `android.versionCode`, so Expo defaulted it to 1 and every APK
ever built here shipped as version 1. **Android compares that integer and ignores
`versionName` entirely**, so 0.1.0 and 0.4.0 were the same build as far as the
package manager was concerned. `install -r` masked it completely.

The install was never the risk. The risk is on-device debugging: reading new
source while watching old bytecode, with nothing at either end to say the two had
diverged. **The Android TV session confirmed the same bug in that client and
supplied the sharper case** — five genuinely different builds installed to the
television in one session, all as `versionCode 1`, during a session that was
entirely on-device debugging.

Fixed by deriving it from the version as `major*10000 + minor*100 + patch`
(0.4.1 → 401): monotonic, and it reads back as the version it came from. The TV
client adopted the same derivation unchanged so the two Android clients read
alike. `npm run version:check` now compares `package.json`, `app.json` and the
tag, checking the tag only when the commit has one.

**A related claim in this file was wrong and is corrected.** A P3 item said
`android/app/build.gradle` carried a stale `versionName "0.1.0"` that "wants
wiring to the `app.json` version". `android/` is **gitignored and generated**,
and `versionName` was already wired: a prebuild wrote `0.4.0` with no hand-edit.
What the device reported was a stale generated tree, not a stale source of truth.

**Branch and release convention, set by Tom the same day**, now in `AGENTS.md`:
work on `develop`, releases are tags on `main`, tags bare semver and annotated,
never name a branch after a version, and put the bump in the release commit so
the tag points at a tree that is exactly what ships. All four rules came from
getting one of them wrong first — `release/0.5.0` was carrying a patch within a
day of being created.

---

## 0.4.1 — the node field, and a fix that was measured and lost

**Recorded because the first attempt shipped and failed on a device**, which is
worth more than the fix that replaced it.

The connect screen's field had `multiline`, split on newlines *and* commas, and
said "one per line" in its hint. None of it was reachable from a phone. The
diagnosis: with `inputMode="url"` the Android action key is **Go**, which submits
instead of breaking the line. The fix was `submitBehavior="newline"`. It shipped
in 0.4.0, went onto two phones, and Tom reported the field still offered one line
with no way to type a second.

**So the diagnosis was at best incomplete.** RN's `submitBehavior` governs what
RN does with a submit; it does not make the IME offer a newline key at all, and
for a URI-variation field it evidently does not. No third keyboard flag was
tried.

**What replaced it asks nothing of the keyboard.** One row per node, a control to
add another, a remove control once there is more than one, no Enter anywhere in
the flow. The URL keyboard stays, since nothing needs a line break from it now.
Pasting is the only part with logic — `src/state/endpointList.ts`, nine tests:
separators expand across rows rather than sitting in one row as text nothing
would later split, the screen never ends up with no field to type into, and a
scanned address takes the empty row a fresh screen starts with.

The Settings row that lists the seeds was separately clamped at two lines by
`ListRow`'s default, which reads as a limit on how many nodes there can be; it
now sizes to the list.

---

## 0.4.0 — accounts, QR scanning, and the first native rebuild

Two features and the build change that carries them.

**Accounts are entirely core's.** `src/api/users.ts` is a re-export; the only
local decisions are React wiring and what to draw. Asked before building, as the
mirror rule requires. Roles are a **closed set with no implication between them**
(`media_viewer`, `importer`, `manager`, `manage_users`), `isSignedIn` is the only
test for whether somebody chose to be anyone, and no account is special-cased by
name — the server's `mutable` block says what may be changed.

`POST /api/v1/session` is one route with or without credentials: omitting them
authenticates `anonymous`. Signing in therefore **replaces** the token rather
than upgrading it, and signing out drops it and mints a fresh anonymous one, so
there is never a state with no session.

**Two orderings this client had to get right, neither of which core does for it:**

- **Playback stops before both sign-in and sign-out.** After the token changes a
  playback session created under the old identity can no longer be closed, and
  the node holds it against `max_video_transcodes` until `session_idle` at thirty
  minutes — on a one-slot node, the entire transcode capacity, spent on a login.
  Core confirmed it connects logout to nothing in playback. The core session
  recorded the ordering as belonging on `signIn`/`signOut`'s doc comments so it
  is not rediscovered a third time.
- **The revoke runs before the local sign-out, and a failed revoke is reported.**
  Dropping a token locally is not a logout. When the revoke cannot be delivered
  the viewer is still signed out here — having asked to be signed out and
  remaining signed in is the one outcome that must not happen — and Settings says
  the old session is live elsewhere until it expires. **The web client does not
  do this**: it calls `logout()` and never `signOut()`, holding a revoked token
  until a later 401. Core says one of the two clients is wrong and that deciding
  it is Tom's call.

**The marker reads four states, not two.** `unknown` (nobody answered) and
`unstated` (the node answered and named no user) both render nothing; only
`anonymous` and `signedIn` are drawn. Identity is re-read on every token change
rather than remembered, which is deliberate cover for a core defect: a 401 is
answered by re-minting, a re-mint carries no credentials, so a password or role
change silently downgrades a signed-in viewer to anonymous. The marker corrects
itself; it does not explain itself, and the cause stays core's.

**QR scanning went in ahead of any pairing format.** The scanner reports payloads
and interprets none of them; `src/scan/endpoint.ts` is the only file that reads a
node address out of one. It exists because the plain coercion, measured before
the parser was written, turns `macha://pair?token=abc` and `Macha` into
`http://macha:7438` and `mailto:tom@example.com` into `http://example.com:7438`
— perfect-looking endpoints no node answers on, after which the connect attempt
reports an unreachable server, which is true and the wrong diagnosis.
**No pairing payload format exists anywhere** — core grepped, the web client
confirmed, and both agree that a format invented independently in two clients is
worse than not having one.

**`expo-camera` made this the first build needing a native rebuild.**
`expo prebuild` clears and regenerates `android/`; nothing is lost because it is
gitignored. The installed package requests `CAMERA` and does **not** request
`RECORD_AUDIO`, which is `recordAudioAndroid: false` doing what it was asked.

**What the A85 install proved:** the app launches, stays up, crash buffer empty;
`versionName` went `0.1.0` → `0.4.0` on the device; the health monitor reported
`reachable: 1, known: 2`. The second seed, `ramaroja.macha.network:7438`,
resolves and pings from both the phone and the Mac but answers nothing on 7438
from either — a seed pointing at a node that is not serving, rather than anything
this client does wrong.

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
