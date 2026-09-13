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

Last rationalised 2026-09-13, after 0.5.1, for a session picking this up cold.

---

## Start here

**Released: 0.5.1** (`versionCode 501`), tagged on `main` and pushed, running on
the A85. `main` and `develop` are level. Work happens on `develop`; a release is
an annotated bare-semver tag on `main`, and the version bump goes **in** the
release commit. `AGENTS.md` has the convention.

**Run `npm run version:check` before tagging — and do not trust it alone.** It
compares `package.json`, `app.json` and the tag, and is **blind to the generated
`android/` project**, which is where version drift actually happens. See the P1.

**Never push unless Tom says so in that message**, and never add
`Co-Authored-By: Claude` or `Claude-Session:` trailers — every commit was
rewritten on 2026-09-13 to remove them, which moved the `0.4.0` and `0.4.1` tags
to new SHAs.

**Dependencies are live and move under you.** `@macha/core` is a `file:` link
resolving through `dist`, so another session rebuilding core changes what this
client compiles against **mid-edit**. That happened during the 0.5.1 release and
broke the typecheck in three places. Core now stages `dist` atomically so a
partial tree is impossible, but the version can still change without warning:
**re-run typecheck and tests after any core rebuild.** Currently green on core
**0.11.0** (verified, 90 tests, 12 files).

**What is verified on hardware, which is the useful half of knowing.** Measured
on the A85 against the live cluster: the node-address rows, the media access gate
and its header warning, the access-aware empty copy, Continue Watching filtering,
seek repositioning, a wrong password, a **successful** login, and sign-in
surviving a force-stop. **Never used by a person:** the QR scanner. **Never run
on hardware at all:** the gate's `no-session` branch, which needs
`allow_anonymous` off to reach, and the node-row paste path, which `adb shell
input text` cannot emulate.

**Devices.** Deploy with `adb install -r
android/app/build/outputs/apk/release/app-release.apk` after `npx expo prebuild
--platform android` and a Gradle `assembleRelease`. **Do not skip prebuild after
a version bump** — `android/` is generated and Gradle reads the generated
`build.gradle`, so the APK will carry the old version silently.

- **Blackview A85**, serial `A85EEA0000005410`, Android 12. Has **0.5.1**, signed
  in as `rnclient` (all five roles). Its cluster is a **remote TLS** one —
  `https://macnessa.macha.network` and `ramaroja`, both on server **0.40.0**.
  `10.44.1.x` is live. **Its address and port move constantly**: `adb mdns
  services` finds it, and it drops whenever the phone sleeps.
- **Samsung SM-G996B** (Galaxy S21+), serial `RFCRA0JJN6B`, Android 15. Has
  **0.4.0** and **no endpoints configured**, so it opens on the connect screen —
  the right device for first-run and QR in one pass.
- **The Smart_TV that answers ADB is not a test target.** Verify
  `ro.product.model` before any install; it is often attached alongside the
  phone.

**Check the foreground before driving the phone.** Blind `adb input` chains have
landed in another app mid-sequence. `dumpsys window | grep mCurrentFocus` first,
and abort if it is not `foundation.macha.client`.

**Peer sessions.** Address core as **`Macha NPM Core`** — *not* the name
`ListAgents` prints for it. There are two `Macha Server` rows; the live one needs
its `[ref]`.

---

## P1 — The 0.10.0/0.11.0 port, and the one security item in it

**Status: scoped and estimated, not started.** Core is at **0.11.0** and this
client already **builds, tests and ships against it** — 0.5.1 was released on
0.10.0's `dist`, and the tree is green on 0.11.0 (typecheck clean, 90 tests,
verified rather than assumed). What is missing is *using* what those releases
added.

**The one item that is a security change rather than a tidy-up.** The bearer now
persists for **up to 30 days** in plaintext `AsyncStorage`, where before 0.5.1 it
died with the process. Same storage, same permissions — but the exposure window
went from one session to a month, readable on a rooted device or in a backup.
That is a consequence of a fix that was otherwise entirely good, and it is the
argument for sequencing this sooner rather than later.

**Checked against the Expo 57 docs rather than assumed:** `expo-secure-store`
exposes **synchronous `getItem`/`setItem`**, so it satisfies core's `StorageLike`
directly — no hydrate-at-startup cache, unlike `ClientStore`. `removeItem` wraps
`deleteItemAsync` fire-and-forget, the pattern `ClientStore.enqueue` already
uses, so the adapter is about five lines. Its config plugin also exposes
**`configureAndroidBackup`**, which closes the backup half of the exposure above
deliberately rather than incidentally.

**Estimate: ~1.5-2 hours of work, plus ~1.5 hours of build and device
verification.** The code is the small part — `expo-secure-store` ships a config
plugin, so it needs `prebuild` and a **cold Gradle build, 1h15m last time**,
almost all waiting.

The mechanical hour:

- `secureStorage` via `expo-secure-store` — the reason to do this at all.
- `signOut()` — core now revokes itself and throws on failure, which is what this
  client hand-rolled. Delete our composition, keep the rethrow.
- `probeNow()` — retires the `stop()`/`start()` radio workaround. Minutes.
- `isMachaStorageKey()` — replaces the two-prefix filter added in 0.5.1.
- `noteArtworkLoaded` — see the P2 below.

**Suggested sequencing:** take the mechanical hour and the rebuild; leave
`lastIdentityChange` as its own decision, because that is design rather than
wiring and nothing bites for a month. See the next item.

