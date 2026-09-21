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

Last rationalised 2026-09-20, after 0.6.0 and core 0.14.0, for a session picking
this up cold. One P1 closed on 2026-09-21 — the private seek deadline, now
derived from the serving node's stated hold — and released as 0.7.0; see
COMPLETED.

---

## Start here

**Handover written 2026-09-21, end of a long session. Read this before
anything.**

### Where the code is

**`main` is at `7932542`, released as `0.8.0` and pushed 2026-09-21.** It is
the first `main` since 0.6.0 to pin a published core. `develop` is **one commit
past it** — the link restoration — and is **not pushed**; every earlier commit
reached `origin` through the `main` push, because `main` is a fast-forward of
`develop` as it has been for every release here.

**`main` is an ancestor of `develop`, and that invariant is worth keeping.**
The 0.8.0 bump was made on `main` rather than on `develop` as 0.7.0's was, and
`develop` was fast-forwarded onto it afterwards to restore it. Check that
`git log develop..main` is empty before the next release; if it is not, the
merge will conflict on `package.json` instead of fast-forwarding.

**Nothing is tagged `0.8.0` yet.** The release commit is on `main` and pushed,
but a release here *is* the tag, so until `git tag -a 0.8.0` lands this is a
pushed tree rather than a release. `version:check` passes without it, because
an untagged commit is ordinary work in progress rather than a disagreement.

Sixteen commits separate 0.7.0 from 0.8.0, newest first: the link restoration;
the release; the handover rewrite; the busy-flag fix; the day's record; the
role-less session advice; four playback defects; the codec probe. Each commit
body carries its own reasoning — read those rather than re-deriving.

**Suite: 204 tests across 19 files, typecheck clean**, run both ways on
2026-09-21 — against the registry copy on `main`, and against core `a3b40ca`
through the link on `develop`. A real `expo export` produced a 4.9 MB Hermes
bundle from the registry copy. Working tree clean but for
`.claude/settings.json`, `CLAUDE.local.md` and `basemind.toml`, none of which
are this work.

### Core arrives from the registry again

`package.json` pins `file:../macha-ts` on `develop` — correct there, and **it
must never reach `main`**. **Core `0.18.0` was published at 19:31 on
2026-09-21**, which unblocked the release the previous handover recorded as
impossible. `npm view @machafoundation/core version time --json` confirmed it
before anything was pinned, as step 1 of the procedure below requires.

**Use `npm run dist:hash` in core and nothing else** for the dist figure; every
hash in this file from before 2026-09-21 19:00 is the narrower `*.js`-only one
and is not comparable. Core was at `a3b40ca`, its `0.18.0` tag, for this
release.
### What is on the phone

**The A85 runs an unreleased dev build newer than `0.7.0`** — it carries every
fix below including the busy-flag one. It is *not* the tagged 0.7.0 and not
`main`. Anything measured on it must name which tree it was.

Builds are **90 seconds to 3.5 minutes incremental**, not the 23 minutes this
file used to claim for a cold one; `assembleRelease` needs no `prebuild` and
autolinks `modules/macha-codecs` on its own.

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

### What today changed, in one line each

- **The codec claim is measured, not asserted.** `modules/macha-codecs` asks
  `MediaCodecList`; `videoCodecs`, `audioCodecs`, `videoBitDepth`, `hdr` and
  `dolbyVision` all derive from it, and the HLS delivery lists are the decode
  lists. Two films that played silently now have sound.
- **The bar no longer resets to zero** on a transformed generation.
- **A mode switch we caused no longer triggers a failover** it cannot win.
- **A refused mode switch reaches the viewer**, in a sentence rather than
  core's nested envelopes.
- **Remux asks for a transform the device can play**, and renames the mode
  when it cannot copy the audio.
- **A session granted no roles is told to sign in**, not to find an
  administrator.
- **`busy` is no longer stranded**, which had disabled Play until restart.

### Open, in the order worth taking them

1. **The supersede guard swallows a fatal error.** When it declines a failover
   it returns "handled", so nothing sets `failed` and the viewer gets a black
   screen with no message. Seen on the A85. The shape of the fix is to let the
   decline stand but still report if playback has not resumed inside
   `seekDeadlineMs`. **This is the most user-visible thing still open.**
2. **The smoke test is three titles deep**, not ten. It kept losing its footing
   — see the driving rule above.
3. **Take core's `playbackFailureDetail`** and delete the prefix-stripping loop
   in `policy.ts`, which pattern-matches on core's wording and will break
   silently when a prefix is reworded. `undefined` means write our own
   sentence, not fall back to `.message`.
4. **The session-persistence seam**, for orphans surviving process death.
   Core's `stop` and `sessionAlive` now recover provenance from the id, so an
   orphan can be asked about before it is closed. Take the television's shape
   rather than inventing a second. **Read `docs/resolver-direct.md` in core
   first** — it is the contract for hosts driving the resolver without a
   coordinator, written partly from this client's case, and it is unread here.
5. **Zulu.** Tom's ruling: display local *with the zone labelled*, Zulu for
   anything interchanged — logs, bug reports, anything read beside a node
   journal. This client renders server times device-local and is the device
   most likely to be in a different zone from its node.
6. **544 MPEG-4 Part 2 files, 15% of the library, and this client claims no
   `mpeg4`** while the A85 lists a `video/mp4v-es` decoder. Check the
   containers first — `avi` is not claimed.
7. **AV1 ten-bit SDR is unverified.** The claim rests on `Main10HDR10` being
   advertised while plain `Main10` is not. Force Direct play on *The Cannonball
   Run* to settle it.

### The habit that paid, and the one that did not

**Five claims were retracted today and every one was caught by opening the
file** — not by argument, and not by anybody's confidence. The `delay_moov`
mechanism, a codec census read mid-write, "remux is broken", a recommendation
built on an unverifiable hardware claim, and a causal story of mine about
which objection was transcoding ten-bit HEVC. They are struck through in place
rather than deleted, because the retraction is the useful part.

**Inherited claims are still the main hazard here, and relayed ones lose their
cost on the way.** "One `pm clear` and a login" is a complete instruction that
says nothing about 539 MB of downloads. Whoever relays is the last person who
can attach the price.

### How core arrives, and the one rule about it

**Tom's rule, 2026-09-20, which overrides the 2026-09-15 "registry only"
decision recorded in earlier versions of this file:** development on `develop`
uses `"@machafoundation/core": "file:../macha-ts"` so this client and core move
in parallel; a release on `main` pins the **published** package. A `file:`
dependency must never reach `main`. Core's own `TODO/ACTIVE.md` records the
same ruling for all four clients the same day.

So today `package.json` says `file:../macha-ts`, `node_modules/@machafoundation/core`
is a symlink, the lockfile records `{"resolved": "../macha-ts", "link": true}`,
and `metro.config.js` names `../macha-ts` in `watchFolders` again because npm
materialises a `file:` dependency as a symlink out of the project and Metro
only watches the project directory.

**What `../macha-ts` is:** core's `develop`. As of 2026-09-20 it is `0.14.0`
plus 32 unpublished commits, and its `dist/` — which is what actually resolves
— was rebuilt at 22:06 that evening. `dist` is built, not committed, so it can
lag its own `src`; rebuild core before trusting a typecheck, and grep `dist`
for the symbol you are about to use rather than reading core's `src`.

**Releasing, in order, and none of it optional:**

0. **`npm install` will not undo the link, and this cost a cycle on
   2026-09-21.** Editing `package.json` to the published range and running
   `npm install` left the symlink in place; so did deleting
   `node_modules/@machafoundation` first — npm rebuilt the link from the stale
   lockfile entry both times. Throughout,
   `require('@machafoundation/core/package.json').version` read `0.14.0` and
   agreed with itself, because core's `develop` carries that version too. Only
   an explicit `npm install @machafoundation/core@^x.y.z` rewrote the lockfile
   entry to a registry tarball URL. The reverse is not symmetrical: going back
   to `file:../macha-ts` works with a plain `npm install`.

   **Core sent different advice a few hours later and it disagrees with this
   measurement.** Via the Android TV session: that `npm install` keeps the link
   "because the linked checkout's version satisfies the range so npm does
   nothing", and that the procedure is remove the directory, `npm uninstall`,
   then the ranged install. But step 2 above deleted the directory and npm
   **recreated the link anyway**, which a satisfied range cannot explain -
   the lockfile entry survives the delete and is what npm restores from - and
   no `npm uninstall` was needed here. Measured on npm 11.9.0 / node 24.14.0,
   one machine, one direction. Both accounts agree on the part that matters:
   **read `resolved` in the lockfile, never `package.json` and never the
   version string.** Unresolved. **Put to the television session directly on
   2026-09-21**, rather than back through core - a disagreement about a
   measurement should not travel through the relay that carried it, which is
   how a claim picks up a second name without picking up any evidence. Asked
   whether they actually ran the delete-then-plain-install case or inferred it
   from the version-range explanation; if they ran it and npm left the link
   alone, something differs between the two setups (npm version,
   `lockfileVersion`, workspaces, an `overrides` block) and both of us want to
   know which. Awaiting their answer.

   **Confirmed again on 2026-09-21 releasing 0.8.0, same machine, npm 11.9.0 /
   node 24.14.0.** Going to the registry, `npm install
   @machafoundation/core@^0.18.0` replaced the symlink with a real directory
   and rewrote the lockfile entry to a tarball URL with an integrity hash in
   one step. Coming back, editing `package.json` to `file:../macha-ts` and
   running a plain `npm install` restored the link and the
   `{"resolved": "../macha-ts", "link": true}` entry. **The asymmetry is
   real and reproducible: the ranged install is needed outbound, nothing
   special is needed inbound.** This still does not settle the television's
   account, which was about the delete-then-plain-install case specifically —
   that case was not re-run here, so their claim remains untested rather than
   refuted.
1. Confirm the core version you are about to pin is **actually on npm**:
   `npm view @machafoundation/core version time --json`. Three core versions
   (0.9.0, 0.10.0, 0.11.0) were tagged and never published, and one publish
   was announced complete after failing `EOTP`. An absent version with an
   unmoved `time.modified` did not happen; with a moved one it is still
   propagating.
2. `package.json` to that published `^x.y.z` and `npm install` — not a
   lockfile edit.
3. `test -L node_modules/@machafoundation/core` must **fail**, and the lockfile
   `resolved` must be a registry URL. A version string agrees while a stale
   link is in place; those two checks cannot lie.
4. `npm run version:check`, typecheck, tests, and a real `expo export`,
   against the registry copy. vitest stubs `react-native` and never runs
   Metro, so a green suite proves nothing about bundler resolution.
5. Prebuild, build, tag, merge. Then hand Tom the push command.

`npm run version:check` refuses a `file:` or `link:` dependency on a tagged
commit or on `main`, compares the lockfile's own version, and compares the
generated `android/app/build.gradle` when one exists. It fires on the working
tree right now only because HEAD still carries the 0.6.0 tag; the first commit
on `develop` clears that.

