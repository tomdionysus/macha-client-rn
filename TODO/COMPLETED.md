# Completed

Finished work, and — more usefully — what it measured or concluded. Experiments
that were reverted are recorded here too: a route that was tried and found not
to work is worth as much as one that shipped, and costs a day to rediscover.

Newest first.

---

## 2026-09-24 evening — Failure wording off core's log text; the offline fallback that could not fire

`d5a7273`. Suite **287 across 25 files**, typecheck clean against core
`5973dc5` and again at `b47773d` (dist `2e40b5cd306e`). Not on hardware; the
A85 was off ADB throughout.

### Every failure outside playback worded here

Core defined `.message` as log text on 2026-09-24, and `describeError` showed
`.message`. **Five sites, not the four ACTIVE listed**: `ErrorState` in
`src/ui/Status.tsx` read `.message` itself, on home, search, status and both
music screens. `src/api/failureMessages.ts` replaces them all with the shape
`createFailureMessage` already had: one lead per kind of failure, keyed on
status and code through core's accessors, the server's `detail` quoted in
brackets where it gave one, **never `.message` as a fallback**. A local
failure (the file system, say) gets the lead alone. Login gives one sentence
for any 401, so an unknown user and a wrong password still read the same.
Logout says the phone is signed out and the old session stays valid until
it expires. `describeError` is deleted. Eleven tests, all red first against
the old behaviour, printing the exact log line a viewer would have seen.

An unnamed playlist (core stores `''`) reads "Untitled playlist" via
`playlistName` in `labels.ts`. One test, red first.

Checked and **not used here**, as ACTIVE already said: `checkEndpointConfiguration`,
`formatPlaybackTime`, `startupPhaseLabel`, `describePlaybackSession`, the
alphabet index. `SERVER_UNREACHABLE_MESSAGE` is this client's own, in
`errors.ts`, still used by `connect.tsx`.

### `MediaApi.serve`'s fallbacks tested identity, and none could fire

Found by reading core's router (`endpointRouting.ts`, `route` and `find`)
while checking what `isUnreachable` should accept. An exhausted walk throws
`MachaClusterRouteError`, which is **not** a `MachaConnectionError`. A 4xx
ends the walk and comes out as **core's** `MachaApiError`, not this client's
class of the same name. `SessionNotStartedError` is thrown inside each
endpoint's operation, so it arrives wrapped. All three `serve` branches
tested `instanceof`, so in the app:

- **offline**: the first loads before core's health verdict, and every
  20 s `shouldProbe` request after it, showed an error where the downloads
  were the answer;
- **refused viewer**: the catch branch never fired (the `mayRequest`
  pre-check covers the steady state, so this was the first load only);
- **session not started**: fell through to an error as well.

`media.test.ts` passed throughout because it threw the bare class. Now
`isUnreachable`, `isSessionNotStarted` and `isAuthRefusal` read fields and
walk `cause`, core's rule. Four tests in the router's real shapes, three red
first; the answered-500 case stays an error. **By source, not by device.**
ACTIVE Open item 3 is the check on the phone.

---

## 2026-09-24 afternoon — Core writes no viewer text; the music lines; the probe built

Three things, none yet on hardware. Suite **271 across 24 files**, typecheck
clean against core `b5c0128`.

### Every viewer label is this client's — `0746aa3`

**Tom's ruling, given to core directly: core composes no viewer text** — it
hands over structured data and codes, and every word a viewer reads is the
client's. Core hard-cut its label helpers (`episodeLabel`, `albumLabel`,
`trackSubtitle`, `trackNumberLabel`, `formatPlaybackTime`),
`MediaSummary.subtitle`, and the `label`/`choiceLabel` fields on sorts and
categories (core `826e38a`, `f016815`, `8db0a12`, `e28d6ad`, `f75b2bd`).
Through the link, `develop` stopped compiling: **twenty errors in twelve
files.**

