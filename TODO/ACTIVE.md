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

Last rationalised 2026-09-13, after 0.5.0.

---

## Start here

**Branch and version.** Work is on `develop`; `main` holds releases and a release
is a tag on it. `package.json` and `app.json` say **0.5.0** (`versionCode 500`);
the newest tag on `main` is **0.4.1**, so 0.5.0 is committed but **not yet
released**. Run `npm run version:check` before tagging — it compares
`package.json`, `app.json` and the tag. The convention is in `AGENTS.md`.

**Never add `Co-Authored-By: Claude` or `Claude-Session:` trailers to a commit.**
Every commit in this repo was rewritten on 2026-09-13 to remove them, which moved
the `0.4.0` and `0.4.1` tags to new SHAs. Do not reintroduce them.

**Do not `git push`.** Tom pushes. Do the local work, then hand over the command.

**What is unverified, which is the single most useful thing to know.** The
node-address rows and the whole media-access gate have now been measured on a
device. **Two things still have never been used by a person:** the QR scanner,
and a *successful* login. A third has never run on hardware at all: the gate's
`no-session` branch, which needs `allow_anonymous` off to reach.

**Devices.** Deploying is `adb install -r android/app/build/outputs/apk/release/app-release.apk`
after `npx expo prebuild --platform android` and a Gradle `assembleRelease`; the
first build after a plugin change is long, because prebuild clears `android/`
(which is gitignored and generated — nothing is lost).

- **Blackview A85**, serial `A85EEA0000005410`, Android 12. Has **0.4.1**
  as of 2026-09-13. Endpoints configured, and they are a **remote TLS
  cluster** — `https://macnessa.macha.network` and two siblings, not a local
  node. `10.44.1.x` is live, not gone: phone `.127`, this Mac `.200`.
- **Samsung SM-G996B** (Galaxy S21+), serial `RFCRA0JJN6B`, Android 15, paired
  over wireless debugging at `192.168.1.125`. Has **0.4.0**, and **no endpoints
  configured**, so it opens on the connect screen — which makes it the right
  device for first-run, QR and login in one pass.
- **The Smart_TV that answers ADB is not a test target.** It self-identifies as
  `model:Smart_TV` and its address moves (`10.34.1.115`, later `10.34.1.116`).
  Never install here. Verify `ro.product.model` before any install.

Wireless debugging drops when a phone sleeps or the network changes, and the
advertised port is random. `adb mdns services` finds it; `adb connect` to a
stale port says `Connection refused` when the host is up and
`failed to connect` with no errno when it is up but unpaired. Pairing needs a
code from the screen and only Tom can read it.

---

## P1 — What still needs a person holding a phone

Nothing here can be done from this machine alone. The Galaxy is the better
device for the first two — clean install, no endpoints, opens on the connect
screen.

- **The camera.** Never used. The permission prompt, a real code read at a real
  distance, and the second refusal — where the prompt becomes a link to Settings
  rather than another request. The viewfinder is decoration; the scanner reads
  the whole frame.
- **A successful login.** The **wrong password** path is measured (renders the
  refusal, clears the password, keeps the username, and — the part that mattered
  — **demotes no node**; the 401 logged as a `route-success` because the node
  answered). A successful one has never run, and it answers three questions at
  once: whether the marker names a signed-in viewer, whether the library
  repopulates without a restart via the `generation` bump, and whether the
  gate's `no-role` state clears correctly.
- **Pasting a list of addresses into a node row.** `editRow`'s split path is
  unit-tested only. `adb shell input text` types character by character and
  cannot emulate a clipboard paste, so it needs a person.

**The marker's inherited claim was wrong and is retired.** It said a deployed
node "names no user". `session_json` (`macha/src/session_api.cpp:29-36`) writes
`username` beside `user_id` whenever the session names one, with a comment that
clients should not need `/users/me` for it. The device agrees independently: the
marker renders `anonymous`, which `describeAccount` can only reach with a
non-empty username. **No `users.me()` fallback needs writing.** The successful
login above confirms it for a signed-in user.

---

## P1 — Delete `firstReachable`; core ships that gate now

**Small, and it removes a mirror.** `src/app/connect.tsx` has its own pre-save
connection gate. Core's `checkEndpointConfiguration(urls, fetch, timeoutMs)`
does the same job and more: it returns `unconfirmed`, naming endpoints that
answered without a 2xx, so the screen can say "reached, but it did not identify
itself as a Macha server" rather than silently accepting a mistyped address —
and it separates "still pending" from "unreachable" behind a UI deadline, so a
slow node does not read as a dead one.

**Why a copy exists at all is the part worth keeping.** Core's gate was broken
until 0.9.0 — it counted an endpoint available only on `response.ok` against
`/api/v1/catalogue/status`, which every node answers 401 to unauthenticated, so
it could accept nothing and a fresh install could not be configured. This client
routed around a genuine defect rather than by mistake. But nobody goes back
without being told, which is how one rule ends up in four places with four
opinions. Core has recorded the reciprocal lesson: when a defect in a shared
function is fixed, tell the clients that routed around it.

If any of ours is kept, say what shape core's result does not give — core asked,
because that would be a gap in theirs rather than a preference.

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

## P2 — Two defects left in the access gate deliberately

Both raised, both declined at the time, both still true.

- **The `generation` bump fires on the healthy path.** `HomeScreen` loads via
  `useAsync(..., [media, generation])`, and access goes `unknown → granted` on
  every successful launch, so **every cold start runs the catalogue load twice**.
  A flapping cluster can oscillate it, re-loading every screen each time —
  a storm exactly when the cluster is least able to take one. It should key on
  `mayRequestMedia(access)` changing, a boolean that only flips when the answer
  does, rather than on `access.kind`.