**What a build contains is answerable again, but only if you write it down.**
Under the link an APK carries whatever `../macha-ts/dist` held when Gradle ran.
Record `git -C ../macha-ts rev-parse --short HEAD` and a hash of every
`dist/**/*.js` (sorted, hashed again — `dist/index.js` alone is the barrel and
is invariant under every implementation change) beside any device measurement.

### What is verified on hardware, which is the useful half of knowing

Measured on the A85 against the live cluster: the node-address rows, the media
access gate and its header warning, the access-aware empty copy, Continue
Watching filtering, seek repositioning, a wrong password, a **successful**
login, sign-in surviving a force-stop, and the 2026-09-16 run recorded in
COMPLETED (cold start, throughput abstaining, catalogue sizes). **Never used
by a person:** the QR scanner. **Never run on hardware at all:** the gate's
`no-session` branch, which needs `allow_anonymous` off to reach, and the
node-row paste path, which `adb shell input text` cannot emulate.

**`ReactNativeJS` logs reach `logcat` from a release build.** `adb logcat |
grep ReactNativeJS` shows core's routing, health and registry logs live. It is
the cheapest instrument this client has.

### Devices

Deploy with `adb install -r android/app/build/outputs/apk/release/app-release.apk`
after `npx expo prebuild --platform android` and a Gradle `assembleRelease`.
**Do not skip prebuild after a version bump** — see above.

- **Blackview A85**, serial `A85EEA0000005410`, Android 12. Has **0.7.0**
  (versionCode 700) as of 2026-09-21; it was on 0.6.0 the day before.
  Wireless debugging was at `10.35.1.164:41931` on 2026-09-21, and the first
  `adb connect` timed out while the second succeeded — retry once before
  concluding it is off. It has **both** a remote TLS
  cluster (`https://macnessa.macha.network`, `ramaroja`) and a **LAN node at
  `10.35.1.50`** configured, and on the smoke test playback went to the LAN
  node while the catalogue came from `macnessa`. **The LAN is `10.35.1.x`
  now**, not the `10.44.1.x` this file used to give.
  **It connects over wireless debugging, not USB**: `adb mdns services` lists
  it as `_adb-tls-connect._tcp`, then `adb connect <host>:<port>`. The port
  changes, and it drops whenever the phone sleeps — a screenshot of a sleeping
  phone is solid black, so check `dumpsys power` for `mWakefulness` and send
  `KEYCODE_WAKEUP` plus `wm dismiss-keyguard` before believing a blank capture.
- **Samsung SM-G996B** (Galaxy S21+), serial `RFCRA0JJN6B`, Android 15. Has
  **0.4.0** and **no endpoints configured**, so it opens on the connect screen
  — the right device for first-run and QR in one pass.
- **The Smart_TV that answers ADB is not a test target.** Verify
  `ro.product.model` before any install; it is often attached alongside the
  phone.

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

## What core 0.13.0 and 0.14.0 changed, read from the published tarballs

**The live cluster is on server `0.47.0`, measured 2026-09-20** at
`http://10.35.1.50:7438/api/v1/health` — not the `0.40.0` recorded here since
2026-09-16. That is **past every server floor core 0.14.0 needs**: 0.45.0 for
`look_ahead_ms`, 0.46.0 for `seekOffsetMs`, 0.46.2 for the node budgets. Two
items below that were written as latent are therefore live and testable today.
**Read the node's version before calling any 0.14.0 feature dormant.**

**How to typecheck against a core version without installing it**, since the
scratchpad this was done in does not survive a session: `npm pack
@machafoundation/core@<version>`, untar it, and point a `tsconfig` that
extends this repo's at the unpacked `dist` through `compilerOptions.paths`,
for both `@machafoundation/core` and `@machafoundation/core/*`. Add
`"ignoreDeprecations": "6.0"` beside `baseUrl` or TypeScript 6 refuses it, and
confirm the mapping took with `--traceResolution` — a `paths` miss falls back
to `node_modules` silently, and you typecheck the version you already had.

Both tarballs were unpacked and their `dist` diffed against the installed
0.12.0 and against `../macha-ts/dist`, and this client's `src` was typechecked
against each. **Typecheck is clean against 0.14.0 and against core's current
`develop`; all 100 tests pass on the link.** Storage keys are identical across
0.12.0, 0.14.0 and `develop`, so `OWNED_KEY_PREFIXES` needs nothing.

| Change | Version | Reaches this client? |
|---|---|---|
| `PlaybackFailureKind` gains `not-found`; `playbackFailureKindForStatus(404)` no longer says `stream` | 0.13.0 | Not directly — expo-video hides the status. See the P1 below for what does. |
| `ClusterPlaybackResolver.sessionAlive(id)` and `regenerate(...)` | 0.13.0 | **Yes**, and this client should call them. P1. |
| `docs/principles-and-laws.md` exists for the first time | 0.13.0 | Read it before touching playback. |
| Node budgets: `/api/v1/status` `playback.{startup,segment}_timeout_ms` → `EndpointRegistry.recordPlaybackBudgets` → `PlaybackSource.budgets {deadlineMs, segmentHoldMs}` | 0.14.0 | **Yes, mostly free.** The health monitor records them and the resolver derives its per-endpoint attempt deadline from them without being asked. `session.source.budgets` arrives on every session. Only reaches a session that has `view_status`, because that is the route they ride. |
| `PlaybackSession.seekOffsetMs` / `seekRequestedMs` (server ≥ 0.46.0) | 0.14.0 | **Yes.** P2 below. |
| `PlaybackSession.lookAheadMs` (server ≥ 0.45.0) | 0.13.0 | Not used here; the coordinator's replacement lead needs it, this client does not build one. |
| `Player.play(..., transition: 'continue' \| 'relocate')` | 0.14.0 | No — this client does not implement core's `Player`. The distinction it draws is one this client already cannot honour: every source swap here is a visible reload. |
| `MediaStallWatchdog.useSourceBudgets`, `mediaStallTimeoutMs(source)` | 0.14.0 | Only if stall detection is ever wired (P2). |
| `SERVER_SESSION_IDLE_MS`, `SERVER_STARTUP_TIMEOUT_MS`, `SEGMENT_NOT_READY_STATUS`, `BROKEN_GENERATION_STATUS`, `SOURCE_NOT_FOUND_STATUS` exported | 0.14.0 | Import rather than restate. This client's `SEEK_DEADLINE_MS` is the one private copy left — P1. |
| `PlaybackCoordinator` recovery-chain error, `REPLACEMENT_LEAD_TIME_MS`, runway arithmetic | 0.13.0–0.14.0 | No — coordinator only. |