`src/ui/labels.ts` now owns the wording — `episodeLabel`, `episodeCode` (the
compact `S01E05` a season page lists, which had been the server's subtitle),
`albumLabel`, `trackNumberLabel`, `sortChoiceLabel`, `CATEGORY_LABELS` —
matched to what core composed so no screen changed by accident. Eight tests,
red first on the missing module. Every `subtitle` fallback is gone (mini
player, queue, player header, lock-screen artist, offline albums).

**What the types did not catch** is in ACTIVE, Open item 3: `describeError`
showing what core now calls log text, and unnamed playlists stored as `''`.

**A near miss worth keeping:** a count of `tsc` errors by `grep "error TS"`
read zero where there were twenty — `tsc` colours its output and the escape
codes break the match. Earlier checks in this run piped `tsc` to `head`, which
shows errors whatever their colour, so they stand; the exit code is the test
that cannot be fooled.

### The artist below the album — `0746aa3`

Core relayed Tom's ruling "On Music, put the artist below the album name";
**asked of Tom directly**, because it replaced the one-line "Artist - Album
(year)" built that morning. His answer: yes, and keep the year on albums.
Album cards read title / artist (link) / year. Track search cards read album
with year (link) / artist (link) / "Track 9". Music and playlist rows read
album, then artist. Core leaves the artist off albums on the artist's own
page, where it would repeat the page.

### The sheet clear of the navigation bar in landscape — `f293cf2`

`Sheet` padded only the bottom safe-area inset; in landscape on the A85 the
system back and home glyphs drew over the first option. Side insets padded.

### The reaped-session probe — `61ce107`, `a11e150`

**Tom's attribution call:** he answered "Ok, continue" right after option A
was recommended, and it was taken as A and said so to him. So an error must
persist through `errorSettleMs` — the node's window — before anything acts on
it; then `sessionAlive` → `classifyProbe` → `recoveryAfterProbe`, `gone`
regenerating on the same node, bounded by core's same-position rule
(`session-regeneration-made-no-progress`, rounded millisecond equality,
checked in core's coordinator). `ClusterPlaybackApi` gained `sessionAlive` and
`regenerate`, the latter keeping the session ledger right. Eight policy tests,
red first. **Two facts changed the plan on the way**, both found by opening
core rather than trusting the entry: `sessionAlive` has recovered the node
from the id since `0.18.0`, so a released session answers `false` — which is
why attribution comes first — and core added the two codes this client asked
for (`22281d0`), so neither throw is matched on wording.

**Unproven on hardware** — ACTIVE has the 31-minute run.

### The P1 entry as it stood before the build, kept for its reasoning

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

#### The sequence, corrected by core on 2026-09-20 — do not build the naive one

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

#### One deliberate divergence from core, recorded as a choice

On `alive === true` core does **not** fail over: it logs
`source-not-found-on-live-session` and stops, because an alive session
answering 404 for a fragment is a fragment past the end of a live plan, the
node is fine, and replacing it fixes nothing. **This client cannot tell that
case apart**, because expo-video hides the status, so `alive → failover`
stays. It is strictly better than today, where everything fails over, and
core agrees it is defensible — but it means this client will fail over on a
case core deliberately does not. **That is a choice, not a side effect.**

#### Doing it

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


---

## 2026-09-24 — Direct greyed like Remux, and the search rulings

Tom's calls of 2026-09-24. `97f8dc7` and `22935ca`, on the A85 11:20–11:25
from a build of `22935ca`'s tree with core `460ad1a`, dist `3edcfc76d7a3`
(unpublished work in it).

### Direct play greyed out like Remux — `97f8dc7`

Reverses the position `transformFor` had recorded ("a viewer who names
Direct gets what they asked for"). `directUnavailableReason` judges the
presented video against the **direct-play** decoders — not the HLS list
Remux uses — and the container against core's `containerIsPlayable`. The
remedy named follows the cause: undecodable video rules out Remux too, so
"Transcode will play it"; a container alone is what Remux replaces, so
"Remux will play it". Five tests, red first on the missing function.

**On the A85:** *Dark* S01E06 — `mode-availability { codec: 'hevc', profile:
'Main 10', bitDepth: 10, container: 'matroska,webm' }`, both Direct and Remux
greyed with *"Unavailable: this video is 10-bit and this device can only
decode 8-bit. Transcode will play it."* The container branch was not met on
hardware — no un-openable container was to hand.

### The search rulings — `22935ca`

- **Terms:** "the", "a", "an" never searched; two characters left (core's
  `isSearchable`, `searchTerms`). **On the A85:** "the" gave *"Nothing found.
  Try different search terms or filters."* **That no request was sent is
  from the code, not the log** — the catalogue path does not log requests;
  with `isSearchable` false `media.search` is never called.
- **Categories:** Movies, TV Shows, Music toggles, all on by default, passed
  as `search(query, signal, { categories })`. **On the A85:** "love" with only
  Music on returned tracks only.
- **The offline path** — this client's own search over downloads — applied
  none of the rules, so the same query answered differently in airplane
  mode. `searchOffline` now uses core's functions. Six tests, red first.
  Not exercised offline on hardware.
- **Track line:** a search card reads "Artist - Album (year)", each half a
  link, then `trackNumberLabel` ("Disc 4 · Track 1"). **On the A85:** Bon
  Jovi tracks read that way; tapping "Bon Jovi" opened the artist page (45
  albums) and created no session. The album link was not tapped. Music track
  and playlist rows now show the same wording as text; not looked at.

### Found on the way

- **The player screen follows the phone's physical orientation** — it
  unlocks rotation on arrival. That is what turned *2001* to landscape on
  2026-09-23; not a tap. A driving session has to re-derive its tap map from
  the screenshot, which is what this run did.
- **The Playback sheet runs under the navigation bar in landscape** — see
  ACTIVE.

---

## 2026-09-24 — Core's sort choices on every list, and episodes named by season

`159dce7`. Tom's rulings, relayed from the web client through core's session,
**confirmed by Tom directly** before building — two hops is exactly the
distance at which this project stops trusting a claim.

**Built on unpublished core** — `mediaSort` and `episodeLabel`, linked `dist`
`a1500863411f` at core `e7adfdd`. It builds on `develop` through the link and
**cannot reach `main` until core publishes**; that is Tom's call on the
publish, not this client's.

### What was built

- `SortControl`: the current choice as a pill reading core's `choiceLabel`
  ("Sort By Title"), the choices in a sheet, **no "Sort by" heading** —
  `Sheet` now takes an optional title for exactly that.
- `Library` orders through `orderMedia(items, key, LIBRARY_SORTS)` from
  `DEFAULT_LIBRARY_SORT`; that covers films, TV, and music's albums and
  artists, which all render through it. Search orders its results through
  `SEARCH_SORTS` from `DEFAULT_SEARCH_SORT` ("relevance" is the node's own
  order). **Music's Tracks view keeps its own chips** (Favourites, Recently
  played, Most played, Recently added are orders already) and gets no second
  control.
- `MediaCard` names an episode as its series, linking to the series, then
  core's `episodeLabel` — "Season 1 Episode 6" — linking to the season. It is
  what Continue Watching and search draw; season pages draw their own
  `EpisodeRow` and keep `S01E01`. A snapshot without `episodeNumber` falls
  back to the node's subtitle rather than losing which episode it is.
  `hrefFor(kind, id)` split out of `hrefForMedia` for links to ancestors.

### On the A85, 00:45–00:47

- Continue Watching: *Dark* S01E06 read **"Dark" / "Season 1 Episode 6"**.
  Tapping the season line opened *Dark* Season 1 and **created no session**;
  that page kept its `S01E01` rows.
- Films: **"Sort By Title"** pill, no heading; numbers order as numbers (*28
  Days Later*, *28 Weeks Later*, *28 Years Later*, then *2001*). The sheet
  offered Title, Year, Recently added; **Year** put 2025 first.
- **Not looked at:** the search screen's control, the series link, and music
  albums and artists.
- The launch reclaimed one orphan — the *2001* Remux session the install
  killed — the third time on hardware.

---

## 2026-09-23 late — The failure screen, a refused jump, a mode switch's place, title order

Four commits after the orphan reclaim; the first three seen on the A85
between 23:39 and 00:03, on builds from `a082ec6` and `0ba69ef` with core
`4a85387`, dist `c8244de61791`.

### The transport is off the failure panel — `a082ec6`

The ±10 s and play buttons painted over the failure message (19:04 and
22:37 screenshots) and can do nothing for a failed player; they are hidden
while `status === 'failed'`. The top bar stays, because it holds the Playback
menu the failure message tells the viewer to use. **Built and installed;
the failure screen itself was not re-shot on this build** — the run moved on
to the position bug below before *Dark* was failed again. Low risk, one
conditional, but unobserved.

### A refused jump says so — `a082ec6`

`repositionTo`'s `catch` was the last playback site on `describeError`.
`seekRefusalMessage`: *"Could not jump to that point just now, so playback
stayed where it was."*, node's sentence in brackets. It does not claim
playback carried on, because the viewer may be paused. Three tests, red
first on the missing function. **Not provoked on hardware.**

### A mode switch keeps its place — `0ba69ef`

**Found on the A85 at 23:42, and it explains a number left unexplained at
18:31.** *2001* at 1:08:10 in Direct, the viewer picks Remux (offered: the
sheet logged `h264 High 8-bit, blocked: false`). PATCH `{ mode: 'remux',
video: 'copy', audio: 'copy' }`, **no position**; the node began the remux
at `seekMs: 0` and the film restarted from the overture. The 18:31 Remux on
*Dark* had come back at `seekMs: 0` too. `applyUpdate` restored position only
for a Direct target. **It also cost the saved place:** Continue Watching
then held the replay's position, not 1:08:10.

Core's coordinator sends every representation update with `seekMs` at the
current position unless it is subtitle-only or the session cannot seek;
this client stands in for it and had not carried the rule.
`positionedUpdate` applies it with core's `isSubtitleOnlyPlaybackUpdate`.
Six tests — five red first on the missing function, one proving the
position survives `statedUpdate`'s restatement through core.

**On the A85, 00:02:** *2001* resumed Direct at `743734`; Remux sent
`seekMs: 814556`, the node answered `812938` (nearest random-access point),
and the picture was at **14:08** and moving, bar and header right.

Also seen on that run: **Remux on an eight-bit title works** — first time on
hardware — and **the orphan reclaim fired again in its real case**: the
`install -r` that delivered `0ba69ef` killed the process holding *2001*'s
Remux session on the LAN node, and the relaunch closed it
(`10.35.1.50::0159bf3d…`, `untracked-session-closed` 4.9 s later).

**Not done:** the quality change. The phone was turned to landscape mid-run
(1612×720); the portrait tap map no longer applied and the run stopped
rather than guess.

### Library titles sort as every other client does — `c345507`

From core's session: `src/ui/Library.tsx:33` and four sites in
`src/api/offlineLibrary.ts` sorted on raw `title.localeCompare`, so "The
Matrix" filed under T here and under M on the web and television. Checked by
opening them; all five now use core's `compareIndexedTitles`, published in
`0.18.0`. The album-track tiebreak at line 44 is left. **No test here** — it
would assert core's comparator — and not looked at on the phone.

---

## 2026-09-23 — Sessions a killed process left open are closed at the next launch

`b80ab7a`. Taken ahead of the reaped-session probe on Tom's call.

### The inherited claim, corrected

ACTIVE said *"No client fix closes this, and no core fix either: a process
that is gone cannot send a `DELETE`."* True of the dead process, not of the
next launch. Core's `docs/resolver-direct.md` — read here for the first time
today — says a resolver-direct host owns every session it creates, including
those left by a process that died, and that `stop()` acts on an id it has no
record of: core mints `${endpoint.id}::${nodeSessionId}`, recovers the node
from it (`provenanceFromId`, in `0.18.0`), and an untracked close never
throws and never charges the node. Nothing here used it.

**The cost of not doing it was on the phone the same evening:** the LAN node
refused a create `429 resource_limit`, "video transcode limit reached",
`node_healthy: true` — most likely holding this client's own orphans, one per
`install -r`.

### What was built

- `src/playback/sessionLedger.ts`: a persisted list of session ids
  (`macha.playbackSessions.v1` in `clientStore`), `takeOrphans()` once per
  process, `reclaimOrphans()` closing each and forgetting it whether or not
  the close worked.
- `ClusterPlaybackApi` records on `create` and `failover`, forgets the
  replaced id after a failover (core releases it), and forgets on a stop
  **only when it succeeds** — a failed close is what the next launch retries.
- `MachaProvider` snapshots the orphans at hydration, before any endpoint
  exists to create on, and reclaims once the registry is seeded, because the
  node is found through it.

**The trap avoided:** the playback services are rebuilt on every connection
generation, so a reclaim tied to their construction would have closed the
session playing at the time. The ledger is module-scoped and the snapshot is
taken once.

Downloads go through the same API and are covered; `resumeInterrupted`
re-queues with a fresh session, so closing the old one costs nothing.

### On the A85, 23:24–23:27

Build from `b80ab7a`'s tree, core `23583aa`, dist `66d79d1f8e4b`.

1. First launch: no reclaim (the previous build had no ledger).
2. Played *Dark* S01E06 — session `391cecc9…` on `ramaroja` (the LAN node
   had answered `503 playback_pipeline_start_failed` after 15.9 s, and core
   walked).
3. `am force-stop`, the same death a swipe-away is.
4. Relaunch: **`orphan-sessions-reclaim { count: 1 }` 236 ms after start**,
   `session-provenance-recovered` for `ramaroja::391cecc9…`, `DELETE` **204**
   in 2.3 s, `untracked-session-closed`.
5. Force-stop and relaunch again without playing: **no reclaim** — the id
   was forgotten.

Six tests, failed first on the missing module. The wiring is proven by the
run above, not by them.

**What it does not cover:** a phone not opened again within thirty minutes.
That residue is what the server-side entitlement change would close.

---

## 2026-09-23 — Try again skipped two episodes; a clear was being read as an end

**Suspected at 19:05, proven at 22:37, fixed and seen fixed at 22:47**, all
on the A85 with *Dark*. Fix in `81d1860`.

### What happened

After a failure, **Try again** on S01E01 at `2:21` created a session for
S01E03 from zero; on S01E03 at `22:20` it created one for S01E05. `retry()`
reloads the current index at the current position, so neither was a retry.

### What was measured

A `play-to-end` log line (build `9370403`, core `0ac8f21`, dist
`b67ed78c48f0`) caught it: two events **2 ms apart**, S01E03 then S01E04,
both `positionMs: 0`, `status: 'idle'`, then a create for S01E05. **The
cause is in expo-video's Android source, read and then seen:** `replace(null)`
runs `clearMediaItems()` and `prepare()`, ExoPlayer goes to `STATE_ENDED`
with no error, and `setStatus` sends `PlayedToEnd` for exactly that. `load`
sets `mediaRef` before its `replace(null)`, so the listener took the clear
as the new item finishing — advanced, and the next `load` cleared again.
The listener's comment already knew `replace(null)` could emit an end; its
guard only covered teardown, where `mediaRef` is cleared first.

Each spurious end also ran the listener's retire, marking the item finished
in Continue Watching. That is the mechanism that fits *Dark* vanishing from
Continue Watching after the 18:31 black screen — **fits, not proven for
that instance**: the row may show only a series' latest episode.

The first `load` after app start does **not** produce one (none at 22:35):
it takes a player that already had a source.

### The fix, and both directions checked

`progressedRef`: reset by `load` before the clear, set by `timeUpdate` once
the new source reports `currentTime > 0`; `playToEnd` is ignored and logged
until then. A flag rather than a position-against-duration threshold, so a
server duration longer than the stream cannot refuse a real end.

- **Try again** on S01E05 at `6:15`: two `play-to-end-ignored`, then a
  create for **S01E05 at `seekMs: 375877`**, playing at `6:25`.
- **A real end** after seeking near the end: one `play-to-end` at
  `positionMs: 2730039` of `2730334`, one advance, to **S01E06**. No
  cascade.
- **No false report from the guard fix** in between: the rebuilding seek's
  PATCH took 9.4 s, the old generation failed `Source error` during it, the
  guard declined, and `superseded-error-reported` fired **0** times because
  the player had recovered.

**No unit test**, deliberately: the fix is provider wiring this suite cannot
reach, and a pure function around one boolean would restate the code. The
device runs above are the proof.

### Seen on the way

- The LAN node answered a create `429 resource_limit` / *"video transcode
  limit reached"* with `alternative_may_succeed: true`, and core walked to
  `macnessa` correctly. The limit was most likely this session's own leaked
  sessions — every `install -r` kills the app without releasing one (the P2
  on sessions leaked at process death).
- `durationRef` survives `load` — recorded in ACTIVE.

---

## 2026-09-23 — The guard reports, Remux says why not, and a failed start is in words

Tom's three calls, the same afternoon, after the Remux black screen on the
tagged 0.8.0: **keep Remux and say why it is unavailable**; **the guard's
proposed shape is right**; **failure copy depends on the error, must be
something a person understands, and must be honest.** Three commits on
`develop`, then one build and the A85.

### Identity of what was measured

Dev build from `develop` at `15a1e0b`, installed 2026-09-23 18:59:32, still
`versionCode 800` (no bump — indistinguishable from 0.8.0 by version). Core
through the link at `../macha-ts` `51e1ad8`, **`dist:hash` `a02a2d979817`**,
`dist` built 17:55. Suite **229 across 20 files**, typecheck clean, against
that core. Every core export used — `playbackFailureDetail`,
`technicalProfileFromSession`, `videoStreamObjection`,
`unreachableEndpointFailure` and the three accessors — checked present in
the `0.18.0` tag. The APK was checked for the new strings before install.

### The supersede guard reports what it excused — `764b786`

`supersededErrorCheck` in `policy.ts` waits out exactly the guard's own
window (`seekDeadlineMs`, no new constant) and then says *report*; the
provider re-examines at that moment and, if `player.status` is still `error`
under the same generation, sets `failed` with a sentence. The decline reason
is now asked of `selfSupersededGeneration` rather than of a ref that is never
cleared, which had labelled every later seek decline as a supersede.

**On the A85, 19:04:** Direct play on *Dark* S01E01 (ten-bit HEVC). PATCH
settled `19:04:12.387`; `c2.unisoc.hevc.decoder` refused `hvc1.2.4`
`NO_EXCEEDS_CAPABILITIES` at `.07`; `failover-declined` at `.080`;
**`superseded-error-reported` at `19:04:20.392`** — settle plus the 8 s
window, to the millisecond predicted. Screen: *Playback failed*, the new
sentence, Try again and Stop, bar holding `2:21`. Before: a black screen at
`0:00` with no message, twice.

**The tests prove the policy, not the wiring.** All five failed first, but
only because the function did not exist; the defect was in provider code no
test here reaches. The device is the proof.

### Remux is kept and explained — `ee9380b`

`remuxUnavailableReason` asks core's `videoStreamObjection` of the video
stream the session presents (`technicalProfileFromSession`), against the HLS
decoder list — core's own `deliveryVideoCodecs` rule. The sheet disables
Remux with the sentence and logs `remux-availability` beside the reported
facts. Seven tests, failed first on the missing function.

**The question that decided whether this did anything:** core treats an
unreported bit depth as no objection, and says Matroska HEVC often lacks it.
*Dark* is Matroska HEVC. The facts endpoint needs a token that exists only on
the phone, and it was not pulled off the device. The log answered it:
`{ codec: 'hevc', profile: 'Main 10', bitDepth: 10, blocked: 'Unavailable:
this video is 10-bit and this device can only decode 8-bit. Transcode will
play it.' }`. Seen greyed in the sheet; **tapping it sent no PATCH.**

### A failed start in words a viewer can use — `15a1e0b`

`createFailureMessage`: one lead per kind — 401 log in, 403 wrong account,
404 gone, 429 node busy (never the account cap, which keeps its own), 400
could not prepare, 5xx could not start, nothing answered at all — each with
the server's own sentence in brackets where it stated one, except 401/403.
"Could not reach the server" is claimed only when no layer stated a status
**or** a code, because core's `unreachableEndpointFailure` is true of any
wrapped error without a status, including refusals this client raised. When
the player fails and recovery is impossible the viewer reads that, and the
codec trace goes to the log. Ten tests, failed first on the missing function.

**Not seen on hardware:** nothing failed to start, and the player-failure
path was not reached. The code paths are unexercised on a device.

### Found on the way, and left open in ACTIVE

- **Try again started the next episode from zero** — suspected spurious
  `playToEnd`; logging committed, not built. Now the top P1.
- **The transport chrome covers the failure panel.**
- **The core link had moved** six commits past `0.18.0` without a note here.
- **`:app:packageRelease` failed once for nothing** and deleted the old APK.

---

## 2026-09-23 — 0.8.0 seen running on the A85, and refusal copy reads core's `detail`

### 0.8.0 on hardware

The tagged build, not the dev tree: gated on `A85` / `A85EEA0000005410`,
`versionCode 800`, `lastUpdateTime 2026-09-21 23:31:24` before anything was
sent. Tom unlocked the phone; wireless debugging had rotated to `:45101`, and
the `G10` television had attached itself alongside it.

- Cold start signed in, catalogue and Continue Watching from `macnessa`,
  `route-success` at 1.4 s, no `FATAL` or `AndroidRuntime`.
- *Dark* S01E01 from Continue Watching: codec probe ran (20 decoders, `hevc
  [1, 4]`, `av1 [1, 4096, 8192]`, no Dolby, no HDR display); claim sent
  `h264, hevc, vp9, av1` / `hdr: not-advertised`; transcode session
  `37a4fd7b…` `201` after **14.7 s**; `c2.unisoc.avc.decoder` and
  `c2.android.aac.decoder` allocated; picture at `2:04 / 51:32` resumed from
  `1:54`, header *Transcode*; no error-level line anywhere.
- **Not verified:** sound by ear, and every path but transcode.

### `playbackFailureDetail` replaces the prefix-stripping loop

`updateRefusalMessage` and `accountSessionLimitMessage` in
`src/playback/policy.ts` now read core's `playbackFailureDetail` (core 0.18.0,
checked in the tag and in the linked `dist`) instead of stripping `Macha ...
failed:` off `.message`. The `detail()` helper is gone. Core fills `detail`
with the server's sentence in `throwResponseError`, and `endpointFailure`
keeps the original as `cause`, so the accessor reaches it through the wrapper.

Three tests written first, all three **failed against the old code**:

- **A reworded prefix leaked.** `Macha playback refused (503): ...` survived
  the regex and reached the viewer.
- **No detail quoted a log line.** A wrapped `TypeError('Network request
  failed')` came out as `(Network request failed)`; core's rule is that
  `undefined` means the host writes its own sentence.
- **The account cap showed the node address — a live bug, not a
  hypothetical.** A cap refusal through `endpointFailure` rendered *"...
  (Macha endpoint endpoint-1 failed: Macha playback request failed: account
  already holds 3 sessions (limit 3))"*. The single-prefix `replace` only
  ever handled the unwrapped case, while `classifyCreateRefusal` has found the
  cap through the wrapper since the cutover.

The existing refusal tests built plain `Error`s with prefixed messages, which
carry no `detail`; they now build `MachaPlaybackError` the way core does.
Suite 207 across 19 files, typecheck clean, against linked core `a3b40ca`
(= `0.18.0`). **Not on hardware** — no refusal was provoked on the A85.

---

## 2026-09-21 — 0.8.0 on `main`, pinned to published core 0.18.0 and pushed

**The release the previous handover called impossible.** That handover recorded
core `0.18.0` as tagged but with its npm publish halted, so there was nothing to
pin and no release could be cut. The publish landed at 19:31 the same day and
this is the cutover.

### Identity

| | |
|---|---|
| App | `0.8.0`, `versionCode 800` |
| `main` | `7932542`, pushed as a fast-forward `685fc66..7932542` |
| Core | `@machafoundation/core@^0.18.0`, **from the registry** |
| Core tarball | `registry.npmjs.org/.../core-0.18.0.tgz` |
| Integrity | `sha512-oMOvevoZ46L8jbVKrUnAdrIO9nfmmeNLNW/OaHPT33Zoi6IxVK24RTWpqMRC286UGCQo72xdwiURjuWlj2VCwA==` |
| Published | 2026-09-21T19:31:23Z, confirmed by `npm view` before pinning |
| Tagged | `0.8.0`, annotated, on `7932542` — pushed |
| On the A85 | installed 2026-09-21 23:31, `versionCode 800` — started, **not seen past the lock screen**; seen playing 2026-09-23, entry above |

### What was actually verified, and against which tree

Every check below ran against the **registry copy**, not the link, because that
is what a user's install resolves:

- `test -L node_modules/@machafoundation/core` **fails** — a real directory.
- Lockfile `resolved` is the tarball URL above, with the integrity hash. These
  two are the checks that cannot be fooled; the version string agrees with
  itself while a stale link is in place and proves nothing.
- `npm run version:check` — `0.8.0 (versionCode 800) — consistent`, comparing
  `package.json`, `app.json`, `package-lock.json` and the generated
  `android/app/build.gradle`.
- `tsc --noEmit` clean.
- **204 tests across 19 files** pass.
- **A real `expo export --platform android` produced a 4.9 MB Hermes bundle.**
  This is the only check here that exercises Metro: vitest stubs `react-native`
  and never runs the bundler, so a green suite says nothing about resolution.

`npx expo prebuild --platform android` was re-run after the version bump, which
is what put `versionCode 800` / `versionName "0.8.0"` into `build.gradle`.
Skipping it is how every build on 2026-09-13 came out labelled 0.4.1.

Afterwards on `develop`, against core `a3b40ca` through the restored link:
`version:check` consistent, `tsc` clean, the same 204 tests.

### The tag

**Tagged `0.8.0`** — annotated, bare semver, on `7932542`, pushed with the
branch. `version:check` was re-run against the tagged commit and reported
`0.8.0 (versionCode 800), tagged 0.8.0 — consistent`. That run matters more
than the untagged ones before it: the tag-against-`package.json` comparison and
the refusal of a `file:` or `link:` dependency **only fire in a release
context**, so until the tag existed neither had ever been exercised on this
tree.

### Deployed to the A85 at 23:31 — installed and started, not seen

Built from `main` at `7932542` with core from the registry (`test -L` failing,
lockfile on the tarball). `assembleRelease` took **37 minutes 21 seconds** —
778 tasks, cold because `prebuild` had cleared `android/`, and sharing the
machine with a concurrent Gradle build from `macha-client-rn-tv`. `aapt2 dump
badging` on the APK: `versionCode='800' versionName='0.8.0'`, 138 MB.

The install was gated on `ro.product.model` **and** `ro.serialno` in the same
invocation as `adb install`, because two `Smart_TV` devices were attached
alongside the phone. `dumpsys package` afterwards: `versionCode=800`,
`versionName=0.8.0`, `lastUpdateTime=2026-09-21 23:31:24`, from `700 / 0.7.0`
before — and that 700 was an unreleased dev build of the same tree, which is
exactly the case where `versionCode` is the only thing the package manager
compares.

Launched with `monkey -p foundation.macha.client`: process alive, `mFocusedApp`
is `foundation.macha.client/.MainActivity`, and `logcat` carries no `FATAL`,
`AndroidRuntime` or crash line. **But the phone is behind a secure lock
screen**, and `wm dismiss-keyguard`, `cmd statusbar collapse` and
`KEYCODE_BACK` all leave `mCurrentFocus` on `NotificationShade`. No PIN was
attempted. **So nothing about 0.8.0 rendering, the codec probe, or any of the
seven fixes has been observed at this version**; the dev build of the same tree
is the only hardware evidence, and it is not the tagged build.

### The bump went on `main`, and `develop` was fast-forwarded to match

0.7.0's release commit was made on `develop` and `main` fast-forwarded onto it.
This one was made on `main` directly, which would have left a commit on `main`
that `develop` did not have and turned the next release's fast-forward into a
conflicting merge on `package.json`. `develop` was fast-forwarded onto the
release commit before the link was restored, so `git log develop..main` is
empty again. **Check that it still is before the next release.**

### The npm asymmetry, measured a second time

Outbound needed the explicit ranged install — `npm install
@machafoundation/core@^0.18.0` — which replaced the symlink and rewrote the
lockfile in one step. Inbound needed nothing special: `package.json` back to
`file:../macha-ts` and a plain `npm install` restored both the symlink and the
`{"resolved": "../macha-ts", "link": true}` entry. Same machine, npm 11.9.0,
node 24.14.0. This reproduces the 0.7.0 measurement and does **not** settle the
television session's competing account, which concerned the
delete-then-plain-install case; that case was not re-run.

---

## 2026-09-21 — The codec claim became a measurement, seven defects were fixed, and five claims were retracted

**Everything below shipped in 0.8.0** (the entry above) and was on the A85 as
a dev build of the same tree the same evening. Moved here from ACTIVE on
2026-09-23 in the order it was written — newest first — with each section's
own retractions struck through in place rather than deleted, because the
retraction is the useful part. What this day left open is in ACTIVE as its own
items: the supersede guard that swallows a fatal error, the capabilities still
asserted, the MPEG-4 Part 2 population, AV1 ten-bit SDR, and
`playbackFailureDetail`.

### A session granted nothing now says so, 2026-09-21

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

### The capability audit, 2026-09-21 — what is measured and what is still asserted

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

#### Still asserted, and the honest split

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

#### What the complete census decided, including one thing not to build

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

#### The same run found a defect introduced today, and it is mine

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

### `videoBitDepth` is derived now too, 2026-09-21 — and the AV1 case that found it

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

#### The AV1 title, which is where this started and is not finished

*The Cannonball Run* is the one AV1 title. With `av1` added to the declared
list the client sent `videoCodecs: 'h264, hevc, vp9, av1'` — verified on the
wire — and core still chose `{mode: transcode, video: transcode, audio:
transcode}`, **from `From start`, so a live decision rather than a remembered
preference**. Bit depth is the likely objection and the file's `bitDepth` has
been asked for and not yet answered. **Do not record the AV1 widening as
demonstrated until it is.**

#### Two retractions, and they are the fourth and fifth of the day

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

### The codec claim is now a measurement, 2026-09-21 — `modules/macha-codecs`

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

#### Two decisions worth keeping

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

#### Verified on the A85, 18:56

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

### P0 2026-09-21: "remux is broken" was wrong — copying (E-)AC-3 into fMP4 stalls

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

#### Ours in it, and it is not a workaround for the server's fault

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

### Re-tested on the A85, 2026-09-21 17:50-18:10 — three of four fixes confirmed

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

### Fixed 2026-09-21, out of the A85 smoke test below

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

### Smoke test on the A85, 2026-09-21 15:00-15:30, app 0.7.0 against a live 0.48.0 cluster

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

#### What worked

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

#### Four findings

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

#### On driving this screen, because it cost most of the session again

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

### No sound on Direct Play, and the client claims a codec this device does not have (the P1 that started the day)

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

## 2026-09-21 — Playback sessions as a REST resource: the cutover, the account cap, and the 410 this client cannot see

**Client side done and confirmed on hardware.** The smoke test of 2026-09-21
15:00 found `0.48.0` already live on all three nodes, every create on `POST
/api/v1/playback/sessions`, every stream URL on the new routes, and eleven
sessions created and released with no leak. Moved here from ACTIVE on
2026-09-23. What it left open is in ACTIVE as *What the route cutover left
open*: the account cap has never fired for real, a 410 is invisible without a
native media3 module, and the adoption listing is unbuilt. The mode-switch
supersession marker this section argued for was built the same day
(`selfSupersededGeneration`, in 0.8.0) — and introduced the black-screen defect
that is now ACTIVE's first P1.

### P1 — Playback sessions become a REST resource, and the old stream route is removed outright

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

#### The route half is free here, and this was measured rather than assumed

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

#### The three breaks that are not about routes

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

#### The cap on the failover path, which is where it would have failed silently

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

#### Two defects this work found, one of them ours and load-bearing

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

#### What core settled after the first brief

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

#### Sequencing, and the trap in it for this client

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

#### `410 generation_superseded` ships in 0.48.0, and this client cannot see it

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

## 2026-09-21 — 0.7.0 built against linked core 0.17.0 and on the A85, ready for the route cutover

**The device is current for the first time since 0.6.0.** Installed and smoke
tested on the A85 against the live cluster. This build exists to be ready for
the server's route cutover, not to be released: it carries a `file:` link and
can never be tagged.

### Identity, which is the only honest way to describe this build

| | |
|---|---|
| App | `0.7.0`, `versionCode 700` |
| Client commit | `e3c5ad2`, clean |
| Core commit **at build time** | `28d6b70`, clean |
| Core `dist` hash | `b6b19b7675c5` |
| JS bundle sha256 (first 16) | `e44394668997211c` |

**Core's HEAD moved to `9c78a4a` while the smoke test ran and the `dist` hash
did not change**, so the compiled code in the APK is unaffected. That is the
third time today the hash answered a question the version string and the
commit could not, and it is why both are recorded.

### Two builds, and the first one was thrown away on purpose

The first `assembleRelease` took **20m 11s**, 737 tasks — in line with the
23m recorded on 2026-09-20 and nothing like the 1h15m this project used to
claim. It was discarded: it started at 11:31, before the failover cap fix was
committed, so its JS was a tree that could not be described.

**The rebuild took 1m 31s** — 60 tasks executed, 677 up to date. **That figure
is worth keeping: a JS-only change is ninety seconds, not twenty minutes**, so
iterating on device is far cheaper than the cold-build number suggests.

**The generated bundle was deleted by hand before the rebuild rather than
trusting Gradle's up-to-date check.** Core is consumed through a symlink, and
there is no reason to believe Gradle tracks the contents of a tree outside the
project as a task input — an "up to date" bundle would have quietly shipped
stale core. Proof rather than faith: the bundle sha moved from
`a94c2e0e65fa9851` to `e44394668997211c`.

### The smoke test

`adb install -r` over wireless ADB, **1m 20s**, no uninstall, and the signed-in
session survived it.

| Step | Result |
|---|---|
| Version on device | `0.7.0`, `versionCode 700` |
| Cold launch | Library renders: Continue Watching, Films rail, artwork, account marker, no problems banner |
| Playback | Session created in **21 ms** on the LAN node `10.35.1.50`, `mode: direct`, video decodes and advances |
| Routing | `advisory: true`/`false` both present — core `0.17.0`'s routing, which no published version emits |

**The stream URL is still the old shape**
(`/api/v1/playback/stream/{id}/<capability>/direct`) because **the server has
not cut over yet**. That is the expected reading, and it is also the thing to
re-check first after the nodes move.

### What this run could not test, stated plainly

- **The new routes.** They do not exist server-side yet.
- **The cap.** Nothing can refuse with `429 account_session_limit` until the
  server ships it, so every branch of the cap handling is still exercised only
  against errors constructed in tests.
- **Audio.** Still silent on Direct Play, unchanged and unrelated — see the
  no-AC-3 item in ACTIVE. Recorded here so that a post-cutover "plays, no
  sound" is not charged to the routes.

---

## 2026-09-21 — 0.7.0 released, and the `file:` link took three attempts to remove

**Tagged `0.7.0` (`versionCode 700`) on `main`**, pinning published core
`^0.14.0` where 0.6.0 pinned `^0.12.0`. Minor rather than patch: the only
client code change is the seek window above, but the shipped tree moves core
two minors, and node budgets now reach `ClusterPlaybackResolver`'s
per-endpoint attempt deadline with every session carrying `source.budgets`.
No client line changed for that, which is not the same as nothing changing.

**Core 0.14.0 was confirmed on npm before anything was pinned** — published
2026-09-19, `npm view` — and both symbols the new code imports were grepped
out of the **published tarball** rather than out of `../macha-ts/dist`:
`SERVER_SEGMENT_HOLD_MS` in `dist/playback/streamProtocol.js`, re-exported
through the barrel, and `PlaybackSource.budgets` in `dist/types.d.ts`.

### Removing the link is not symmetrical, and the version string lies

Three attempts, recorded because the release procedure now carries it as
step 0:

1. `package.json` edited to `^0.14.0`, `npm install` — **still a symlink**.
2. `rm -rf node_modules/@machafoundation`, `npm install` — **still a
   symlink**, rebuilt from the stale lockfile entry.
3. `npm install @machafoundation/core@^0.14.0` — a real directory, lockfile
   `resolved` a registry tarball URL.

Through all three, `require('@machafoundation/core/package.json').version`
read `0.14.0` and agreed with `package.json`, because core's `develop` carries
that version too. **`test -L` is the check that cannot be fooled**, exactly as
the procedure says. Going the other way needs no special handling: restoring
`file:../macha-ts` worked with a plain `npm install`.

### What gated the tag

`version:check` green (`0.7.0 (versionCode 700), tagged 0.7.0 — consistent`),
`tsc --noEmit` clean **against the registry copy**, 106 tests, and a real
`expo export` producing a 4.9 MB Hermes bundle — the only one of the four that
exercises Metro's resolution, since vitest stubs `react-native` and never runs
the bundler.

**Yesterday's new gate earned itself immediately.** `version:check` refused
the tree because `android/app/build.gradle` still said `0.6.0 / 600` from the
2026-09-20 build. That is precisely the failure it was written for — Gradle
reads the generated file, not `app.json` — and it fired on the first release
after being added. `prebuild --clean` regenerated it at 0.7.0/700.

**Storage keys re-checked for the 0.12.0 → 0.14.0 move**, as the core-bump
rule requires: every key in the published `dist` is `macha-` prefixed and
`OWNED_KEY_PREFIXES` (`macha.`, `macha-`) covers all eight. Nothing needed.

### One hardening that went in rather than being trusted

`metro.config.js` named `../macha-ts` in `watchFolders` unconditionally, with
a comment asserting this was harmless on `main`. A watch folder is a crawler
root rather than a hint, and a clone on a machine with no sibling `macha-ts` —
which is what a release is *for* — would have been handed a root that does not
exist. Whether Metro survives that was never measured, so the entry is now
conditional on the directory existing and the question no longer needs an
answer.

**Not verified on hardware, and no APK exists for 0.7.0.** Budgets ride the
`/status` call and need `view_status`, so a signed-out device exercises only
the published fallback — the row hardest to distinguish from the old
behaviour by watching.

---

## 2026-09-21 — The last private timeout is gone; the seek window is the serving node's own hold

**`SEEK_DEADLINE_MS = 6_000` in `src/playback/policy.ts` is deleted.** It was
equal to the server's segment hold and chosen without reference to it — the
fifth pair of independently chosen constants in this project that had to relate
and did not, and the only one left in this client.

**What replaces it.** A private `seekDeadlineMs(session)` derives the window as
`(session.source.budgets?.segmentHoldMs ?? SERVER_SEGMENT_HOLD_MS) +
SEEK_HOLD_MARGIN_MS`, negatives clamped the way core's `mediaStallTimeoutMs`
clamps them. `errorBlamesEndpoint` already took the session; `seekStillPending`
now takes one too, so the two windows cannot drift — that is the whole reason
it gained a parameter, and a test pins it.

**The margin is 2_000 ms, matching core's `HLS_WALK_HOLD_MARGIN_MS`**, which
covers the same distance for the same reason. It is deliberately **not** sized
on media3's retry behaviour, because that is the unsettled contradiction still
carried as a P1: the bytecode says a segment 500 is retried with backoff, this
repo measured one fatal on first occurrence, and nobody has put it on a phone.
If retries turn out to be real the margin is too small — it is still strictly
more room than the none there was before. The docstring says so rather than
implying a number that was reasoned from a result.

**Two behaviour changes, in opposite directions, and both were red first.**

| Node | Before | After |
|---|---|---|
| States a 10 s hold | Error at 9 s charged to the endpoint, mid-production | Excused; blamed from 12 s |
| States a 2 s hold | Excused for 6 s, four of them unearned | Blamed from 4 s |
| States nothing (floor) | Blamed from 6 s exactly | Blamed from 8 s |

**Written the way this repo asks for.** Five tests added to
`src/playback/seek.test.ts` before the change; three failed, and each failed
for the reason intended rather than incidentally — the 10 s case returned
`true` where `false` was wanted, the 2 s case `false` where `true` was wanted,
and the floor case expired two seconds early. The other two passed against the
old code and exist to pin the upper bound. A sixth pins the two windows
together. Two existing boundary tests moved from 6_000/5_999 to 8_000/7_999,
which is the fallback change and not a new assertion. 106 tests pass, `tsc`
clean against the linked core (`../macha-ts` at `a19f731`).

**Not verified on hardware, and the reason matters.** Budgets ride the status
call, which needs `view_status`, so a signed-out run exercises the fallback
branch only — and the fallback is exactly the row that is hardest to tell from
the old behaviour by watching. **Sign in before concluding anything about
budgets on a device.** What would show it: `session.source.budgets` in
`logcat` beside a `failover-declined { reason: 'seek-outstanding' }` that the
old window would not have produced.

**Everything else in 0.14.0's budget work remains free here** — the health
monitor records the figures and `ClusterPlaybackResolver` derives its own
per-endpoint attempt deadline from them without this client passing an
override.

---

## 2026-09-20 — 0.6.0 built against linked core and smoke tested on the A85, and three recorded facts turned out to be stale

**The build.** `expo prebuild --platform android` (which cleared and
regenerated `android/`), then `assembleRelease`. **`BUILD SUCCESSFUL in 23m`,
737 tasks** — against the **1h15m** this project's ACTIVE had claimed for a
cold build. Tom pushed back on the figure mid-build and was right: it was an
inherited number nobody had rechecked, wrong by more than threefold. A 138 MB
universal APK, signed with the Expo template debug keystore, installed over
0.5.1 in 1m25s over wireless ADB with no uninstall.

**A diagnostic error worth keeping, because it is the same shape as the ones
this file collects.** While the build looked stalled I found a fan of `clang`
processes at 45% each and reported the build as being deep in native
compilation. They were compiling `athena_core` — `websocket_server.cpp`,
`redis_datastore.cpp`, `mqtt_event_system.cpp` — a **different project
entirely** in another session. A plausible mechanism that fitted the symptom,
attributed without checking whose process it was. The Gradle daemon really was
busy; the evidence offered for it was somebody else's.

**Provenance of what is on the phone.** The APK reports `0.6.0 / versionCode
600` and **is not the tagged 0.6.0**. The tag was built against published core
`0.12.0`; this carries the `file:` link, whose `dist` was built at 22:15 from
core `e6527f9`, content hash `8005a969…`. The three core commits after it
touched only records and docs. **Confirmed end to end in `logcat`:** the
routing lines carry `advisory: true`, which is core's unpublished
`develop` behaviour and cannot come from any published version. So the link
demonstrably reaches the device, which is the thing a version string could
never have told us.

Also worth recording: `dist/index.js` is the barrel and its mtime does **not**
move when core rebuilds, so it is useless as a freshness signal — the same
invariance core recorded when a client hashed it and reported "nothing moved".
And `shasum` includes the path in what it hashes, so two runs from different
working directories disagree about identical bytes. Both of those briefly
convinced me core had rebuilt under the build. Hash contents, from inside the
directory.

### The smoke test, all of it on the A85 against the live cluster

Launch to library, no crash, no fatal in `logcat` at any point. Cluster
answered in **1.2 s** — against the four-second wait on a dead node recorded on
2026-09-16, so that degraded node is no longer in the path.

| Step | Result |
|---|---|
| Cold launch | Home renders: Continue Watching, Films rail, artwork, account marker, no problems banner |
| Films tab | Grid of **211** films, filter, artwork streaming in |
| Detail | Backdrop, poster, synopsis, Play |
| Play | `session-create` → `session-created` in **44 ms**, `mode: direct`, on the **LAN** node `10.35.1.50` |
| Playback | Video decodes and advances in real time; reached 6:00 of 1:55:55 |
| Seek | Three +10 s skips, **no failover and no endpoint failure recorded** |
| Mini player | Collapse kept the same session — **no `session-create`, no `generation-attempt`** — and the detail screen offered "Resume 7:47" |
| Close | `DELETE` answered in **24 ms**, `session-stopped`, no leak |

The mini-player line is the one worth keeping: the README states as an
invariant that moving between `/play` and the mini player never creates a
session, and that is now measured rather than asserted.

### Three stale facts this run corrected

- **The cluster is on server `0.47.0`**, read from `/api/v1/health`, not the
  `0.40.0` this project had recorded since 2026-09-16. That is past every
  floor core `0.14.0` needs — 0.45.0 for `look_ahead_ms`, 0.46.0 for
  `seekOffsetMs`, 0.46.2 for node budgets — so two items written as latent are
  live. **Check the node version before calling a 0.14.0 feature dormant.**
- **The LAN is `10.35.1.x`**, and there is a node at `10.35.1.50`. Playback
  chose it while the catalogue came from `macnessa` over the WAN, so this
  device is exercising both paths at once and a measurement has to say which.
- **The A85 is reached over wireless debugging**, not USB: `adb mdns services`
  lists `_adb-tls-connect._tcp`, then `adb connect`. A sleeping phone
  screencaps as **solid black** with the app still correctly in the foreground,
  which reads exactly like a rendering failure. `dumpsys power` for
  `mWakefulness`, then `KEYCODE_WAKEUP` and `wm dismiss-keyguard`.

**And one consequence measured rather than reasoned:** a freshly minted
anonymous session is answered **403** by `/api/v1/status` on the 0.47.0 node.
Node budgets ride that route, so a client that is signed out gets the
published floor and never the node's own figure. Sign in before concluding
anything about budgets.

## 2026-09-20 — What core 0.13.0 and 0.14.0 changed, read from the published tarballs

**The detailed reading behind the entry below it**, moved here from ACTIVE on
2026-09-23 once core reached 0.18.0 and the release pinned it. The table's
"reaches this client?" column is still the map for the two items that remain
open from it — the reaped-session probe (`sessionAlive` / `regenerate`) and
the remux-only remainder of `seekOffsetMs`.

### What core 0.13.0 and 0.14.0 changed, read from the published tarballs

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

## 2026-09-20 — back onto the link for development, and what 0.13.0 and 0.14.0 turned out to mean here

**Tom's rule, stated this evening and now in `AGENTS.md`'s spirit if not yet
its text:** `develop` links core with `file:../macha-ts`; `main` pins the
published package; a `file:` dependency never reaches `main`; and a release
confirms the core version is *actually on npm* before pinning it. This
reverses the 2026-09-15 "registry only" decision recorded two entries below.
Core's own ACTIVE records the same ruling for all four clients the same day,
after it had told this client the opposite within the same minute — on the
strength of the Android TV `AGENTS.md`, a client repo's belief rather than
Tom's instruction. Where a repo rule and Tom disagree, Tom decides.

**Done here:** `package.json` back to `file:../macha-ts`, `npm install`,
symlink and `{"resolved": "../macha-ts", "link": true}` confirmed,
`metro.config.js` naming `../macha-ts` in `watchFolders` again. Typecheck
clean and 100 tests green against core's `develop` `dist` (0.14.0 plus 32
unpublished commits, rebuilt 22:06). Also typechecked, without editing
anything, against the published 0.13.0 and 0.14.0 tarballs by pointing `tsc`
at each `dist` — clean both times.