- **One node's 401 stands for the whole cluster.** `isAuthRefusal` in
  `MediaApi.serve` collapses to the local library without trying another node,
  and the router will not walk on a 4xx (`isEndpointFailure` excludes them).
  Usually right, because sessions and roles are replicated — but core documents
  the case where it is not: during a rolling upgrade an older build's session
  carries a role vocabulary the newer one refuses.

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

- **Address the core session as `Macha NPM Core`** — *not* the name `ListAgents`
  prints for it (`Macha Core NPM Module @macha/core`), which `SendMessage`
  rejects because of the `/` and which carries no `[ref]` to fall back on. Two
  sends were wasted discovering that.
- **Both things asked of core on 2026-09-13 have landed.** `SessionManager` now
  exposes `lastMintFailure` — `{ reason: 'refused' | 'unreachable', status?,
  code?, message }` — cleared on adopt and notified through `subscribe()`.
  `reason` was core's addition and the better call: it answers the
  status-to-meaning question once, so four clients cannot each write their own
  mapping and drift. And `mintAnonymousSession` now parses the error envelope,
  so `anonymous_disabled` arrives in `code` and a wrong password reports the
  server's own wording rather than a bare status number.
- **Core is at 0.9.0 and this client is clean against it**, checked rather than
  assumed: typecheck, tests and a full release build all pass. A `file:` link
  carries no version signal, so a rebuild can deliver a breaking surface with
  nothing to announce it — **run the build after any core rebuild.** The three
  0.9.0 breaks that do not reach us: `validateAnonymousSession*` returning
  `CurrentSession | undefined` rather than `boolean`, `UserRole` gaining
  `view_status` (fatal to an exhaustive `Record<UserRole, …>`), and required new
  fields on `EndpointCandidate` and `ConnectionCheckResult`.
- **`view_status` gates the diagnostic routes only** (`/api/v1/status*`), never
  liveness. A role-less session therefore learns no cluster membership, since
  `discoverClusterEndpoints` reads `/api/v1/status`, so the failover pool stays
  at the bootstrap list until someone signs in. **Tom has ruled that correct; do
  not build around it.**
- **Core's `probeNow()` is recorded but not built.** Until it lands, the way to
  force an off-cycle health probe is `monitor.stop()` then `monitor.start()`,
  which core has confirmed is safe — it costs a probe already in flight and
  restarts the interval. Replace it when `probeNow()` exists.
- **Core has renamed itself `@machafoundation/core`.** The web
  client has migrated its imports; this client still writes `@macha/core` in 23
  files. **Not broken** — npm resolves it as an alias to the same directory, and
  a clean `npm install --dry-run` was verified — so it is a consistency chore for
  whenever the clients are next aligned, not a fire.
- **Core's accounts layer is what login here is built on, and it is untested and
  unreviewed.** The core session volunteered that: there is no test file for
  `UsersApi`, `MachaUsersApi` or `ClusterUsersApi`, and core's own suite does not
  touch them. Treat a failure in that area as plausibly core's before assuming it
  is this client's.
- **Two core bugs that bit the web client are fixed upstream and reach us on the
  next build.** A refused password no longer marks every node unhealthy —
  `mintAnonymousSessionAnyNode` records success and stops walking on 401/403,
  because every node checks the same replicated table. And session validation now
  treats 401 **and 403** as "this token is dead everywhere" rather than a
  transport fault, which matters during a rolling upgrade when an old session's
  role vocabulary is refused by every route.
- **`ClusterUsersApi.list()` is broken in core and cannot bite us.** The server
  writes the collection as `body["users"]` (`users_api.cpp:241`) while core reads
  `response.items`, so `list()` yields `undefined`. Verified in both sources
  directly. This client never calls `list()`; the web client reaches it through
  core rather than through its own code.
- **What a build actually contains is still unanswerable.** `file:../macha-ts`
  resolves through `dist/`, so an APK carries whatever `dist` held when Gradle
  ran. Verify by behaviour, not by version — with `abortError()` in the bundle a
  cancelled request surfaces as `name === 'AbortError'` rather than a
  `ReferenceError`. Grepping release Hermes bytecode proves nothing either way;
  that was tried and returns nothing for either identifier. A core tag per
  published version would close this, and has been suggested to them.
- **`EndpointHealthMonitor` cache-busts its probe URL** (`?_=<ms>`), so it
  appears in logs here. It exists because `cache: 'no-store'` means three
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

- **TV key events cannot reach a bridgeless build, and this client has no
  exposure.** The Android TV session found that `useTVEventHandler` waits on
  `onHWKeyEvent`, which only the legacy `ReactRootView` emits; bridgeless routes
  through `JSKeyDispatcher`, which never emits it and discards the event unless a
  native view holds focus. They ended up owning a Kotlin bridge over
  `Window.Callback`. Checked here rather than filed: `useTVEventHandler`,
  `TVEventHandler`, `onHWKeyEvent`, `hasTVPreferredFocus`, `tvParallaxProperties`,
  `react-native-tvos` and `Platform.isTV` return **nothing** across `src` and
  `index.js`. We are `newArchEnabled=true`, so the dead path exists — nothing
  here asks for a key event, and the only hardware input handled is the media
  transport, which arrives through track-player's service. **Inert rather than
  inapplicable:** the day this client grows a keyboard shortcut or a remote, it
  inherits the bug whole.


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