**On `develop` and unpublished** (signatures read from `../macha-ts/dist`,
not from core's `src`): `SessionManager` gains a lifecycle generation and an
`abandoned` set ("stop lending a dead token"); `ClusterEndpointRouter.request`
gains an `advisory` option and `find` an `onAbsence` callback;
`discoverClusterEndpoints` takes a signal; `PlaybackCoordinator` reports
`performedMode`/`modeHonoured`; `ClusterPlaybackResolver.failover` restates
the chooser's transforms itself (`withRestatedTransforms`). None of it
changes a signature this client calls, and none of it is the mint-failed
window fix — core re-verified on `develop` the same day that `fetch` still
hands back a bare 401 after a failed mint.

**Core's own summary arrived 2026-09-20, disagreed on one row, and withdrew
it when shown the declarations.** It says nothing in 0.13.0 reaches a host that calls the
resolver directly, and lists `regenerate` in the same message as a resolver
method `withServedSegmentContainer` applies to. Both `sessionAlive` and
`regenerate` are public on `ClusterPlaybackResolver` in the 0.13.0 tarball
(`dist/playback/ClusterPlaybackResolver.d.ts`), and the fault they fix — a
player error after a reaped session charged to the node — is reached here
through `failoverSource`. Core accepted the correction the same evening and
supplied the recovery sequence that goes with it, which is in the P1 below
and is not derivable from the type declarations. The rest of the reply — budgets,
constants, storage keys unchanged, `probeNow` living on the monitor rather
than the manager, the mint-failed window still open and core's — matched
what the tarballs say.

**Core's one claim to check, checked:** it asked whether a configured
endpoint survives a force-quit here, because `MachaClientConfiguration` used
to capture the memory-storage fallback at module scope. This client never
constructs `MachaClientConfiguration` or calls `createMachaServices` (one
mention in `src`, a comment); endpoints are read and written through
`clientStore` directly (`state/connection.ts`). And the 2026-09-16 A85 run
cold-started to the full library on 0.12.0, which needs the stored endpoint.
Answered as such, with the caveat that it was 0.12.0 and a release build,
not the link.

---

## A session granted nothing now says so, 2026-09-21

**Tom's instruction to all three clients.** It was prompted by a television
reporting that a clean install signed in and landed locked — `403` *"this
action requires the 'media_viewer' role"*, reproduced twice — and **that
observation was retracted the same evening**: the television had not verified
which control it pressed, the locked screen is reachable from the login
screen's own Server settings button, and an anonymous role-less session is
also exactly what exists *before* signing in, so its `403` is equally
consistent with the sign-in never having happened. Its own `adb input text`
had dropped a username field on a later attempt.

**The instruction stands and so does the change, on reasoning rather than on
that evidence.** Core's mint path is correct, but every `401` is answered by a
**credential-less re-mint**, and where the anonymous account holds no roles
that would silently degrade a signed-in viewer to nothing. Core proposed
refusing the downgrade and Tom rejected it — core does not judge, and where it
happens it is the client's to explain. **Recorded this way deliberately:** the
mechanism is real and documented in core, the field report is not evidence,
and the two must not be quoted as if they were one thing.

**Most of this was already right here.** `describeMediaAccess` has carried the
three-state gate — `unknown` / `granted` / `denied` — since it was written, and
gates on a fetched whoami rather than on `SessionManager.roles`, so the
`undefined`-is-not-`[]` trap core warns about cannot arise: `CurrentSession.roles`
is always an array. The viewer already got a plain sentence rather than a
locked app.

**What was wrong was the advice.** An empty role array produced
`account-cannot-view` — *"Ask for the media viewer role, or log in as someone
who has it"* — which is right for an account configured for something else and
wrong for this case. A session granted **nothing** means either a
registered-users-only deployment (removing `media_viewer` from the anonymous
account is how that is configured, server 0.38.4) or a signed-in viewer
degraded by the re-mint. **Both are answered by signing in.** Told to ask an
administrator, a viewer whose session merely lapsed goes looking for the wrong
person.

**So `no-roles` is now a denial reason of its own**, decided with core's
`sessionLockedOut` rather than by testing the array — the helper is what keeps
`undefined` out of it if the shape ever changes — and it maps to a new problem:
*"This session cannot do anything. Log in again to see the library — this
session was granted no permissions. Your downloads still play."*

One existing test asserted `no-role` for an empty array. It was changed rather
than deleted, with the reason in place. Suite 169 → 172.

**The clean-install reproduction on the A85 was asked for and is now
withdrawn.** It would have cost **29 downloads and 539 MB**, the cluster
configuration and the signed-in session on Tom's own phone, with no way for
this session to sign it back in. Both this client and the television declined
it; core then withdrew it outright when the finding it was meant to test was
retracted, leaving nothing on either side of the comparison. **Nobody acted, so
there is nothing to restore** — recorded because the near miss is the useful
part: a relayed request arrives as "one `pm clear` and a login", which is a
complete instruction that says nothing about 539 MB, and the relaying session
is the last one able to attach the price.

---

## The capability audit, 2026-09-21 — what is measured and what is still asserted

**Tom's question: what else does this client hardcode about the device?**
Answer, after wiring in everything the probe can reach.

**Measured now** (`modules/macha-codecs` + `codecProbe.ts`): `videoCodecs`,
`audioCodecs`, `videoBitDepth`, `hdr`, `dolbyVision`, and the HLS delivery
lists, which are now the decode lists rather than a narrower assertion.

**`hdr` is intersected with the panel, which is the television client's
design** and better than the decoder-only version this started as. Decode says
what can be read, `Display.HdrCapabilities` says what can be shown, and only
both together is a claim; a panel that does not answer is *unknown*, not
consent. **Verified on the A85: `displayHdr: []`** — an SDR panel — so nothing
is claimed, which is what the old comment concluded. It had the right answer
in the wrong field: a panel argument applied to a decode capability, which
also transcoded every HDR title on every device.

**`dolbyVision` was never declared at all**, which core reads as `?? []`, so
every DV stream objected because nobody had written a line. The A85 lists no
`video/dolby-vision`, so `[]` is now the same value as a measurement.

### Still asserted, and the honest split

- **`containers`** — a fixed list. `MediaCodecList` says nothing about
  containers; ExoPlayer's extractors are fixed at build time. *Asserted with
  reasoning.* **And it is missing `avi`**, which the television claims.
- **`hlsFmp4`, `hlsTs`** — unconditional. *Asserted with reasoning* (they are
  media3 facts), never checked against the media3 version actually linked.
- **`dash: true`** — *inherited without reasoning*, and **dead**: core reads
  `capabilities.dash` nowhere.
- **The whole iOS and web branches** — asserted end to end, no probe, no
  device. iOS `videoBitDepth: 8` is very likely wrong, since iPhones decode
  ten-bit HEVC.

### What the complete census decided, including one thing not to build

The server's first census was withdrawn (read mid-scan). The complete run:
**3,553 files — hevc 2,054 of which 1,872 are `yuv420p10le`, h264 954,
mpeg4 544, av1 1.** Negatives now safe from a finished scan: **no VP9, no VP8,
no MPEG-2**, so this client's `vp9` claim is never exercised.

**The Cannonball Run is `yuv420p10le`**, which confirms the AV1 diagnosis
exactly: ten-bit against `videoBitDepth: 8` trips
`video-bit-depth-exceeds-client`, which is why the chooser transcoded despite
`av1` reaching the wire.

~~**And it decides the per-codec bit-depth question in the negative.** A
per-codec depth would let that one film direct-play and would not touch the
1,872 ten-bit HEVC files, which this phone genuinely cannot decode. Do not
build per-codec bit depth.~~

**Withdrawn the same evening, by the session that made it and then by Tom.**
The server session retracted the recommendation on the grounds that it was a
design decision about this client made on the strength of a hardware claim it
could not verify — capability is the client's to establish. **And Tom says the
phone does decode ten-bit**, which contradicts the premise outright.

**Unresolved, and it is the largest open question here.** What this client can
read says no: *both* HEVC decoders on the A85 — hardware
`c2.unisoc.hevc.decoder` and software `c2.android.hevc.decoder` — advertise
`Main` and `MainStill` only, no `Main10`, checked twice and not truncated.
That is what governs media3's decoder selection. But "`MediaCodecList` does
not advertise it" and "the device cannot do it" are different statements, and
another app bundling its own software decoder would decode a ten-bit file
happily while proving nothing about ExoPlayer.

**Settled on hardware, 2026-09-21 20:40: the phone cannot decode ten-bit
HEVC.** *Trigger Warning* (2024) — Matroska, HEVC 1080p, `yuv420p10le`,
EAC3 5.1 — played naturally as `{video: transcode, audio: transcode}`. Forcing
**Direct play** from the options sheet sent `{mode: direct, video: copy, audio:
copy}`, the node served `/direct`, and the player failed:

    state=7 (ERROR)  error=MediaCodecVideoRenderer error

Which is exactly what `MediaCodecList` said. **So the device cannot decode
ten-bit HEVC** — that half is a direct observation and stands.

**The other half does not, and it was inference dressed as a result.** Saying
`videoBitDepth: 8` is *what causes* those transcodes assumes the bit-depth
objection fired, and nothing here shows that it did: *Trigger Warning*'s audio
is EAC3 5.1, which this client does not claim, and **the audio alone refuses
direct play**. Two sufficient causes, one observation, and I attributed it to
the one I was investigating.

**There is a way for the mechanism to be doing nothing at all.** Core gates on
`stream.bitDepth !== undefined` and parses it as `stream.bit_depth ||
undefined`, so **zero or absent disables the check silently**. The server
takes `bits_per_raw_sample` first (`media_engine.cpp:1660`), which is commonly
`0` on HEVC, before falling back to the pixel-format descriptor. If that
fallback does not run, `videoBitDepth` has never objected to anything on this
client and every transcode blamed on it has another cause.

**Tested, 2026-09-21 20:45 — the video gate is live, not inert.**
*The Running Man* (2025): MP4, HEVC 800p `yuv420p10le`, **AAC 5.1**. Played
naturally and core chose:

    { mode: transcode, video: transcode, audio: copy }

**The audio was copied.** So AAC is accepted, the container is accepted, and
the objection is specifically about the *video* stream — which is exactly the
ambiguity *Trigger Warning* could not resolve, because its EAC3 refused direct
play on its own.

**And the server answered the inertness worry directly:** for these files
`bits_per_raw_sample` is absent, the guard at `media_engine.cpp:1661` fires,
and `desc->comp[0].depth` for `yuv420p10le` yields **10**. The comment there
names this exact case, dated 2026-09-07. *Their caveat, kept: that is derived
from the code path and the file's properties, not from an observed API
response — they cannot read the facts endpoint without a bearer token.*

**Separated, and the chain is proven end to end.** *The Running Man*'s video
stream is `color_space`, `color_transfer` and `color_primaries` all `bt709`,
with no Dolby Vision side data and `profile = Main 10` stated by the encoder
itself. So the transfer objection had nothing to object to, audio and
container were both accepted, and **the only remaining objection is bit
depth**. `videoBitDepth` is doing real work, and the ten-bit HEVC transcodes
are both caused by it and correct.

Two things to keep beside that: `bits_per_raw_sample` is absent on this MP4
too, so the value reaches the client by the same `pix_fmt` fallback as the
Matroska titles; and the whole derivation is the server's code path plus the
file's properties rather than an observed API response, which is their caveat
and worth keeping.

**The Opus delivery widening paid off in the same run.** *The Cannonball Run*
now plans `{video: transcode, audio: copy}` where earlier tonight the same
title planned `{video: transcode, audio: transcode}`. Widening
`hlsAudioCodecs` to the decode list stopped a needless audio re-encode on a
transformed title — measured, not argued.

**Still open: whether this device decodes ten-bit *SDR* AV1.** The claim rests
on `Main10HDR10` and `Main10HDRPlus` being advertised while plain
`AV1ProfileMain10` is not. The test is the one that worked above — force
**Direct play** on *The Cannonball Run*, which is AV1 `yuv420p10le` with Opus
audio this device decodes, so only the video question remains. **Not done:
three attempts to open the playback options sheet failed** (the chrome does
not auto-hide while paused, so a "reveal" tap dismisses it, and the layers
icon then eats the next tap). Whoever picks this up should tap the icon
directly with the chrome already visible, and verify the sheet opened before
tapping a row.

**A second thing that may be lying, on our side.** The A85's AV1 decoder
reports profiles `[1, 4096, 8192]` — `Main8`, `Main10HDR10`, `Main10HDRPlus` —
and **plain `AV1ProfileMain10` (2) is absent**. `TEN_BIT_PROFILES` reads the
two HDR10 entries as evidence of ten-bit decode, which is the usual reading
since HDR10 *is* Main10 plus metadata. But *The Cannonball Run* is
`yuv420p10le` and almost certainly SDR, so the claim rests on an inference
about what an HDR10-only profile list implies for SDR ten-bit content.
**Unverified, and it is the same shape of assumption this file keeps
catching.**

**Both positions were true of different codecs, which is why they disagreed.**
This phone *does* decode ten-bit AV1 — `Main10HDR10`, `Main10HDRPlus` — and
does *not* decode ten-bit HEVC. "The phone can decode 10-bit" and "the HEVC
decoder is Main only" are both correct, and the per-codec gap in
`PlaybackCapabilities` is precisely what made them look like a contradiction.
The controlled test cost one forced mode switch and no code change.

### The same run found a defect introduced today, and it is mine

The forced switch set `pendingSupersedeRef`, so when the renderer failed the
new guard did its job and logged
`failover-declined { reason: 'generation-superseded-by-us' }`. **But the error
was fatal and had nothing to do with supersession** — an unsupported codec on
the *new* source, not a stale fragment from the old one.

`failoverSource` returns `true` for "handled", so nothing set `status:
'failed'`, nothing rendered, and **the viewer was left on a black screen at
`0:33` with a play button and no message of any kind.** A silent failure —
exactly the class this whole day was spent removing, introduced by the fix for
another one.

**The guard suppresses the wrong remedy and must not also suppress the
report.** Declining to fail over cannot mean pretending nothing happened. The
shape of the fix is to let the decline stand while still surfacing a failure
when playback does not resume within the deadline the guard already uses —
`seekDeadlineMs`, no new constant. **Not built: it is a behaviour change on
the failover path and wants Tom's call, like the guard itself did.**

**Worth someone's attention: 544 MPEG-4 Part 2 files, 15% of the library, and
this client claims no `mpeg4` at all** — while the A85 lists a `video/mp4v-es`
decoder. That is 544 titles transcoding against one for AV1. Two things to
check before claiming it: whether those files are in containers this client
advertises (`avi` is not among them), and that software decode at those
resolutions is acceptable. **Not done.**

---

## `videoBitDepth` is derived now too, 2026-09-21 — and the AV1 case that found it

**`videoBitDepth: 8` was hardcoded in the `0.2.0` commit (`7ac448f`,
2026-09-07) with no comment defending it** — the comment above it is about
HDR. It is the same unevidenced assertion as the `ac3`/`eac3` claim and it has
gated every playback decision since, through core's `videoStreamObjection`:

    if (stream.bitDepth !== undefined && capabilities.videoBitDepth !== undefined
        && stream.bitDepth > capabilities.videoBitDepth) return 'video-bit-depth-exceeds-client';

**What the A85 actually reports**, read from the app rather than from dumpsys
now that the probe returns profile ids: `av1: [1, 4096, 8192]` — `Main8`,
`Main10HDR10`, `Main10HDRPlus` — and `hevc: [1, 4]` — `Main`, `MainStill`.
H.264 has no `High10`. **So this device decodes ten-bit AV1 and eight-bit
HEVC, and one global number cannot say that.**

**The global claim must therefore be the minimum, not the maximum**, because
core compares every source stream against the single number: claiming ten
would direct-play a ten-bit HEVC file to a decoder that only does eight. On
this device the derived answer is `8` — the same value that was asserted, now
true by measurement, and **automatically right on a phone whose HEVC does
`Main10`**, which is where the value is: that library is HEVC-heavy.

The module now returns **MIME type to profile ids**, raw. Profiles are
codec-specific and the numbers collide — `2` is `AV1ProfileMain10` *and*
`HEVCProfileMain10`, `16` is `AVCProfileHigh10` — so the table is keyed by
MIME and lives in `codecProbe.ts`, values taken from
`MediaCodecInfo$CodecProfileLevel` via `javap` on `android-37/android.jar`.
Nothing is interpreted in Kotlin.

**Verified on the A85, 20:16.** *Aquaman* (MP4, 1080p, H.264, AAC) planned
`{ video: 'copy', audio: 'copy' }` on `/direct` and played with sound, so the
derived depth does not break the ordinary case. Suite 189 → 195.

### The AV1 title, which is where this started and is not finished

*The Cannonball Run* is the one AV1 title. With `av1` added to the declared
list the client sent `videoCodecs: 'h264, hevc, vp9, av1'` — verified on the
wire — and core still chose `{mode: transcode, video: transcode, audio:
transcode}`, **from `From start`, so a live decision rather than a remembered
preference**. Bit depth is the likely objection and the file's `bitDepth` has
been asked for and not yet answered. **Do not record the AV1 widening as
demonstrated until it is.**

### Two retractions, and they are the fourth and fifth of the day

**The codec census is withdrawn by the server**, who read the output file
while the scan was still writing to it. The counts (1,514 files; 1,094 hevc)
were roughly half the real figures. **What survives is only the AV1 title**,
which came from a targeted filename probe rather than the census.

**So "no VP9, no VP8, no MPEG-2 in the library" is retracted** — a negative
drawn from an incomplete scan, which is precisely the claim that cannot be
made from one. **This file said it and so did I, to Tom, twice.** Treat the
VP9 declaration as *unknown* rather than as untested-because-absent. A re-run
giving codec and `pix_fmt` per file is in progress and will answer the
ten-bit population at the same time.

*Aquaman* was suggested as a possible VP9 title and is **MP4, 1080p, H.264,
AAC stereo** — so it does not settle it either way.

---

## The codec claim is now a measurement, 2026-09-21 — `modules/macha-codecs`

**A local Expo module that asks `MediaCodecList` what this device decodes**,
replacing a list that asserted it. Tom's call, after the stopgap earlier the
same day deleted `ac3`/`eac3` outright.

**Why the stopgap was not the end of it.** Deleting the claims fixed the A85
and wronged every device that *does* have a Dolby decoder: it would pay for a
transform it never needed, on a claim that was no better evidenced than the
one it replaced. Asking is the only version of this that is right on both
devices.

**Built with the Expo Modules API** (`npx create-expo-module --local`, v57
docs read first as this repo requires), Android-only, `Function` returning
decoder MIME types from `MediaCodecList(REGULAR_CODECS)` — `REGULAR_CODECS`
rather than `ALL_CODECS` because it is the set the framework selects from and
therefore what media3's `MediaCodecUtil` consults. **No `expo prebuild` was
needed**: autolinking found it at Gradle configure time, 737 tasks to 778.

**The mapping and the policy are TypeScript, not Kotlin** (`codecProbe.ts`), so
they are testable without a device. The native side returns raw MIME types and
decides nothing.

### Two decisions worth keeping

**The probe only ever narrows a declared list.** A decoder existing is not
sufficient grounds to claim a codec — the declared lists also carry container
and delivery constraints (fMP4 HLS carries far less than the progressive
extractors) and none of that is visible to `MediaCodecList`. So the probe can
remove a false claim and never add one.

**`ac3` and `eac3` are probe-gated, and that asymmetry is deliberate.** Every
other codec keeps its declaration when the probe cannot answer, because the
cost of being wrong is a transform someone notices. For these two the cost of
being wrong is the measured one: picture fine, **no audio, no error anywhere**.
A failure nobody can see earns more caution than one somebody pays for — so
they default to absent and must be confirmed. **If this module is ever dropped
from a build, the client falls back to the safe behaviour rather than
regressing to silence.**

### Verified on the A85, 18:56

`[macha] [playback] codec-probe { available: true, decoders: 20, dolby: [] }`
— the module loaded, the platform reported twenty decoder MIME types, and
**none of them is `audio/ac3`, `audio/eac3` or `audio/eac3-joc`**. The
capabilities then sent `aac, opus, vorbis, mp3, flac`, *2010* was planned as
`video: copy, audio: transcode` and played with sound. **That independently
confirms the `dumpsys media.player` reading from this morning, this time from
inside the app.** Logged once and memoised — decoders do not change while the
process lives, and the log exists because "asked and told no" and "never
asked" were previously indistinguishable from outside, which is what made the
silent-audio fault take a day to find.

Suite 161 → 169. The probe is aliased to a stub under vitest, the same way
`react-native` and AsyncStorage are, because it is an environment fact and
there is no device in a logic suite; `codecProbe.test.ts` covers both branches
directly.

---

## P0 2026-09-21: "remux is broken" was wrong — copying (E-)AC-3 into fMP4 stalls

**Raised as a P0 off this client's report and narrowed by three clients in
about twenty minutes.** The headline correction is to something this session
said: *remux is fine*. All four of this client's failures were AC3/EAC3 titles,
which is why it looked like a mode fault and like two bad nodes.

**The controlled comparison, mobile, same node (`10.35.1.50:7438`), same PATCH
path, minutes apart:**

| Title | Audio | `{mode: remux, video: copy, audio: copy}` |
|---|---|---|
| 2001: A Space Odyssey | AAC | **succeeds** — generation 2, playing, zero errors |
| 2010 | AC3 5.1 | 503 `playback_pipeline_start_failed` |
| Avatar: Fire and Ash | EAC3 5.1 | 503 `playback_pipeline_start_failed` |

**Corroborated independently.** The web client got the same split on the same
node from a different codebase — AAC audio-copy remux played; AC-3 gave
`readyState 0` and fatal HLS errors at ~59 s with no picture. The television
client likewise: AAC 5.1 remux copied and had its first fragment ~100 ms after
`generation-update-ready`; AC-3 failed at `elapsedMs 15051` against that node's
advertised `startup_timeout_ms: 15000`. **Their six earlier "remux successes"
were all `video copy + audio TRANSCODE`, which never touched this path** — the
server declines to copy AC-3 automatically, so getting a copy attempted at all
took a deliberate override.

**Mechanism, from the server session via core.** `delay_moov` is set on every
fMP4 output (`media_engine.cpp:1357-1366`); the (E-)AC-3 sample entry needs a
`dac3`/`dec3` box the muxer can only fill from a parsed packet; a copy path
never parses one, so `moov` is never written, the init segment never appears,
and `wait_ready(startup_timeout)` returns false with the pipeline alive and no
error — exactly `playback.cpp:1578`, which is a **stall, not a mux rejection**.

**One wrinkle, checked here and not yet answered.** The code says the opposite
of the summary: the comment at `media_engine.cpp:1358` states `delay_moov` is
"what makes an AC-3 or E-AC-3 stream copyable into fMP4 at all", and
`media_containers.cpp:93-96` records it as the 2026-09-07 *fix* for header
writes that failed "Invalid argument". So either this regressed since, or the
mechanism is subtler than "no parse step ever happens". **Do not record
`delay_moov` as the cause until that is reconciled** — it is currently a
plausible mechanism fitting the symptom, which is the thing this file keeps
warning about.

**A confound that touches this client's evidence specifically.** The TV found
that a **stale session for the same media on the same node** produces this
identical 503 with no AC-3 and no copy anywhere in the plan, and that deleting
the orphan made the same title play. **This client reinstalled the app four
times today, twice with a session playing** — a force-stop by another name and
exactly the orphan generator they describe. So the original four failures are
not clean evidence. The AAC-versus-AC-3 comparison above is, because it is
controlled and three clients reproduced it.

### Ours in it, and it is not a workaround for the server's fault

**`transformFor` asked the node to copy audio this device cannot decode.** It
returned `audio: 'copy'` for anything that was not `transcode`, with no
reference to `deviceCapabilities()`. On an AC-3 title the phone therefore
demanded a copy it had no decoder for — **the same defect as the `ac3`/`eac3`
capability claim fixed earlier today, one layer up**, and the node picks
`video: copy, audio: transcode` for those titles on create precisely because it
knows better. The mode switch threw that judgement away.

**Fixed:** `audioCopyable` + `sessionAudioCodec` in `policy.ts`, threaded
through all three callers — `statedUpdate`, the failover restatement in
`src/api/playback.ts`, and the viewer-named mode at create. Video is untouched;
a missing *audio* decoder is no reason to re-encode a picture. Unknown audio
answers "copyable", leaving the node in charge. Tests in `policy.test.ts`,
checked failing first; suite 148 → 160.

**Worth being clear about why this stands on its own:** served perfectly, that
copy would have been a silent film on this device. It was wrong before the
stall existed and would still be wrong if the stall were fixed tomorrow.

**The trap in the obvious fix, and it was nearly shipped here.** Correcting the
transform is not enough — **the mode has to be renamed with it**. The server
refuses `mode=remux` with any re-encoded stream (`playback.cpp:524`) and
refuses `mode=transcode` that re-encodes nothing (`:529`), both verified here.
So a Remux press that cannot copy the audio must become
**`{mode: transcode, video: copy, audio: transcode}`**, and the first version
of this fix emitted `{mode: remux, ... audio: transcode}`, which buys a `400`
in place of the stall. **The web client shipped that exact halfway fix an hour
earlier and had it refused**; core relayed it before this one reached a device.
A second trap sat behind it: `statedUpdate` spread `update.preferences` last,
which would have put the viewer's `remux` straight back over the corrected
`transcode`. TypeScript caught the duplicate key at the other two call sites;
nothing but a test caught this one.

**Verified on the A85, 18:40.** Pressing Remux on *2010* (AC3 5.1) now sends
`mode: 'transcode', video: 'copy', audio: 'transcode'`; the node accepted it,
built **generation 2** on `ramaroja`, and playback continued **with sound**
(`standby=no`, last write 20-27 ms) reading `0:44 / 1:55:55` and labelled
Transcode. The same press on the same title produced the 503 stall an hour
earlier. **Create is fixed too** — the title now starts as `video: copy,
audio: transcode` and plays with sound without anyone touching the mode.

**Also observed in that run, and it is the behaviour the cap work was for:** a
create was refused `429 resource_limit` / "audio transcode limit reached" in
84 ms and the client walked to another node and succeeded. That is the third
node-scoped refusal code seen today, after `video transcode limit reached`.

**Core has taken the gap as theirs.** `choosePlaybackInstruction.ts:399-401`
already holds this exact rule for the *automatic* path — remux when the audio
is deliverable, otherwise transcode with the video copied — and core's own
docblock says deciding from the same facts by the same rules should not be
reinvented per client. There is no entry point for a viewer-named mode, which
is why two clients wrote the table separately and both wrote it wrong on the
same day. **So neither fix is a workaround: they are clients standing in for a
function core does not expose yet.**

---

## Re-tested on the A85, 2026-09-21 17:50-18:10 — three of four fixes confirmed

**Rebuilt and reinstalled, and the fixes were driven against the live 0.48.0
cluster.** Four rebuilds in the end, because two of the four fixes were wrong
in ways only the device showed.

**1. The codec claim — confirmed, and better than feared.** With `ac3`/`eac3`
gone the client now advertises `audioCodecs: 'aac, opus, vorbis, mp3, flac'`
and the node answers **`transform: { video: 'copy', audio: 'transcode' }`** —
audio-only, video copied. *2010* (AC3 5.1) and *Avatar: Fire and Ash* (EAC3
5.1) both played **with sound**, `standby=no`, last write 13-22 ms. **The worry
that this would trade silence for no playback did not happen**: the transform
is cheap and it went to `macnessa`, not the saturated LAN node.

**2. The timeline — confirmed twice, on both paths.** *2010*, transformed,
scrubbed: the node built generation 2 at `seek_ms 3678765` and the bar read
**`1:02:35` of `1:55:55`** with the handle at 54%, where before the same action
read `0:13` with the handle at the far left. Then *Avatar: Fire and Ash*
resumed at `1:29:02` — a session **created** with a non-zero origin rather than
repositioned — and the bar read `1:30:55` of `3:17:20`. So the load path was
broken the same way and is fixed by the same conversion.

**A measurement trap worth recording: `dumpsys media_session` cannot see this
fix.** It reports the *player's* position, which is generation-local by
definition, so it read `0:26` while the bar correctly read `1:02:35`. The probe
that made the rest of this testable is the wrong instrument for this one — only
a screenshot of the bar will do.

**3. The supersede guard — NOT exercised, and it must not be written up as
though it were.** A switch to Direct play succeeded and superseded generation
1; no failover fired, `failover-declined` appears zero times, and the whole log
contains two lines matching "error", both the earlier HTTP ones. **So the
player never hit a 410 at all** — the source was swapped before anything
refetched the old generation. The guard is covered by nine unit tests and its
code path is right, but **the device has not produced the failure it defends
against**. Do not claim it works on hardware.

**4. The refusal message — confirmed only after the device found three faults
in the fix itself.** In order:

- **It was never displayed.** `play.tsx` renders `error` only when
  `status === 'failed'`, and a refused switch leaves playback running, so the
  viewer tapped Remux, watched a spinner for fifteen seconds and got *nothing*.
  The wording fix had improved a string nobody could see. Fixed by a notice in
  the player chrome.
- **The detail leaked.** Core nests its envelopes — what arrives is *"Macha
  endpoint https://macnessa.macha.network failed: Macha playback request
  failed: timed out waiting..."* — and stripping one prefix left the other one
  plus a node hostname in front of the viewer. Now stripped until none remains.
- **The notice was painted over.** Placed before the chrome, the bottom bar
  drew across it and cut the fourth line in half. Paint order, not height.

**All three were invisible to the test suite and to a typecheck.** The lesson
is the one this file keeps relearning: a fix to something a viewer reads is not
done until someone has looked at it on the device.

**One thing that changes a message already sent.** The remux `503
playback_pipeline_start_failed` now has a second node: it failed on
**`macnessa`** as well as on `10.35.1.50:7438`. The caveat given to the server
session — "both attempts were on the saturated node, so this is not clean" — no
longer holds, and remux failing on two nodes is a much stronger claim.

---

## Fixed 2026-09-21, out of the A85 smoke test below

**Four client defects, all with a test that was checked failing first.** Suite
119 → 141, typecheck clean, core linked at `648474d`.

- **The false codec claim.** `capabilities.ts` no longer claims `ac3`/`eac3` on
  android; the A85 decodes neither and those titles Direct Played in silence.
  iOS keeps both, deliberately — AVFoundation decodes them and nothing has been
  measured there. `capabilities.test.ts`. **The cost is real and accepted:
  those titles now need a transform, which a device that does have an AC-3
  decoder pays for needlessly. A probe (`MediaCodecList`) is the proper fix and
  needs a native module.**
- **The two timelines.** `generationOriginMs` / `titlePositionMs` /
  `generationLocalMs` in `policy.ts` convert between the title's timeline and
  the generation's, at the two boundaries where the player's figures arrive and
  a position is written back. This client stands in for `PlaybackCoordinator`,
  which is what would normally do it — see the P2 below for why the obvious
  `seekOffsetMs` fix was the wrong one. `timeline.test.ts`.
- **The mode-switch supersession hole.** `selfSupersededGeneration` +
  `PendingSupersede`, consulted by `errorBlamesEndpoint`, so a `410` this
  client caused does not fire a failover that cannot recover. Marked by
  `applyUpdate` **and by `repositionTo`** — the rebuilding-seek path supersedes
  too, and its `PATCH` was measured at 12.5 s, which outruns the pending-seek
  guard's own deadline, so that path had a tail the seek guard did not cover.
  In flight suppresses unconditionally; the tail is bounded by the node's
  stated `seekDeadlineMs` rather than a new constant. `supersede.test.ts`.
- **The refusal message.** `updateRefusalMessage` — a refused mode switch
  leaves the film playing, so the viewer no longer reads "Macha playback
  request failed" over a working picture. The node's reason is kept as a
  detail.

**Two notes for whoever is next.** `npm run lint` is not set up here: `expo
lint` silently installed `eslint` and `eslint-config-expo` and rewrote 5,632
lines of `package-lock.json` when run. That was reverted; **do not run it
without meaning to change the manifest.** And none of these four fixes has been
seen on the device — the build on the A85 is the one from before them.

---

## Smoke test on the A85, 2026-09-21 15:00-15:30, app 0.7.0 against a live 0.48.0 cluster

**Eleven titles driven over ADB** — play, scrub, ±10, pause, stop — on the
Blackview A85 (`A85EEA0000005410`, Android 12, wireless debugging at
`10.35.1.164:41931`). Installed build: the release APK of record, `0.7.0` /
versionCode `700`, from `b6e8cbe`; `assembleRelease` re-run first and came back
`UP-TO-DATE`, so the bytes are that build. Core linked at `648474d`, `dist`
hash `8c835ad33000` (`*.js`-only, non-canonical — see the hash rule above),
typecheck clean and 119/119 green against it beforehand.

**THE HEADLINE: `0.48.0` IS ALREADY LIVE ON ALL THREE NODES.** The app's
Cluster screen reads `0.48.0 · ready` for `ramaroja`, `macnessa` and
`10.35.1.50:7438`, 3 of 3 online. So the cutover this file and core were
sequencing has happened. **Everything below is therefore a measurement against
the shipped release, not against the old contract** — and the order of record
("the nodes do not move until the second date") is now describing the past.

**The routes are the new ones and this client works on them.** Every create
went to `POST /api/v1/playback/sessions?idempotency_key=...`, every stream URL
was `/api/v1/playback/sessions/{id}/stream/{token}/direct` or
`/{generation}/master.m3u8`, and every stop produced `session-stop` →
`session-stopped`. Eleven sessions created and eleven released; no leak
observed. **The route-removal prediction recorded above was correct and is now
confirmed on hardware rather than by grep.**

### What worked

Direct play on seven titles, transcode on three, with picture and advancing
position: *2001: A Space Odyssey*, *28 Weeks Later*, *28 Years Later*,
*A Clockwork Orange*, *Avatar: The Way of Water* (direct, sound); *Akira*,
*Arrival*, *Avatar* (transformed). Scrubbing, pause and stop all behaved.
Resume across a stop was correct — *2001* came back at `1:25:01`.

**A node-scoped `429` produced exactly the right behaviour, observed live.**
`10.35.1.50:7438` refused a create with `resource_limit` / "video transcode
limit reached"; the client walked to `macnessa` and succeeded there. That is
the walk core's comment argues for, running for real. Seven such refusals
across the session — **the LAN node's transcode slots are saturated**, which
is an environment fact that shaped the rest of this run.

### Four findings

**1. `AC3` and `EAC3` titles Direct Play silently, and this closes the open
question in the no-sound P1 below.** That item said the missing fact was the
file's audio codec. Measured here, with the codec read off each detail page:

| Title | Audio | Direct play |
|---|---|---|
| 2001: A Space Odyssey | AAC stereo | sound |
| 28 Weeks Later, 28 Years Later, A Clockwork Orange, Avatar: The Way of Water | — | sound |
| **2010** | **AC3 5.1** | **silent** |
| **Avatar: Fire and Ash** | **EAC3 5.1** | **silent** |

Silence measured as `dumpsys media.audio_flinger` reporting `Standby: yes` with
the last write 39-125 seconds earlier while the picture advanced. **Both of the
codecs `capabilities.ts` falsely claims produced silence, and every title whose
audio the device can actually decode produced sound.** The mechanism recorded
as inference is now evidence, and the reach is "most film remuxes", as feared.

**2. After a rebuilding seek on a transformed generation, the position resets
to zero on screen.** *Avatar*, transcode, 2:58:09 long. Scrubbed to 55%: the
client sent `PATCH {seek_ms: 6275725}` (1:44:35), the node accepted it, echoed
`seekMs: 6275725` and built **generation 2** — and the bar then read **`0:13`
with the handle at the far left**. Reproduced on *Arrival* (`seek_ms:
3161659`, generation 2, position 0). **Direct play does not do this** — a
scrub on *28 Weeks Later* and *Avatar: Fire and Ash* landed at `44:33` and
`1:29:02` and reported them correctly. **So `currentTime` on a transformed
generation is generation-local, not title-absolute** — which is exactly the
question the `seekOffsetMs` P2 says "has never been written down, and the fix
is wrong in opposite directions depending on which it is". It is now written
down, and it was measured, not reasoned.

**3. Neither mode switch succeeded, and one of them corrects a claim made
above.** Transcode on *2010*: `PATCH` → **`429 resource_limit`, "video
transcode limit reached"**. Remux on *2010* and on *Avatar: Fire and Ash*:
`PATCH` → **`503 playback_pipeline_start_failed`, "timed out waiting for first
fragmented-MP4 segment"**, after 15.1 s and 16.0 s. **So remux was not
obtainable from this client at all today**, and the run has no remux coverage
as a result — that is a finding, not a gap in the test.

**The correction: "A `PATCH` cannot hit the cap" is too strong.** It is true of
`account_session_limit`, which is admission control on create. It is false in
general — a `PATCH` that asks for a transform the session was not admitted for
can be refused `429 resource_limit`, and was. `classifyCreateRefusal` is not on
that path, so `applyUpdate` surfaces it through `describeError`.

**The client behaved correctly through all three failures**: playback continued
on the existing direct source, no failover fired, no session was lost.

**4. No `410` was seen in thirty minutes against a 0.48.0 cluster, and the
reason matters.** Rebuilding seeks did supersede generations — that path
swaps to the new URL and never refetches the old one, so it is survived, as
predicted. **The mode-switch hole remains untested on hardware because both
switches failed before anything was superseded.** It is still the one to close.

### On driving this screen, because it cost most of the session again

The recorded 3.5 s chrome hide is worse than it reads. **While paused the
chrome does not auto-hide at all**, so the "tap to reveal first" habit that is
correct while playing *dismisses* it while paused, and the next tap is eaten.
Four consecutive `+10` taps at 7-second spacing did nothing whatever, which is
the toggle alternating with nothing ever reaching a control. **Two "rewind does
not work while paused" faults were recorded and withdrawn during this run** on
exactly that mechanism; with the chrome confirmed visible, `-10` moved the
position by 9,992 ms. Nothing here is a new defect — it is the recorded one,
measured, and it is enough on its own to explain "the seek control is still
broken".

Also: a scrub needs a **slow** drag. `input swipe ... 400` was ignored
repeatedly; `input swipe ... 900` took every time.

**Method that worked, for whoever does this next.** Do not read positions off
screenshots. `adb shell dumpsys media_session` reports the video session's
`state=` and `position=` as text, and `dumpsys media.audio_flinger` reports
whether any audio is being written — together those answer "is it playing,
where, and is there sound" without a single capture. The app's own
`[macha] [playback.api]` logcat lines give mode, endpoint, generation and every
refusal body. A helper pair (`probe.sh`, `findbtn.py` — the Play button located
by its flat `#200309` pill) is in this session's scratchpad and worth rebuilding
if lost.

---

## P1 — Playback sessions become a REST resource, and the old stream route is removed outright

**Announced by core 2026-09-21, which Tom has put in charge of the transition.
Planned in the server repo at
`TODO/2026-09-21-playback-sessions-as-a-resource-plan.md`; not implemented
server-side.**

**Client side this is DONE as of 2026-09-21** except the adoption listing,
which is a new capability rather than a break. What was needed, and what each
turned out to cost:

| Break | This client |
|---|---|
| Stream/session routes move; old route removed | **Free** — nothing here spells or composes a path. Grep below. |
| A second POST no longer supersedes | **Free** — `load()` already awaits `releaseSession(previous)` before `createSession`. |
| Several live sessions per account | **Free through the resolver** — one `sessionRef`, ids opaque, core tracks by explicit id. |
| Per-account cap, a new outcome on create | **Built** — `classifyCreateRefusal` in `policy.ts`, wired into `createSession`, the failure surface, **and the failover path**. |
| `GET /sessions` adoption listing | **Not built.** New capability, nobody needs it yet. |

```
POST   /api/v1/playback/sessions                 201 + Location
GET    /api/v1/playback/sessions                 NEW - the account's live sessions, under `items`
GET/PATCH/DELETE /api/v1/playback/sessions/{id}
GET    /api/v1/playback/sessions/{id}/stream/{token}/{generation}/{name}
GET    /api/v1/playback/sessions/{id}/stream/{token}/direct
```

`GET /api/v1/playback/stream/{id}/{token}/...` is **removed outright - no
dual-serve window, no deprecation period.**

### The route half is free here, and this was measured rather than assumed

Core flagged this client as the most likely to be hurt, because it drives
`ClusterPlaybackResolver` directly rather than through `PlaybackCoordinator` -
a layer closer to the wire than the other two clients. **Grepped 2026-09-21
and the answer is clean:**

- `grep -rn "playback/stream|playback/sessions|/playback/" src` over
  `.ts`/`.tsx` returns **only relative module imports** (`../playback/policy`
  and friends). `grep -rn "api/v1" src` returns **two comments**, no code.
- `DownloadManager` uses `session.source.url` verbatim, for both
  `FileSystem.downloadAsync` and `recordTransferByUrl`. Direct play hands the
  same string to expo-video as `{ uri }`.
- **The only composed URL in the tree** is `` `${baseUrl}${LIVENESS_PATH}` ``
  at `connect.tsx:153`, and `LIVENESS_PATH` is imported from core.
- **Nothing parses a session id** - no split, slice, `indexOf` or `::`
  handling anywhere - despite ids being endpoint-namespaced. They are opaque
  tokens handed back to the resolver.

**The condition on all of that:** it is free *provided `source.url` stays
absolute and server-supplied*. Every consumer above feeds a native player or
a downloader rather than a fetch, so if core ever hands back something
relative they break at once and **silently**. Worth a test if core's session
shape is ever reworked.

### The three breaks that are not about routes

- **A second POST no longer supersedes.** Today one bearer has one playback
  session and a second POST replaces it; that is the defect being fixed. **This
  client is already in the right shape:** `load()` does
  `await releaseSession(previous)` before `createSession`, and the await is
  deliberate - the node's one transcode slot is held by the session being
  replaced. The only other create is core's `failover`.
- **Several live sessions per account, so "the session" stops being inferable
  from the token.** Mostly free through the resolver, which has always tracked
  by explicit id. **But it tightens the probe design below** - see that item.
- **A per-account cap becomes a new outcome on create — built 2026-09-21.**
  Settled since: it answers **`429` with code `account_session_limit`**,
  carrying the limit and the current count, and the limit will be published
  somewhere readable *before* a client plans rather than only on the refusal.
  `classifyCreateRefusal(error)` returns `degrade` / `account-session-limit` /
  `fatal`, and the viewer gets "already playing on as many devices as it is
  allowed" rather than core's "Macha playback request failed: ...", which
  reads as a breakage when the node is working exactly as designed.
  Core has told the server it must be a 4xx with a distinct code, because as a
  5xx core would walk the cluster collecting identical refusals and charge
  every healthy node.
  **Core told the server it holds 2 sessions and transiently 3. That is the
  coordinator's number, not this client's:** here it is **1, transiently 2** -
  one `sessionRef`, no standby, no second managed presentation, and the
  warm-standby and priming attempts both reverted (COMPLETED). Said to core, so
  the cap is not sized on the assumption that 3 is everyone's ceiling.

### The cap on the failover path, which is where it would have failed silently

**Tom's call, 2026-09-21: cap and routes cut over together and get tested in
one pass.** This session recommended splitting them, on the grounds that the
routes fail loudly while the cap fails silently during failover and its client
path had never run against a real server. **Overruled, and the right response
to that is to close the silent half rather than restate the objection** — so
the cap is now handled where it would have bitten.

**`failoverSource` had two faults, and the first is ours mirroring core's.**
`playbackApi.failover` *creates* a session, so it can be refused by the cap.

- **It spent failover budget on a refusal that was never a recovery.** The
  attempt is counted before the call, and `MAX_FAILOVER_ATTEMPTS` bounds a
  title's recovery. Three cap refusals would exhaust that allowance without a
  single node failing, leaving the next genuine failure with nothing to spend.
  **This is the exact shape of the defect core found in itself** — charging
  every healthy node walked for an account-scoped refusal, because the charge
  was gated on a status that means "try the next node". Same fund, same wrong
  debit, different repository. `spendsFailoverBudget(error)` now decides, and
  the attempt is given back.
- **It was silent.** The catch logged `failover-failed` and returned, leaving
  a paused player and no reason on screen. It now sets the same
  `accountSessionLimitMessage` the create path uses, and logs
  `failover-declined { reason: 'account-session-limit' }`.

**A `PATCH` cannot hit the cap**, so `repositionTo` and `applyUpdate` are
untouched deliberately: the cap is admission control on *create*, and the two
update paths mutate a session that has already been admitted.
**Corrected on hardware 2026-09-21: true of `account_session_limit`, false in
general.** A `PATCH` asking for a transform the session was not admitted for
was refused `429 resource_limit` on the A85. See the smoke test above.

**Still true, and the reason this wants real-server testing:** every branch
above is exercised against errors this session constructed. The first genuine
`429 account_session_limit` will be the first time any of it runs for real.

### Two defects this work found, one of them ours and load-bearing

**`createSession`'s degrade branch was dead, and had been.** It tested
`error instanceof MachaApiError` — this client's class, raised by this
client's fetch layer — before deciding whether to ask the node for less. But
the create goes through core's `ClusterPlaybackResolver`, which raises core's
own `MachaPlaybackError`. The identity test could never match, so **every
refusal was fatal and no instruction was ever degraded.** Grep-verified in
core's `dist`, pinned by a test that asserts the two classes are unrelated.
`classifyCreateRefusal` is duck-typed on `status`/`code` for exactly this
reason, which is also why core reads `code` and `reason` off the object
rather than testing identity.

**Core found the mirror of it in itself an hour after telling the server the
opposite.** It had assumed a 4xx stops core's cluster walk. It does — except
`429`, which is the one 4xx core treats as "try the next node". A cap refusal
would therefore have walked the whole cluster collecting identical refusals
**and charged every healthy node**, because the charge is gated on the same
answer. Now classified account-scoped in `endpointFailure.ts`: neither walked
nor charged. Core says it would not have found it if the server had not named
the status it already uses.

**The mirror lasted about an hour and is gone.** `ACCOUNT_SESSION_LIMIT_CODE`
restated a string from core's private `ACCOUNT_SCOPED_FAILURE_CODES`; core
exported **`isAccountSessionLimit(error)`** and **`playbackFailureCode(error)`**
on request and the constant is deleted. The predicate keys on the code alone,
so the set of account-scoped codes stays core's to track and no client spells
one — when the server adds another, core absorbs it and nothing here changes.
The wire string now appears only in a test, which is the right place to hold
the server's contract.

**A third layer, and it made the first version of this work wrong.** Core wraps
a node's refusal in `MachaEndpointError` before it leaves the resolver
(`endpointFailure()` puts the original in `cause`), and **that wrapper carries
no `status` and no `code` of its own.** So the duck-typed classifier written
this morning — reading `error.status` and `error.code` off the outermost
object — found neither and called every wrapped refusal fatal. The same defect
as the `instanceof` test, one layer further out, and written by someone who had
just finished diagnosing the first one. Core warned about it in the same
message that carried the export; the tests now build their fixtures with core's
real `endpointFailure()` rather than a hand-rolled wrapper, which is what
caught it.

**No mirror remains.** Core exported `playbackFailureStatus` too, so the local
`refusalStatus` walk lasted about an hour and is deleted. Core's version also
rejects a non-finite status, which the local one did not. **Both readings now
go through core's accessors rather than off the object in hand**, which is the
rule the three bugs below yield.

### What core settled after the first brief

- **The collection listing is node-local.** `GET /api/v1/playback/sessions`
  answers for the node that served the request; a client fans out across the
  nodes it knows. The operator refused cluster-visible ids deliberately: an id
  visible cluster-wide promises any node can act on it and none can, because a
  session owns a generation directory, a transcode slot and a live pipeline, so
  PATCH and DELETE must execute where the pipeline is. **Provenance is
  therefore free** — you know which node you asked, which is the same
  requirement the probe below has.
- **`source.url` stays absolute and server-supplied.** Core's stated
  commitment now, not this client's assumption, and the route change does not
  touch `streamUrl()`.
- **The cap design changed on this client's evidence.** The server's reply to
  the "2 live, 3 transient" figure was *"I would have set the cap at core's
  floor"*; their plan now records 3 as one client's floor and not anyone's
  ceiling, that the phone holds 1 and transiently 2, and that adoption costs
  budget by design. They also read es-1's live config and found
  **`max_sessions: 8` node-wide across every account**, with a 30-minute idle
  expiry, so the existing node-wide limit is being revisited too. **That
  interacts with the leaked-session P2 below**: a session leaked by process
  death holds one of those eight for half an hour.

### Sequencing, and the trap in it for this client

Core ships a **410 tolerance release first**, nodes move second: core today
falls to `unknown` on a 410, which it reads as endpoint evidence. Core notes
this client is on the `file:` link and so gets it as soon as core builds.

**Hotlink, and do not wait for a publish — Tom, 2026-09-21, relayed by core:**
*"We're nowhere near ready to publish npm... you're not done, no publishing to
an immutable repo"* and *"they should hotlink for now so we can actually test
this works."* This supersedes core's earlier "pin when `npm view` shows it".
The link is not a temporary state waiting on a registry entry: **the publish
happens when this is proven on hardware, not when it compiles**, because a
registry entry is permanent and cannot be withdrawn.

**So nobody tags anything while on the link.** `main` pins published versions
and every client's `develop` now depends on symbols that exist in no published
version. This client reached that conclusion before core did and core now
records it in the same terms. `version:check` enforces the mechanical half.

**`0.15.0` and `0.16.0` are superseded and will never be published**,
deliberately, so that nobody adopts twice. `0.17.0` carries their `410` and
`account_session_limit` tolerances plus the three accessors.

**Superseded on 2026-09-21 — core reverted to `0.17.0` at `5485db4`; see the
410 section below.** ~~**The linked tree now says `0.18.0-dev`, and that is the
fix for a hazard that was live.**~~ `0.17.0` was tagged at `c3d840b` before `playbackFailureStatus`
existed; `develop` was at `9a37ce3` with **250 lines of source between them**,
both answering `"version": "0.17.0"`, with four clients hotlinked to it. Core
confirmed and chose a prerelease over the `0.17.1` tag this client suggested,
for a better reason than the suggestion: a tag names one commit and `develop`
moves again within the hour, so it buys a correct number briefly and then the
hazard returns quietly. `-dev` cannot collide with a tag by construction and
tells a reader what the tree is. The release commit still bumps to bare semver
with the tag on that.

**Record the SHA and the `dist` hash beside anything measured — not the
version.** **Use core's `npm run dist:hash` and nothing else** (core `cb5ab60`,
2026-09-21). It hashes **every file** in `dist` from *inside* the directory —
inside because `shasum` includes the path it is given, and every file because
`dist` carries **72 `.d.ts` files and those are what this client compiles
against**: a type-only change in core moves what `tsc` sees while leaving every
`.js` byte identical, so a `*.js`-only hash reports "nothing changed" in
exactly the case that matters.