**`version:check` grew three checks, each for a drift that had already
happened.** It refuses a `file:` or `link:` dependency on a tagged commit or
on `main` (the release gate, made mechanical); it compares the lockfile's own
`version`, which had sat at `0.5.1` through the whole 0.6.0 release because
`npm install` only rewrites it when something else changes; and it compares
the generated `android/app/build.gradle` when one exists. **That last one
fired immediately:** `android/` still says `0.5.1 / 501`, so no 0.6.0 APK was
ever built with a prebuild from this tree. The 2026-09-13 P1 about the script
being blind to the generated project is closed by this.

**What 0.13.0 and 0.14.0 mean for a host of this shape, read from the
tarballs rather than the release notes.** Storage keys are identical from
0.12.0 through `develop`. 0.13.0's coordinator work does not reach here, but
its resolver half does: `sessionAlive` and `regenerate` are public on
`ClusterPlaybackResolver`, and this client's `failoverSource` has exactly the
fault they exist for — a player error after a node reaps a paused session
charges the node that answered honestly. 0.14.0's node budgets arrive on
`session.source.budgets` and the resolver derives its own attempt deadline
from them with no change here; the one private timeout left is
`SEEK_DEADLINE_MS = 6_000`, which equals the server's segment hold exactly.
Both are P1 in ACTIVE.

