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

Last rationalised 2026-09-24 afternoon, for a session starting cold after a
`/clear`; Open item 3 done that evening in `d5a7273`, and four smaller items
closed after it (COMPLETED, 2026-09-24 evening). Everything done on 2026-09-23 and 2026-09-24 is in COMPLETED under
those dates; what is below is what is still open, and where things stand.

---

## Start here

**Read this section before anything.**

### Where the code is

**`main` is at `7932542`, tagged `0.8.0`, pushed, unchanged since.**
`git log develop..main` is empty and must stay so.

**`develop` is well past `main`, and pushed through `287e79b` on Tom's word
(2026-09-24 evening)** — check `git log origin/develop..develop` for anything
after. Suite **290 tests across 25 files, typecheck clean, `expo export`
builds** at `287e79b`, against the linked core at `6fd7747` (dist
`b1a7c8dd8ee5`). Core `9654e1e` in that range hedges cached-token validation
across nodes (1 s per dead node, not 8) and keeps a cached session when no
node answers rather than re-minting — relevant to the 30-day P1 and the
unexplained sign-out of 2026-09-16. Working tree clean but for
`.claude/settings.json`, `CLAUDE.local.md` and `basemind.toml`, none of which
are this work.

**Check `tsc`'s exit code, not a grep of its output.** Its errors are
coloured, and `grep "error TS"` does not match through the escape codes — on
2026-09-24 that read zero errors where there were twenty. `npx tsc --noEmit
-p . >/dev/null; echo $?`, or pipe to `head` and read it.

### Core — `develop` cannot be released until core publishes

`package.json` pins `file:../macha-ts` on `develop`; a release on `main` pins
the published package; **a `file:` dependency must never reach `main`**, and
`version:check` refuses one there mechanically. Published core is still
**`0.18.0`**. **`develop` now depends on a great deal of unpublished core**:
the sort vocabulary (`LIBRARY_SORTS`, `SEARCH_SORTS`, `orderMedia`), search
categories and terms (`SEARCH_CATEGORIES`, `isSearchable`, `searchTerms`,
`searchCategoryOf`), the regenerate codes (`SESSION_PROVENANCE_UNKNOWN_CODE`,
`REGENERATION_ENDPOINT_GONE_CODE`), and **core's removal of all viewer text**
(`MediaSummary.subtitle`, the label helpers, sort and category labels — all
gone on core `develop` from `826e38a`). **The next release waits on a core
publish — Tom's call** — and then the full registry procedure under
*Releasing*, not a lockfile edit.

**Core moves several times a day.** `git -C ../macha-ts log --oneline -1`, `git
-C ../macha-ts status --short`, and `npm run dist:hash` in core before trusting
a typecheck or recording a build. Core's own session rebuilds its `dist`; do
not rebuild it from here while that session is live.

### What is on the phone

**The A85 is on an unreleased dev build: `22935ca`**, installed 2026-09-24
11:01:02, core `460ad1a`, dist `3edcfc76d7a3`. Still `versionCode 800` — **the
package manager cannot tell it from 0.8.0**; identify it by
`lastUpdateTime`. **Everything after `22935ca` is built on `develop` and not on
the phone**: the sheet's landscape insets (`f293cf2`), the reaped-session
probe (`61ce107`, `a11e150`), and the viewer-text move with Tom's music
ruling (`0746aa3`), the failure wording and offline fallback
(`d5a7273`), the connect screen's core gate (`592b904`) and the duration fix
(`38ee145`). At the last look it had dropped off ADB (asleep); still absent
from `adb devices` on 2026-09-24 evening.

**Another unpublished core dependency:** `isUnreachable` relies on core
`f3cf74c` making `unreachableEndpointFailure` read
`MachaClusterRouteError.unreachable`. Our own check was dropped once core had
it. Against 0.18.0 the offline fallback would be dead again, and the
route-shaped tests in `media.test.ts` would say so.

**`ramaroja` is offline for the foreseeable future** — Tom, relayed by core
2026-09-24 as said to it directly. The A85 has it configured beside
`macnessa` and the LAN node; remove it from the node list when next on the
phone, so the walk stops spending time on it. Nothing in `src` names it.

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

