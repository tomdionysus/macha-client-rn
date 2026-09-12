# Active

Open work for `macha-client-rn`. Plans, experiments and conclusions live here
while they are live; finished ones move to [COMPLETED.md](COMPLETED.md) with what
they measured rather than being deleted.

Ranked P1 (do next) down to P3 (real, but nobody has lost a minute of playback to
it). There is no P0 today. Items marked **putative** are speculative and may
never happen — carried deliberately, because being surprised by one costs more
than carrying it.

Compiled 2026-09-10 from this client plus the core, web-client, Android TV and
server sessions. Where a peer's claim was checked rather than taken, it says so.

## Committed at 0.4.0

Everything that was in the working tree at 0.3.5 went in as `0.4.0`, on top of
`b223191`:

- the seek bar fixes and the volume-restore guard, with their tests;
- three corrected code comments about the removed bearer token;
- the rewritten `README.md`, the `AGENTS.md` additions, and this folder;
- QR scanning: `expo-camera`, `src/ui/QrScanner.tsx`, `src/app/scan.tsx`,
  `src/scan/endpoint.ts` and its tests, and the connect screen's entry point;
- login and the account marker, on core's users API;
- the node field on the connect screen, which accepted several nodes all along
  but gave a phone no way to type the second one.

**Neither `b223191` nor `0.4.0` is pushed.** `0.4.0` is the first build that can
run the camera or reach an account, because both need the native rebuild.

---

## Done at 0.4.0 — the node field could never reach line two

`src/app/connect.tsx` has carried `multiline` since before this round, splits on
newlines *and* commas, and says "one per line" in its hint. None of that was
reachable from a phone: with `inputMode="url"` the Android action key is **Go**,
and on a multiline field that submitted instead of breaking the line, so a second
node could not be typed. `submitBehavior="newline"` states which of the two the
key does. The hint now also mentions commas, which the parser already accepted,
so there is a way in even where a keyboard offers no return at all.

The Settings row that displays the seeds was clamped at two lines by `ListRow`'s
default, which reads as a limit on how many nodes there can be rather than a
truncated view of how many there are; it now sizes to the list. **Both are
unverified on a device** — the keyboard behaviour is the reason the change
exists and is exactly the part that needs the phone to confirm.

---

## In progress — Login and the account marker

**Status: written, typechecking, 44 tests green, unverified against a node.**
Built on core's accounts work, which is **unreleased and has no tests of its
own** — the core session said so unprompted, and it is the main risk here.

**Nothing about accounts is implemented in this client.** `src/api/users.ts` is
a re-export of core's `UsersApi`/`MachaUsersApi`/`ClusterUsersApi`, and the only
local decisions are React wiring and what to draw. Asked before building, as the
mirror rule requires, and the answer was that core has all of it: roles are
`media_viewer`, `importer`, `manager`, `manage_users` as a **closed set with no
implication between them**, `isSignedIn` is the only test for whether somebody
chose to be anyone, and `hasRole` is a plain membership test. Do not add a second
opinion about any of that here.

**What login does, precisely.** `POST /api/v1/session` is the same route with or
without credentials — omitting them authenticates `anonymous`, supplying them
authenticates whoever they name. So signing in **replaces** the token rather than
upgrading it, and signing out drops the token and immediately mints a fresh
anonymous one. There is never a state with no session.

**Two things this client had to get right that core does not do for it:**

- **Playback is stopped before both sign-in and sign-out.** After the token
  changes, a playback session created under the old identity can no longer be
  closed, and the node holds it against `max_video_transcodes` until
  `session_idle` at thirty minutes. On a one-slot node that is the entire
  transcode capacity, spent on a login. Core confirmed it connects logout to
  nothing in playback; the ordering is ours.
- **The revoke runs before the local sign-out, and its failure is reported
  rather than swallowed.** Dropping a token locally is not a logout — the
  session stays valid on every node until it expires. When the revoke cannot be
  delivered the viewer is still signed out here, because having asked to be
  signed out and remaining signed in is the one outcome that must not happen,
  and Settings then says the old session is still live elsewhere.