~~Hash the `*.js` files from inside `dist`.~~ **That was this file's rule and it
was the narrower one.** It cost nothing in content — verified here on core
`cb5ab60`, all files `f417480441d9`, `*.js` only `394cdac4b15b`, same bytes —
but core and this client exchanged non-comparable numbers all day without
either noticing, because **a hash computed two ways looks like corroboration
and carries none**. That is the third instance of the same failure in one day,
after the relayed `delay_moov` mechanism and the `0.18.0-dev` version number:
a fact taken rather than checked. **Any `dist` hash recorded in this file
before 2026-09-21 19:00 is the `*.js`-only figure and must not be compared
with a canonical one.**

As of this commit: core `938501d`, clean tree, `dist` `*.js` hash
`57eef0e50f42`. **The hash is unchanged from `9a37ce3` while the SHA moved**,
because that commit touched only `package.json` — which is the method working:
the SHA says which commit, the hash says whether anything that runs changed.
**A release here is what puts it on a phone**, and `main` pins published.

**That is true of `develop` and false of the device.** What ships to a phone is
`main`, which pins a published version, and the A85 is on 0.6.0. "This client
has the tolerance" and "the tolerance is on hardware" are two different dates
here, separated by a publish, a release and a 23-minute build. **Core accepted
this and the server has agreed to it as the order of record: the nodes do not
move until the second date, not the first.**