1. **Put `develop` on the A85 and look.** Nothing since `22935ca` has been seen
   on hardware. Check: album cards read title / artist / year; track search
   cards read album (year) / artist / "Track 9", both links working; music and
   playlist rows read album then artist; episode cards still "Season 1
   Episode 6"; the sort pill still "Sort By Title"; the Playback sheet clear of
   the navigation bar **in landscape**. Core rebuilds `dist` often — record
   the core SHA and `dist:hash` with the install.
2. **Prove the reaped-session probe.** P1 below — a 31-minute pause on the
   A85. Built on Tom's option A; unproven.
3. **Look at the new failure wording on the phone** (`d5a7273`). The
   cheapest check: a refresh with the cluster unreachable should now show
   the **downloads** rather than an error — the offline fallback could not
   fire before (COMPLETED, 2026-09-24 evening). Then the home refresh line,
   a wrong password ("That username or password was not accepted."), and an
   unnamed playlist reading "Untitled playlist". The connect screen is best
   tried on the Galaxy, which has no endpoints: a wrong port should now say
   "did not identify itself as a Macha node" and save on a second tap.
4. **The rest of the smoke test.** Unrun on hardware: a **quality change**, the
   create-failure copy, the player-failure copy, Remux's container branch of
   `directUnavailableReason`, the offline search path. **The account cap still
   cannot be tested** — the node limit refuses first.
5. **Zulu**, **544 MPEG-4 Part 2 files**, **AV1 ten-bit SDR** — P2 below.

**Not built, deliberately:** the web Search page's A–Z index (shown only under
Title order; this client has no A–Z index anywhere) — the web client's design
notes were sent as reference, not spec, and the phone is iterated separately.

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

### Peer sessions, 2026-09-24

**`Macha Client Core`** (`uds:/tmp/cc-socks/40630.sock` this run) and **`Macha
Client`**, the web client (`uds:/tmp/cc-socks/23042.sock`), both message this
session. **Relayed rulings are confirmed with Tom before building** — two hops
is where a claim stops being checked. Rulings core says Tom gave it
*directly* have been accepted, and one (the music lines) was still asked about
because it changed work already done. Reply to a message by copying its
`from` address.

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
4. Bump `package.json`, `app.json` (`versionCode` = major*10000 +
   minor*100 + patch) and the README's `*vX.Y.Z*` line **in the same
   commit**; `npm install` to sync the
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
  of `22935ca`** labelled `versionCode 800` since 2026-09-24 11:01 (*What is
  on the phone*).
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

---

## P1 — A reaped session is charged to the node that answered honestly — built, unproven

**Built 2026-09-24 in `61ce107` (+ the `player-error-settling` log line in
`a11e150`) on Tom's option A; not yet run on hardware.** The design history —
core's corrected sequence, the attribution question, the divergence on a live
session — is in COMPLETED under 2026-09-24, *The reaped-session probe*.

**What it does.** A player error the guards do not excuse waits
`errorSettleMs` — the node's own window, about 8 s — and is acted on only if
the player is still in error under the same generation, so an error from a
source already replaced never reaches the probe. Then `sessionAlive` on the
owning node (records nothing either way) → `classifyProbe` →
`recoveryAfterProbe`: **`gone` regenerates on the same node**, no charge and
no failover budget, bounded by core's same-position rule; `alive`,
unanswerable, or a failed regeneration fail over as before. Branches on core's
codes, never its wording.

**The cost, and it applies to every genuine failover:** they now start up to
the node's window later than before.

**The run that proves it** (A85, about 35 minutes): play a transcode, pause
31 minutes — past `session_idle` — resume, and read logcat for
`player-error-settling` → `session-probe { outcome: 'gone', recovery:
'regenerate' }` → `regenerate-result`, **not** `failover-attempt`. It may
instead show the session is never reaped while paused — something keeping it
alive — which is worth knowing either way. The player screen keeps the phone
awake, so wireless ADB should hold.

**Not built:** the proactive half — asking when `AppState` returns to
`active` with an old session, before the viewer presses play.