**The marker reads four states, not two.** `src/account/marker.ts`, tested.
`unknown` (nobody answered) and `unstated` (the node answered and named no user,
which is what a 0.37.2 node does) both render **nothing**. Only `anonymous` and
`signedIn` are drawn. Offering "Log in" because the whoami failed would be
claiming nobody is signed in, which is a claim this client cannot make without an
answer; offering it on a node with no accounts would be a promise the server
cannot keep.

**Identity is re-read on every token change** (`sessions.subscribe`) rather than
remembered from the sign-in. This is deliberate cover for a **known core defect
the core session flagged and is not fixing this round**: a 401 is answered by
re-minting, a re-mint carries no credentials, so a password or role change
**silently downgrades a signed-in viewer to anonymous**. A marker drawn from a
remembered username would go on naming somebody who is no longer signed in. What
the viewer actually sees is their initial quietly becoming the guest glyph —
self-correcting, but not an explanation. If that proves confusing on a device,
the fix is core's, not a toast here.

**Checked, not inherited:** core also warned that a pre-save connection check
counts an endpoint usable only on an OK response while every node answers 401
unauthenticated — a measured bootstrap lockout on a fresh install. **It does not
apply to this client.** `firstReachable` in `src/app/connect.tsx` already treats
401 as proof a Macha node is listening, with a comment saying why.

**What is left:**

- everything on a real node: a real login, a wrong password, a logout, and the
  marker through all four states. None of it has met a server;
- the same native rebuild the QR work needs;
- **`/api/v1/users/me`, roles beyond display, and password change are not
  built.** Settings shows the username and the server's own role names and
  nothing else. That was the scope asked for.

---

## In progress — QR scanning, ahead of users

**Status: written and typechecking, unverified on a device.** Nothing depends on
it yet; the connect screen is the only caller.

Added because users are coming and whatever pairs one to this client will arrive
as a code on another screen. The capability is deliberately split so that work
does not have to unpick this one:

- `src/ui/QrScanner.tsx` is the camera and nothing else. It reports payloads and
  interprets none of them. A pairing screen reuses it as it stands.
- `src/scan/endpoint.ts` is the interpretation the connect screen needs, and the
  only file that would be written again for a payload meaning something else.

**Why the parse is not just `coerceEndpointUrl`.** That function is for a text
field, where every character was typed by someone meaning to type an address. A
camera has no such guarantee. Measured against the plain coercion before the
parser existed: `macha://pair?token=abc` and `Macha` both return
`http://macha:7438`, and `mailto:tom@example.com` returns
`http://example.com:7438` — syntactically perfect endpoints no node has ever
answered on. The connect attempt then reports an unreachable server, which is
true and the wrong diagnosis. Those three are the cases in
`src/scan/endpoint.test.ts` that failed first; the wifi and vCard codes in the
same file were already rejected and are held to keep them that way.

**The scanner deduplicates on payload rather than latching after one read.**
`onBarcodeScanned` fires per frame, and a one-shot latch also ends the scan —
when a code turns out to be wrong the viewer's next move is to point at a
different one, and a latched scanner is dead while they do it.

**What is left, and it needs the phone:**

- a native rebuild — `expo-camera` is a native module, and the installed APK
  predates it. Nothing here runs until then;
- the permission flow on both platforms, including the second refusal, where the
  prompt becomes a link to Settings rather than another request;
- a real code read at a real distance. The viewfinder is decoration — the
  scanner reads the whole frame, which is why it is a plain square and not a
  mask implying otherwise.

`recordAudioAndroid: false` and `microphonePermission: false` are set on the
config plugin: this client scans and never records, and a media app asking for a
microphone it does not use is the kind of thing people uninstall over.

---

## P1 — Confirm this client cannot mis-handle the 500/503 segment contract

**Status:** cheap to verify, expensive to have wrong. Probably already safe.