**Do not rename `@macha/core` as part of this.** Separate chore, Tom's call, and
two of three clients key the dependency that way.

---

## P1 — At 30 days a signed-in viewer silently becomes nobody


**Consequence of the accepted TTL, surfaced by core after the decision. Not a
re-raise of the TTL — this is client work.**

Core's refresh timer **does not refresh; it re-mints**, and a re-mint presents no
credentials. So at the 30-day mark a signed-in session is replaced by whatever an
empty credential set authenticates. Core's reasoning is that this is correct
because browsing beats no session.

**That reasoning does not hold on this cluster.** Anonymous here holds **no
roles**, so the re-mint does not degrade a viewer to browsing — it degrades them
to nothing. What they will actually see, mid-use and with no explanation, is the
library emptying and "This account cannot view media": the exact refused state
this client spent 0.5.0 building, arriving as if something had broken.

Worse than a logout, because a logout at least says what happened.

**What to do about it, all client-side and none of it urgent:**

- `SessionManager.lastIdentityChange` (`{from?, to?, at}`, new in core 0.10.0)
  is how we notice. Core deliberately says nothing about what the change
  *means* — a 401 cannot distinguish expiry from revoke from a
  `credential_generation` bump — so the wording is ours.
- The honest fix is to ask the viewer to sign in again **before** it happens,
  rather than explain it afterwards. Thirty days from mint is knowable in
  advance; the session carries `expires_unix_ms`.
- The access gate already renders this state correctly. What it lacks is the
  distinction between "this cluster refuses you" and "your session just aged
  out", which are the same picture and very different sentences.

**Do not fold this into the TTL item.** That one is decided and closed. This is
about what the client does when the decision takes effect.

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

## P1 — `version:check` passes while the APK lies


**Found 2026-09-13 while tagging 0.5.1.** `android/` is **generated by
`expo prebuild` from `app.json`**, and Gradle reads `versionCode`/`versionName`
from that generated `build.gradle` — not from `app.json` directly. Bump the
version and run `assembleRelease` **without** re-running prebuild, and the APK
carries the *previous* version while every source of truth says otherwise.

**It already happened.** Every build installed to the A85 today after the 0.5.0
bump was labelled **0.4.1 / versionCode 401**. The JS bundle was current in each,
so the behaviour measured is valid and none of today's findings are in doubt —
but the version the device reported was wrong throughout.

`npm run version:check` does **not** catch it: it compares `package.json`,
`app.json` and the git tag, and never looks at the generated project. So the one
guard built specifically to stop version drift is blind to the step where the
drift actually happens. That is the same shape as the original defect it was
written for — `versionCode 1` on every build, unnoticed for months because
nothing compared the two files.

**AGENTS.md already documents prebuild as part of deploying**, so the process is
right and the deviation was mine: skipping prebuild for a fast incremental build
is easy, silent and costs nothing visible until a version matters.

**Worth fixing rather than remembering:** `version:check` should read
`android/app/build.gradle` when it exists and fail when it disagrees with
`app.json`. A guard that only checks the files that already agree is not a guard.

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

## P2 — Wire `MediaApi.noteArtworkLoaded` when artwork is next touched


New in core, and it pairs with something this client already does. `Artwork.tsx`
walks candidate URLs in order and moves on only when one actually fails.
`noteArtworkLoaded(url)` — **called on success only** — keeps an artwork URL
byte-identical across an endpoint swap, which otherwise renames every poster and
re-downloads bytes the device already holds.

Related and already true: **key any artwork cache on `ref.id`, never on
`ref.url`.** `id` is the SHA-256 of the artwork bytes — content-addressed and
identical on every node — while the signed `url` is re-signed per catalogue read.
Two other clients built id→url memos to work around that churn; none was needed,
and we never built one. Server 0.40.0 quantizes `exp` into a TTL bucket, so the
URL is now stable for up to 24 hours anyway.

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

## Cluster membership can shrink and regrow on its own


**Not a fault, and it will look like one.** gbni-2 (`inverbeg`) was removed by
Tom on 2026-09-13, so the Cluster screen correctly reads **2 known endpoints**
where it used to read 3. Verified in both remaining nodes' membership files:
each lists one known peer plus a tombstone for `[inverbeg.macha.network]:7437`
at 18:47:42Z.

**That tombstone is a freshness boundary, not a permanent exclusion.** The
server has no concept of permanent removal today. If that machine is ever
reachable again and completes a handshake it rejoins, and the Cluster screen
goes back to three **with nobody having done anything**. So a node count that
changes by itself, in either direction, is the system working — do not chase it
as a bug, and do not build anything that assumes membership only shrinks when
somebody asks.

Both reachable nodes run **0.40.0**. 0.40.1 is built but undeployed and adds
only repair diagnostics under `/api/v1/status/diagnostics`, which this client
does not consume.

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
- **The package is `@machafoundation/core`; this client calls it `@macha/core`
  in 27 files.** Tom's instruction via the core session 2026-09-13: use the full
  name. Core had it wrong in 17 places of its own and has fixed them.

  **Why nothing breaks, precisely:** our `package.json` declares
  `"@macha/core": "file:../macha-ts"`, and npm lets a `file:` dependency be keyed
  under *any* name — so it aliases a package that calls itself
  `@machafoundation/core`. Imports resolve through the alias, not through the
  package's own name.

  **So the rename is not a find-and-replace.** It is the dependency key, a
  reinstall, a regenerated `package-lock.json`, and 27 files. Worth doing when
  the clients are next aligned; it buys consistency rather than correctness, and
  it is not urgent.
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