**One divergence from core's written sequence, undecided.** Core wrote the
resolver-direct recovery down on 2026-09-24 (`docs/writing-a-player.md`,
*Recovering without the coordinator*, core `5973dc5`). This build matches it
except in two places. `alive` fails over where core stops — deliberate and
commented in `recoveryAfterProbe`, since expo-video hides the 404 that would
tell the cases apart. **`session_provenance_unknown`** is classified
separately by `classifyProbe` and then **fails over**, where core says
**stop**; nothing records that as a choice. Core, 2026-09-24: `alive` →
fail over is defensible given expo-video; provenance is the one to settle —
with session ids now carrying their node it fires only for an id this
resolver never issued, and failing over then charges a healthy node. **Ask
Tom.**

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
- ~~`probeNow()`~~ — **done 2026-09-24**. It also stops a radio change from
  restarting polling while the app is in the background, which the old
  `stop()`/`start()` did.
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

## P2 — Core's transcode fallback on a decoder failure: wanted here, and detectable?

**Core `e840d72`, on Tom's ruling as relayed by core, 2026-09-24.** When the
player cannot decode a copied stream (a `media` or `unsupported` failure),
core's `PlaybackCoordinator` falls back to transcode. It does so once per
playback, and never over a mode the viewer chose. This client does not use
the coordinator, so it does not get this. Core's recipe for a resolver-direct
host: on a decoder failure of a direct or remux session the viewer did not
pick, call `resolver.update(session, { preferences: { mode: 'transcode',
video: 'transcode', audio: 'transcode' } })` once.

**It is exactly the 2026-09-23 case.** A Remux tap copied ten-bit HEVC the
A85 cannot decode, and the result was a black picture. Direct on *The
Cannonball Run* is the same shape.

**The obstacle is ours.** expo-video hands JS a `PlayerError` of `{ message }`
and nothing else (the native-player-error-opacity note). A decoder refusal
is visible in `logcat` as `MediaCodec`, not in JS. Telling `media` from a
network failure means matching ExoPlayer's wording, which is a rule this
project keeps retracting. Two routes that do not match wording:

1. **Fall back on any player error** of an unchosen direct or remux session,
   once. It is cheap and honest about not knowing the cause. It would also
   transcode a session whose node merely hiccuped, which the reaped-session
   probe runs first and may have explained.
2. **A native signal**: the codec probe module already talks to
   `MediaCodecList`. Checking the copied stream's codec and profile against
   it *before* choosing is what 0.8.0's probe does for the chooser. The
   2026-09-23 miss was Remux copying video it should not have, and that was
   fixed on `develop`. That makes a runtime fallback a second line, not the
   first.

**Ask Tom** whether he wants it on the phone, given (2) already covers the
cases seen so far. Relayed rulings are confirmed before building.

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

**Optional, from core `b47773d`:** `seedEndpoints({ configured, environment?,
remembered? })` is the shared form of what `MachaProvider.tsx` does with
`applyAdvertisement`. Ours is already the right shape, so adopting it removes
a mirror and fixes nothing.

**macha 0.56.0, announced 2026-09-24 by `Macha Server`, not yet deployed**
(es-1 and fi-1 were unreachable from home; the server session will say when
each node has it). Every JSON object response gains a top-level snake_case
`"status"` — `"ok"` on success, the handler's own code otherwise, equal to
`error.code` on an error — as the first key; nothing existing moves, and
streams, 204/304 and non-JSON bodies are unchanged. Tom's rule with it:
**every client checks everything it parses.** **Checked here 2026-09-24:
this client parses no server JSON itself** — the only `JSON.parse` calls read
its own storage (`sessionLedger.ts`, `continueWatchingMigration.ts`), and
every response comes through core — so the change reaches it through core,
and whether core's parsers accept or check the new key is core's. **When it
is deployed:** confirm core has taken it, then watch the A85 for any parse
failure. Management-view fields (`error_code` on jobs and hints) are not used
here. Details in the server's `CHANGELOG.md` under 0.56.0.

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
resuming session re-acquires it. **Since 2026-09-23 this client closes what a
killed process left at its next launch** (COMPLETED), so the hole left for
the server is the phone that is not opened again inside thirty minutes —
smaller than "no client can", not gone. It is **client-visible**: a session could be
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