The server holds a request for `streaming.segment_timeout` when a fragment is not
yet produced, then answers **500 `segment_not_ready`** with a `Retry-After`.
**That 500 is a hold, not evidence about the node** — retrying is correct,
demoting the endpoint is not. **503 `stream_failed` is the terminal one.** A
client treating 5xx uniformly evicts healthy nodes for doing their job, and it
looks exactly like flaky infrastructure.

**The server half, confirmed from source.** 6000 ms is the code default
(config.hpp:461), valid 1000..20000, and **not** overridden in the cluster YAML,
so the nodes here run the default. The refusal carries `Retry-After: 1` and
`Cache-Control: no-store` (playback.cpp:792-800), and **`init.mp4` takes the same
path as a fragment** — the playlist is served up front, so a client asks for it
before the muxer has written it. `streaming.md:111` explains why 500 and not 503.

**Expected answer here is that it cannot happen.** Segment, init and playlist
requests are issued by the native players straight to the stream URL and never
pass through `src/api/http.ts`, so a segment status cannot reach
`isEndpointFailure` or the registry at all. That safety is architectural — but it
has never been positively verified, and the API paths that *do* go through core's
classification are a separate question.

**Two device-side measurements remain open and are ours**, and the server session
wants the result: whether a cold session on either engine ever actually receives
that 500 before aborting, and the prefetch arithmetic. 6000 rests on static
constants read from Android artifacts, with iOS never read at all — and the
server side of that constant has no owner either.

---

## P2 — Verify the container restatement reaches the wire

**Status: fixed in core; verification outstanding.** Needs a node stopped
mid-playback, so it happens on Tom's next run rather than on demand.

**The defect.** A failover from this client **creates** a session rather than
PATCHing one — `ClusterPlaybackResolver.failover` falls through to `create`. The
server seeds a PATCH from the existing preferences (playback.cpp:2230) but starts
a *create* from a default-constructed `PlaybackPreferences` whose container is
`"fmp4"` (playback.cpp:2023, 220). So a replacement generation was fMP4 whatever
the original had been, by the node's documented default rather than by accident.

Latent on this device only because `deviceCapabilities()` claims both `hlsFmp4`
and `hlsTs`. Where it bites — the web client's measured Samsung case — the
replacement prepares, playback never starts, nothing is fetched, no error is
reported, and about fifteen seconds later the cluster is exhausted with healthy
nodes in it, because each silent starvation is charged to the node that served it.

**The fix, in core.** `withServedSegmentContainer` restates
`failedSession.output.container` inside `failover` — narrowed to
`'fmp4' | 'mpegts'`, skipping `direct`, untouched when the node reports nothing
recognisable, and yielding to a container the caller states. Accepted over a
client-side fix because it restates **what the node actually served** rather than
what the instruction asked for, and sits on the path every consumer takes.

**What is left is the measurement:** capture the failover's session **POST** —
a create, not a PATCH, which is the whole reason the container was lost — with
`container` absent before the change and present after. If `output.container`
turns out to be absent in practice on this cluster, core's restatement no-ops and
a client-side fix is needed after all; the same capture answers it.

**Note for whoever takes it:** session ids are namespaced by endpoint
(`http://a::session-1`) while the URL carries only the node-local half. Match the
node-local id, or you will conclude a close or a create never happened when it
did. Core lost time to exactly this.

---

## P2 — A session is leaked on process death, and only the server can close it

**Filed as P3 on the wrong clock, corrected.** It said "a node reclaims an idle
session in about a minute", which is `pipeline_idle` — the *engine*. The session,
and with it the video transcode entitlement, lives until `session_idle` at **30
minutes**. So process death costs a one-slot node its only transcode slot for half
an hour.

`releaseSession` runs on stop, on replacement and on reconfiguration, but not when
the app is swiped away or killed. Backgrounding deliberately does *not* release —
`staysActiveInBackground` is true and music is meant to keep playing — so the gap
is process death specifically. The web client's `keepalive` DELETE does not help
with it either.

**No client fix closes this, and no core fix either:** a process that is gone
cannot send a `DELETE`. Only the server-side change under consideration covers
it. Kept as the standing argument for that change rather than as work to do.

## P2 — Nothing anywhere knows about speaker layout