**Core's summary, requested and received the same evening, was right on every
row but one**, and the wrong one was "nothing in 0.13.0 reaches you" — said
in the same message that named `regenerate` as a method the container
restatement applies to. Checked in the 0.13.0 `d.ts` rather than argued, and
sent back with the file. Its correction of this end — `probeNow()` lives on
`EndpointHealthMonitor`, not `SessionManager` — was right, and the earlier
ACTIVE note that `probeNow` was "recorded but not built" had been stale since
at least 0.12.0: every symbol on the port list is in the installed `dist`.

**The A85 run of 2026-09-16, moved here from ACTIVE.** Core `0.12.0`, release
build, signed in as `webclient`, against the WAN cluster (`macnessa`/
`ramaroja`, HTTPS, server 0.40.0), which was `degraded` at the time — 2 of 3
nodes online. Tom flagged that, and it matters for reading any of it.

- **The cold-start offline flip did not reproduce, and the claim was mine.** I
  had reported — here, and to core, who changed `SessionNotStartedError`
  partly on the strength of it — that a healthy cluster would be marked
  offline on every cold start. On hardware, with the fix and with the branch
  deliberately removed, both cold starts show the spinner then the full
  library. Most likely the next successful request calls `reportReachable()`
  before anything observable depends on the flag. **What is still true:**
  removing the branch makes `serve` classify a `SessionNotStartedError` as a
  transport failure, proved by `api/media.test.ts`. Keep it as correctness,
  not as a fix for a measured harm.