### `410 generation_superseded` ships in 0.48.0, and this client cannot see it

**Briefed by the core session 2026-09-21; everything below marked *checked* was
opened here, and the rest is carried as core's claim.** The hold is off: 410 is
not waiting for a second flag day, because the release already breaks the
contract deliberately and the joint test wants a real one to observe. Under it
a superseded generation is **routine** — every regenerate, every mode switch
and every rebuilding seek makes one. Its axes are `scope: request`,
`node_healthy: true`, `alternative_may_succeed: true`: **do not walk the
cluster**, the node is fine, and a different request against the same node
works.

**Checked: the route removal is still free.** `playback/stream`, `/stream/` and
`playback/sessions` appear nowhere under `src` — zero hits across the index.
Nothing here spells a stream path; the resolver owns it and this client takes
`source.url` from the session it is handed.

**Checked: the only status→kind mapping in this client is on create.**
`classifyCreateRefusal` (`src/playback/policy.ts:122`) reads core's
`playbackFailureStatus` for the 400, and `isAccountSessionLimit` for the cap.
There is no `playbackFailureKindForStatus` call anywhere, and nothing carries an
HTTP status at the player layer. Playback errors arrive at
`src/providers/PlaybackProvider.tsx:936` as `{ status, error }`, and `error` is
a message string.