**Status:** putative for this client, live elsewhere.

Core's `choosePlaybackInstruction` decides audio purely on codec and never reads
`channels`; `PlaybackCapabilities` has no field for what the output can render.
There is a live report of 5.1 playing into stereo with no downmix on the
television, from the first second rather than after any interval.

This client claims `ac3` and `eac3` on both platforms with no channel awareness at
all, so a 5.1 track can be Direct Played to a phone whose output is two speakers.
Whether media3 downmixes transparently is **unverified** — that is the measurement
that decides whether this is a phone problem or only a television one.

**Related, checked while here:** `hlsVideoCodecs`/`hlsAudioCodecs` are set
explicitly on android and ios, narrower than the direct lists, because ExoPlayer's
HLS path is narrower than its progressive extractors. Leaving them unset makes
core fall back to the *direct* lists silently, which would claim E-AC-3 in fMP4 —
an independent black-picture path. The `web` fallback branch does leave them
unset: dead code on a device, but recorded rather than trusted.

## P2 — Stall detection, if it is ever wired

**Status:** deliberately not started. Depends on decisions not yet made.

Core has `MediaStartWatchdog` / `MediaStallWatchdog`, deliberately *not* wired
into `PlaybackCoordinator` — each host wires its own, which is why they are
reachable from here when `prepareAlternate` is not. Three things are already known
and must not be rediscovered:

- **A source that has never started has not stalled.** A freshly promoted source
  reports position 0 with nothing buffered while the node builds the generation.
  Arming on that first sight killed *every* replacement in the web client:
  recover onto a healthy node, fail it before it delivered a frame, recover again,
  exhaust the cluster.
- **Absent buffering must stay absent.** `note(positionMs, bufferedEndMs?)` takes
  the buffer figure as optional specifically for expo-video, which publishes a
  position and nothing trustworthy about buffered ranges. A fabricated zero reads
  as evidence about the node when the only evidence is that a viewer is waiting.
- **Any timeout must be calibrated against the server's 6000 ms hold and say so.**
  Core's is 7 s and its guard test asserts the *relationship*, not the number.
  Four bugs in this project have been two independently-chosen timeouts colliding.

Adopting `PlaybackCoordinator` itself is a much larger move and wants its own
argument. The standby defect once cited as a reason against it has been retracted.

---

## P3 — Android reports a version that has never matched the app

`android/app/build.gradle` carries `versionCode 1` / `versionName "0.1.0"` while
`package.json` and `app.json` are at 0.3.5. Confirmed observable: `dumpsys package
foundation.macha.client` reports `versionName=0.1.0` on the device. Wants wiring
to the `app.json` version rather than another hand-edit.

Cosmetic **here** specifically, and worth not conflating with the Android TV
client's version of it: `expo-module-gradle-plugin` requires `versionName` in
`defaultConfig` and fails autolinking outright when it is *absent*. Ours is
present and merely stale — a different bug with a different cost.

## P3 — Dead viewer-session identity

`MachaProvider.tsx:107` generates a per-process UUID and hands it to
`ClusterPlaybackApi`, whose constructor takes it as `_viewerSession` — the
underscore being the previous author's note that it goes nowhere. It also sits in
a `useMemo` dependency array.

`Macha-Viewer-Session` is **retired**: the only trace left server-side is a
comment calling it and `Idempotency-Key` "pure restatements of what the client
already sent" (`playback.cpp:853`), and core has no reference at all. What
replaced it is better — the logical viewer session is keyed on
`request.session->id`, the **auth** session id, which *is* cluster-replicated, so
every node already knows the viewer without a client header.

Delete the UUID, the constructor parameter and the dependency.

---

## Waiting on other sessions