- **Throughput is measured as not ranking, by core's own log:** at 211 ms on
  every launch, `[endpoint-registry] throughput-unavailable {reason:
  'insufficient-samples', minimumSamples: 2}`. Core abstains loudly, as it
  said it would.
- **Catalogue sizes against the 32768 B sampling floor**, `media_viewer`
  token: `items?type=movie` 416241 B (12.7x), `track` 849912 (25.9x), `album`
  240298 (7.3x), `show` 66911 (2.0x), `artist` 42517 (**1.3x**);
  `/api/v1/status` 5395, `catalogue/status` 300 and `/api/v1/health` 52 all
  under. Browse-driven, confirmed independently of the web client. The query
  parameter is `type`, not `kind`; a wrong one returns the whole catalogue
  (2.9 MB).
- **The URL-attribution risk I raised cannot occur:** `MachaPlaybackResolver`
  builds the stream URL as `${baseUrl}${path}` and `recordTransferByUrl`
  matches `startsWith(baseUrl + '/')`. Holds by construction. Closed.
- **`ReactNativeJS` logs reach `logcat` from a release build.** I had told
  core client-side state was unobservable without a debug build. Wrong, and
  it is the cheapest instrument this client has.
- Two things left open and carried in ACTIVE: a four-second wait on a dead
  node before the walk reaches `ramaroja`, and the device signing itself out
  between runs.