**A 410 therefore reaches us opaque, and — checked against the artifacts, not
inferred — it cannot be made to arrive.** `PlayerError` is `{ message: string }`
with no status, no code and no cause; segment, init and playlist requests are
issued by the native players straight to the stream URL and never pass through
`src/api/http.ts`; and expo-video builds its `OkHttpDataSource.Factory`
internally with no injection point, so the transport cannot be wrapped either.
The route that works is the one Android TV already has — a native media3 module
feeding `httpStatus` into core's classifier — and that is a build, not a patch.
Worth knowing while it is not built: media3's `DefaultLoadErrorHandlingPolicy`
lists 410 in `isEligibleForFallback`, so media3 will try to fall back before it
gives up; with a single URL there is nothing to fall back *to*, and it surfaces
as an ordinary load error.

**So the question is not "how do we classify 410" but "what does this client do
when a fragment fails for a reason it cannot name", and the answer differs by
which supersession caused it.**

- **A rebuilding seek already survives, and for the right reason.**
  `errorBlamesEndpoint` (`policy.ts:345`) declines failover while a seek we
  asked for is outstanding on a manifest source inside the deadline, and
  `repositionTo` resolves it. The reasoning it was written for — the evidence
  is about the request, not the server — is exactly the 410 argument, arrived
  at from a seek measured on 2026-09-13.