- **Core, committed at `c8b1bb8` (0.7.0) and beyond, not pushed.** In it:
  `abortError()` replacing twelve `DOMException` sites (this client's find);
  `PlaybackRuntime.attach` widened to `PlaybackHost`; the two watchdogs; a
  platform gate compiling core with no `DOM` lib; the container restatement; and
  the failover session close.

  **This client picks all of it up on the next build, and the build on the phone
  is older than some of it.** The `file:../macha-ts` link resolves through
  `dist/`, so what ships is whatever `dist` held when the APK was assembled.
  Verify by behaviour, not by version: with `abortError()` in the bundle a
  cancelled request surfaces as `name === 'AbortError'` rather than a
  `ReferenceError`. Grepping the release Hermes bytecode proves nothing either
  way — tried, and it returns nothing for either identifier.
- **`EndpointHealthMonitor` now cache-busts its probe URL** (`?_=<ms>`), so it
  will appear in logs here. It exists because `cache: 'no-store'` means three
  different things across the three hosts and nothing at all on Tizen 3.
- **Standby dead on arrival — retracted as a core defect.** The explanation was
  wrong (see COMPLETED). The Android TV client is the first that can promote a
  standby and will report what actually happens. **Do not re-file without that
  result.**

## Possible server change worth watching

**Tying the video transcode entitlement to the engine rather than the session** is
under consideration, so pipeline reclaim at 60 s frees the slot and a resuming
session re-acquires it. It closes the hole no client can — crashes, power loss,
force-quit — but it is **client-visible**: a session could be *refused on resume*
where today admission is guaranteed for its lifetime. That is a new state this
client would have to handle rather than treat as an error. No action until the
server session says which way it goes.

## Deferred by Tom

- **Seamless failover.** Recovery works but is not seamless, and the gap is
  transport, not player: expo-video builds its `OkHttpDataSource` internally with
  no injection point. The routes that would work are a native media3 module with a
  failover `DataSource`, or TLS on the cluster. Two attempts were made and
  reverted — see COMPLETED for what they measured.

  **If it ever comes back, it should come back to the Android TV client rather
  than here.** Its local Media3 module builds its own `DefaultHttpDataSource`
  factory, so the injection point expo-video denies this client exists there.

## Checked and already correct

Recorded so they are not re-raised.

- **Core's two endpoint normalisers do not disagree.** Raised by the core
  session as a review item — `normalizeUrls` going through `normalizeUrl` while
  `normalizeConnectionEndpoints` goes through `normalizeBaseUrl`, so a URL could
  be stored in one shape and checked in another, said to matter here because a
  scanned payload is machine-produced. Checked against the linked build rather
  than taken: the two are the same four-line function under two names, and over
  trailing slashes, doubled slashes, whitespace, `/`, `''`, a path, mixed case
  and a query, they disagree on nothing — the two list forms return identical
  arrays. The real finding is duplication that *could* drift, not a live split.
  **It reaches this client either way: it uses `normalizeBaseUrl` alone**, and
  the scan path ends in `new URL(...).origin`, so `HTTP://HOST:7438/` is stored
  as `http://host:7438` whatever the code carried. Pinned in
  `src/scan/endpoint.test.ts`.
- **Artwork** goes straight to the image element from a signed capability URL.
  `src/ui/Artwork.tsx` sends headers only when `source.requiresAuthorization`.
- **No custom HTTP header is sent or read**, on any path — including the two that
  bypass core's fetch and *cannot* set headers at all: `createDownloadResumable`
  is called with no headers option, and the native player's `VideoSource` carries
  none. Sends are `Accept`, `Content-Type`, `Authorization`; the only header read
  is `retry-after`. The server's `X-Macha-Idempotency` and
  `X-Macha-Playback-Trace` are ignored here. **The dependency this creates is
  worth stating: Macha's media URLs must need no headers**, because two of this
  client's paths could not send one if they did.
- **Audio focus and keep-awake.** expo-video requests `AUDIOFOCUS_GAIN` with
  `USAGE_MEDIA`/`CONTENT_TYPE_MOVIE` — confirmed in `dumpsys audio` on the device,
  not just in the source — and pauses rather than muting on a real focus loss.
  `useKeepAwake()` is live at `src/app/play.tsx:84`.
- **Session drop paths: one leak, and it was core's.** `load`, superseded create,
  `stop` and `update` all handle their sessions correctly; only `failover` dropped
  one, and that is fixed in core rather than here.