**0.6.0 itself** — "core under its real name, and throughput gets something to
measure" — was the registry move and the 0.12.0 migration recorded in the two
entries below, tagged on 2026-09-16. `versionCode 600`.

## 2026-09-15 — core 0.12.0: throughput became core's, and one viewer-visible regression was caught before it shipped

**Migrated the same day it published**, gated on `npm view` answering `0.12.0`
rather than on being told it had. That gate mattered: an earlier "publish is
complete, refactor now" was wrong — the publish had failed `EOTP` and never
uploaded — and the check caught it before anything was written. The tell worth
keeping, from the Android TV client: an absent version with an *unmoved*
`time.modified` is "did not happen", an absent version with a moved one is
"still propagating". The extra instrument from this end: grep the installed
`dist` for the new symbols, because an absent version says nothing about why
while absent symbols say there is nothing to refactor against regardless.

**What changed here.** `EndpointRegistry`'s third constructor argument is gone;
core attaches the bandwidth store inside `createMachaServices`. This client
hand-builds its services, so it attaches its own via the public
`attachBandwidth` — and **has to**, because `recordTransferByUrl` is a silent
no-op with nothing attached. `DownloadManager` now reports through
`recordTransferByUrl` with the session's source URL. `throughputSample.ts` and
its six tests were untouched, which is what made the migration one call.