- **A mode switch is unguarded, and this is the gap.** `applyUpdate`
  (`PlaybackProvider.tsx:836`) leaves no marker of its own, so
  `errorBlamesEndpoint` takes its `!pendingSeek` branch and returns `true`. The
  old generation is superseded the moment the server answers; the player is
  still fetching it; the 410 reaches `statusChange`; failover runs. That is a
  cluster walk on a healthy node, a new session charged against the account cap,
  and failover budget spent on a recovery that was never available — the same
  three costs the cap work removed from the create path in `spendsFailoverBudget`.
- **And it would eat the switch the viewer asked for.** Both paths bump
  `generationRef`, so a failover starting mid-`applyUpdate` makes `applyUpdate`
  bail at its own guard (`:847`) and discard the update. *Read off the code
  path, not measured* — it wants the observation the joint test is for.

**And failover on mobile does not work. Tom, 2026-09-21.** That is the state of
record and it supersedes the 2026-09-08 device note; the "recovery works but is
not seamless" line under *Deferred by Tom* has been corrected to match.

**It makes this gap worse, not smaller.** The costing above was written as
though the spurious failover at least buys a working recovery, so the harm was
waste — a walk, a session, a budget. It does not recover. So a 410 this client
caused takes a viewer who was *watching something* to a stopped player and an
error, where doing nothing would have left the picture up while `applyUpdate`
swapped the source underneath it. The mode switch is discarded either way.
**The remedy is therefore not an optimisation. It is the difference between a
mode switch that works and one that ends playback**, and that is the whole
argument for it — the walk, the session and the budget are now the small part.

**It also re-costs work already done.** The cap handling on the failover path
(`e3c5ad2`) and `spendsFailoverBudget` are both careful accounting for a
recovery that does not arrive; they are not wrong, but nothing downstream of
them pays off until failover works. Same for the outstanding container-
restatement measurement further down, which asks for a failover's `POST` to be
captured. **Anything whose value is "failover behaves better" is worth less
than it reads until that changes.**

**The remedy shape that needs no status.** The seek guard is already the right
idea one case short: what it encodes is "this client superseded the generation
itself, moments ago". A marker set by `applyUpdate` on the same footing as
`pendingSeekRef`, with the same deadline argument, closes the mode-switch case
without a native module and without ever seeing a 410. Deliberately narrow, for
the reason `errorBlamesEndpoint` already states: anything outside that window
must still blame the endpoint, or a genuinely dead node leaves a viewer stuck.
**Not built — it is a behaviour change on the failover path and wants Tom's
call, and the native route is the only one that also covers a 410 we did not
cause.**

**Core collapses 410 into `not-found`, on purpose.** Three meanings are distinct
on the wire — 500 `segment_not_ready` wait, 410 permanent re-read the session,
404 never existed, and a generation above the current one is still 404 — but
`playbackFailureKindForStatus` (core `src/playback/streamProtocol.ts:169`)
returns `not-found` for 404 and 410 alike, because what a caller must do is
identical and a seventh kind would reach an un-updated host as `default` and
condemn the node. So "do not collapse them" is true of the wire and false of the
kind, by core's own argument; the session re-read is what separates them.

**Checked, and it corrects what is written above at "The linked tree now says
`0.18.0-dev`": it does not any more.** Core reverted it at `5485db4`, "We are
building 0.17.0; it is not a thing the world has seen", undoing `938501d`. So
this repo's `bf3cc56` records a version number that no longer exists, and **the
hazard the prerelease was chosen to fix is live again and wider than before**:
`0.17.0` was tagged at `c3d840b`, the linked tree is at `5aa3f6f`, and every
commit between them answers `"version": "0.17.0"`. Nothing here should quote the
version to mean a build.

As of this commit: core `5aa3f6f`, tree clean but for `.gitignore` and an
untracked `basemind.toml`, `dist` `*.js`-only hash **`9e7348894c5a`** (non-canonical; see above) — against
`57eef0e50f42` recorded at `938501d`, so what runs *has* changed, which is the
method working. **`dist` is rebuilt**: its newest artefact is later than the
newest file in `src`, so a typecheck against the link is trustworthy right now.

**Superseded the same day. Core `648474d`, rebuilt and run here 2026-09-21
14:34, not taken on report.** `npm run build` in `../macha-ts` (typecheck,
platform lint, atomic `dist` replace) then here: **typecheck clean, 119/119
across 16 files**. `dist` `*.js`-only hash **`8c835ad33000`** (non-canonical), newest artefact later
than the newest `src` file, and `node_modules/@machafoundation/core` still a
symlink. Core reported the same suite green from its side before this run; this
is the independent one. The change in `648474d` is comment-only in
`PlaybackCoordinator.ts` plus two fixtures this client cannot reach, and the
standby floor still reads `10_000` — neither of which reaches here anyway,
since this client drives `ClusterPlaybackResolver` and not the coordinator.

**A correction to the tag SHA above, and it is the kind that wastes an hour.**
Core reported the `0.17.0` tag at `68ce6c8`; this file says `c3d840b`. Both
are real and `c3d840b` is the one to use: the tag is **annotated**, so
`git rev-parse 0.17.0` yields the *tag object* `68ce6c8` while
`git rev-parse 0.17.0^{commit}` yields `c3d840b`. Only the commit appears in
`git log`, so anyone handed `68ce6c8` will look for a commit that is not there.
Core's count is right — **17 commits past the tag, all answering
`"version": "0.17.0"`**, up from the 8 recorded earlier today.

**`ALTERNATE_RECOVERY_WINDOW_MS` moved 30,000 → 10,000 (core `5aa3f6f`) and it
changes nothing here.** Core took the floor `config_base.cpp:359` guarantees
rather than the `pipeline_idle_ms` default it had been believing, because the
figure is configurable and never serialised. It lives in `PlaybackCoordinator`,
and **this client does not use that coordinator** — `src/api/playback.ts` drives
`ClusterPlaybackResolver` directly. Noted so nobody reads a standby fix as ours.

**Carried from core, not checked here** — the routes as built (`POST` creating a
member every time and answering `201` + `Location`, the collection under
`items`, `GET`/`PATCH`/`DELETE` by id, the two stream routes), `"account":
{"sessions": N, "max_sessions": M}` on creation, the listing and the refusal but
never on `/api/v1/status`, another account's id answering `404` rather than
`403`, the per-node playback block gaining `max_sessions_per_account`,
`pipeline_idle_ms` and `session_idle_ms`, and TEL3 cutting over on all three
nodes at once. **And the server's own correction, which is the one to watch:
shipped defaults put `max_sessions` at 8 node-wide against
`max_sessions_per_account` 32, so the node limit always refuses first and
`account_session_limit` is unreachable until all three live nodes are raised.**
Until then the only 429 observable from here is the node-scoped one — which
`classifyCreateRefusal` deliberately calls `fatal`, so a cap test run before that
change would look like the cap handling failing when it is working.

**The two 429s are told apart by code and never by status, and the code names
matter for reading a test log.** Checked in the linked tree:
`ACCOUNT_SCOPED_FAILURE_CODES` (core `src/cluster/endpointFailure.ts:144`) has
**exactly one member, `account_session_limit`**, and `isAccountSessionLimit`
matches on the code alone through the cause chain. Core's own comment says
`resource_limit` is excluded deliberately, being shared by the node-wide
session limit and both transcode limits, where walking and charging are
correct. **This client already uses that predicate and spells no code of its
own, which is the arrangement to keep.**

**Settled from the server source on 2026-09-21, and read here rather than
taken on report.** The web client session raised the question and then
corrected itself against `macha`; every citation below was opened in
`/Users/tom/devroot/macha` and matches.

- **Both caps are enforced four lines apart in one function, node-wide
  first.** `reserve_session_slot` (`src/playback.cpp:1404`) throws
  `ResourceLimitError("playback session limit reached")` on
  `sessions.size() + pending_sessions >= config.max_sessions`, and only then,
  at `:1409`, throws `AccountSessionLimitError(held, max_sessions_per_account)`.
  **So the 8-against-32 default is not an arithmetic coincidence — the ordering
  is mechanical**, and the account cap cannot be reached while the node-wide
  number is the smaller one.
- **`resource_limit` is the node-wide session limit *and* both transcode
  limits**, all the same exception type (`:1453`, `:1456`), surfacing as
  `429 resource_limit` at `:3308`. That is exactly what core's comment at
  `endpointFailure.ts:139` says, and it is why the code cannot be
  account-scoped.
- **`too_many_sessions` and `try_later` are a different subsystem entirely.**
  `too_many_sessions` (`src/session_api.cpp:169`) is the *auth* session store
  full — `sessions_.create(...)` returning empty, `session.max_sessions`,
  nothing to do with playback. `try_later` (`:157`) is password-check rate
  limiting, carrying `Retry-After: 1`, not a cap at all. **A 429 on
  `/api/v1/session` and a 429 on the playback route mean unrelated things**,
  which is the part that would have misread a cap-phase log.

**Two details worth having that nobody had stated.** The account-cap refusal is
built at `playback.cpp:~3296` with `scope: request`, `node_healthy: true`,
**`alternative_may_succeed: false`** and both figures — so the axis the web
client gave is right and core's brief had only the first two. And the account
cap is enforced **inside `if (config.max_sessions_per_account)`**, so an unset
or zero value disables it silently; a node that never refuses is not evidence
the client handling works.

**Both refusals' axes now read from source, and they are an opposed pair.**
`generation_gone` (`playback.cpp:159`) builds the 410 with
`FailureAxes{FailureScope::request, true, true}` — scope `request`,
`node_healthy` true, **`alternative_may_succeed` true**, with the server's own
comment saying the third field *is* the instruction: a different request, the
new `stream.url`, succeeds on this same node. The account cap at `:~3296` has
the identical first two and **`alternative_may_succeed` false**. So two
refusals that agree on "do not walk, the node is fine" give opposite
instructions on what to do next, and **a client that read the axes instead of
the code would have to get that pair right every time.** This client reads
neither directly — it uses core's code-keyed predicate — and that is the
argument for the arrangement rather than an accident of it.

**Nothing changes in this client.** The account-scoped predicate remains the
only correct match and no code name is spelled here.

**Comms, from Tom 2026-09-21: this session talks to the core session only.**
The web client and server sessions are not to be messaged, including to sign
off. Anything they need goes through core. **And the next build is core's
call — when core says so, rebuild core's `dist` and run typecheck and tests
here**, in that order, because a `file:` link resolves a working tree and a
typecheck against a stale `dist` proves nothing.

---

## P1 — No sound on Direct Play, and the client claims a codec this device does not have

**Measured on the A85 2026-09-21, app 0.6.0, "2010" Direct Play. Raised by Tom
mid-session: "there's no sound".** The picture decodes and advances; there is
no audio at all.

**It is not muted and not a volume problem** — checked before anything else,
because that is the cheap explanation:

- Media volume **14 of 15**; `dumpsys audio` says `Muted: false`, master mute
  off, master volume 1.0.
- The app **holds audio focus**: `expo.modules.video.managers.AudioFocusManager`,
  `gain: GAIN`, `loss: none`, `USAGE_MEDIA`/`CONTENT_TYPE_MOVIE`.
- **No PCM is being produced.** `dumpsys media.audio_flinger` on the primary
  output: `2 Tracks of which 0 are active`, thread `Standby: yes`, and
  `Last write occurred (msecs): 649445` — no audio written for eleven minutes
  while video played.

**The device has no AC-3 or E-AC-3 decoder.** `dumpsys media.player` lists
none: a grep count of `audio/ac3|audio/eac3` returns **0**. It has
`audio/3gpp`, `audio/amr-wb`, `audio/flac`, `audio/vorbis` and the usual set.

**And this client claims both, unconditionally.** `src/playback/capabilities.ts`
declares `audioCodecs: ['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac']`
for android without asking the platform anything.

**The mechanism that fits, and it is not confirmed:** the client claims AC-3,
so the node sees a file it may Direct Play and copies it through; media3's
`DefaultTrackSelector` will not select a track no renderer supports, so it
selects **no audio track at all** — which produces silence rather than an
error, and explains why nothing is logged and why playback is otherwise
healthy. **What is missing is the file's actual audio codec.** Get it from the
playback options sheet or the node's facts before acting; everything above is
device state, and only this last step is inference.

**This is the sharp form of the "nothing knows about speaker layout" P2
below.** That item asks whether a 5.1 track is downmixed for two speakers.
This is worse and simpler: **the codec claim itself is false on this device**,
so the question of channels never arises. Fixing the channel half would not
have found this.

**Reach is unknown and matters.** Every Direct Play of an AC-3 title on this
device is silent, which is most film remuxes. It cannot be seen in a test that
only checks the picture — and this project's smoke tests have all checked the
picture.

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
`prebuild` and a **cold Gradle build, 1h15m last time**, almost all waiting.

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

---

## P1 — What still needs a person holding a phone

Nothing here can be done from this machine alone. The Galaxy is the better
device for the first two — clean install, no endpoints, opens on the connect
screen.

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

**Verify on device before and after**, because what `currentTime` reports for
a transformed generation here — generation-local or title-absolute — has never
been written down, and the fix is wrong in opposite directions depending on
which it is. `timeUpdate` uses `currentTime * 1000` as the title position
unadjusted, which only works if the fMP4 timestamps are title-absolute.

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
reads `channels`. This client claims `ac3` and `eac3` on both platforms with no
channel awareness, so a 5.1 track can be Direct Played to a phone whose output
is two speakers. Whether media3 downmixes transparently is **unverified** —
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
- **Core `0.15.0` is tagged and not on npm** (told 2026-09-21): the walk fix,
  the bounded recovery, the encoder-speed reading, and one breaking change -
  `hlsWalkTargets` throws `HlsManifestUnavailableError` instead of returning
  `[]`. **No caller here** - `grep -rn "hlsWalk|HlsManifestUnavailable|walkTargets" src`
  is empty - so the break costs this client nothing. **Do not pin it until
  `npm view` shows it**; three core versions have been tagged and never
  published. Core has been asked to say when it lands, not when it tags.
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

- **The tree compiles against core 0.14.0 and against core's `develop`**, with
  no edits, checked 2026-09-20 by pointing `tsc` at each `dist` in turn.
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