**The client id is a function, and that is the whole of the fix to a NO-GO.**
Core originally derived its store key from `MachaClientConfiguration.clientId()`
inside `createMachaServices`, which mints when the key is absent. This client's
services are built **during render**, before `clientStore` hydrates, and an
unhydrated cache is indistinguishable from an absent key — so it would have
minted a fresh identity every launch and orphaned the previous record, silently,
looking exactly like the axis not working. That was returned as a NO-GO.

Core's remedy was better than the one proposed to it. Rather than restoring a
`clientId` option — which would have handed the wiring back to hosts, the thing
Tom had overruled — core made the id lazy and non-minting, and stopped
`restore()` latching while it is undefined. The framing it built on came from
this client and is worth keeping: **a read that returns nothing is harmless; a
write that invents an identity destroys the previous one.** So this client
passes `() => clientStore.isHydrated ? getClientId() : undefined`, and
`state/clientId.test.ts` pins the hazard.

### The regression that was caught, which is the part that mattered to a viewer

`SessionNotStartedError` extends `MachaConnectionError` — chosen deliberately so
that `MediaApi.serve`'s downloaded-library fallback keeps working untouched. It
does. It also routes through the branch that calls `reportUnreachable()`, and
**that error arrives before `start()` on every cold start**: `AppShell` holds
children back until `hydrated`, so screens mount on the render it flips, and
React runs child effects before parent effects, so a screen's first load fires
before the provider's effect starts the session manager.

A healthy, answering cluster would therefore be marked offline on every launch,
and `shouldProbe()` suppresses real requests for twenty seconds after that — so
the viewer gets their downloads instead of their library, every time they open
the app. Nothing errors, nothing logs.

Fixed with a `SessionNotStartedError` branch ahead of the transport one, serving
the stored library without touching connectivity — the same reasoning the
refusal branch already carried. Proved by deleting the branch: `media.test.ts`
fails on exactly the `isOffline` assertion and nothing else.

**One instruction from core was declined after checking.** It asked for the
comment in `account/access.ts` describing a tokenless 401 to be corrected as
stale. Reading `fetch` in the installed build rather than the release note:
it throws only when there is no registry, and a request made after a *failed
mint* still goes out tokenless and still returns its 401 unretried, because core
re-mints only when it actually sent a token. The comment was already right and
was left alone. The provider's version was widened instead, since "early" now
fails in two different ways.

**Measured, finally, by the web client, and it changes what this axis is:** a
movie listing is 416 KB and shows 67 KB, both over the 32 KB sampling floor —
but `/api/v1/status` is 5.7 KB and `catalogue/status` 303 bytes, both under. The
health cycle contributes no throughput evidence at all. Throughput is
browse-driven, and on this platform a viewer who resumes a download without
browsing produces none except through `DownloadManager`. Refusing to estimate
that number was right; the unpaginated-therefore-large inference held for the
catalogue calls and would have been wrong applied to the status traffic.

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

**The middle one is in doubt as of 2026-09-20 and is carried as a P1 in
ACTIVE.** Disassembling `DefaultLoadErrorHandlingPolicy` out of the
Gradle-cached media3 artifacts says an HTTP status error is *not* in the
do-not-retry set and should fall through to a backoff retry. Either the
disassembly is being read too narrowly — the HLS chunk path may go terminal
above the policy — or this device observation was something other than what it
was recorded as. **Nothing here is retracted**: it was measured on hardware and
the reading was not. But anything that leans on "the hold is the entire retry
budget in the system" should check the P1 first.

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
