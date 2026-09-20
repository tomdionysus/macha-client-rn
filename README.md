# Macha Client (React Native)

A phone client for [Macha](../macha) — a C++ media server for large, mostly
immutable video and music libraries. It browses a node's catalogue, negotiates
playback through the node's session API, and plays Direct/remux/transcode streams
on the platform's own pipeline (AVPlayer on iOS, ExoPlayer on Android).

There is no cloud dependency, no adverts, no recommendations, no other-viewer
activity and no telemetry. There are accounts — a session belongs to a user,
and empty credentials authenticate the `anonymous` one — but signing in is
optional rather than a gate: a cluster whose anonymous user may watch is an
ordinary configuration. Catalogue editing, ingest and cluster administration
live in the web client; this is a viewer.

Developed with substantial use of AI-assisted implementation. GPL-3.0-or-later,
matching Macha — see [`LICENSE`](LICENSE).

## Where this sits in the project

Macha has four clients, and they share their brains rather than their views:

| | |
|---|---|
| **`@machafoundation/core`** (`../macha-ts`) | The shared TypeScript library: cluster routing, session lifecycle, playback decoding and negotiation, the model layer, per-device stores. On `develop` it is linked with `file:../macha-ts`, so **core's working tree is this client's code** — a rebuild picks up uncommitted changes, and `dist/` is what actually resolves. A release on `main` pins the published package instead; see `AGENTS.md`. |
| **This repo** | The phone. |
| **Android TV client** | The television, on a local Expo module wrapping Media3 directly. |
| **Web/TV client** (`../macha-client`) | Browser, Samsung Tizen and TCL sets. Also owns administration. |

Anything not phone-specific belongs in core, not here. The convergence work is
mostly done: `src/api/` is now thin adapters over core, and four local modules
were deleted outright when core grew their equivalents.

**One difference matters when reading core's release notes.** The other three
clients drive playback through core's `PlaybackCoordinator`; this one calls
`ClusterPlaybackResolver` directly and owns its player lifecycle in
`PlaybackProvider`. So a fix made *inside* the coordinator does not reach this
client, however the release note is worded. This has caused real confusion —
check before assuming.

## Built for a phone, not shrunk to fit one

- **Thumb-first navigation.** Primary sections in a docked bottom bar; every
  control at least 44 pt tall.
- **Portrait everywhere except the picture.** The player alone unlocks rotation.
- **A docked mini player.** Leaving the full-screen player keeps playback running
  and hands it to a bar above the navigation — the same owned session, not a
  second one.
- **Gestures where a remote used to be.** Tap to toggle chrome, double-tap the
  left or right half to skip ten seconds, drag the seek bar (which commits once,
  on release).
- **Responsive density.** Grid columns follow the viewport, so cards stay roughly
  the same *physical* size rather than the same count.
- **Offline and background.** Downloads play with no node reachable; music keeps
  playing with the screen off, with a lock-screen transport.
- **Dark only.** A phone is usually watched in the dark.

## What it does

Connection gate (one node address; the cluster is discovered from it) · Home
rails · film, series → season → episode and artist → album → track navigation ·
library grids with local filter and catalogue search · Continue Watching and a
play queue, both per-device · named music playlists · offline downloads ·
playback-session negotiation with Direct/remux/transcode and in-session mode,
quality, audio, subtitle and representation switching · full-screen player with
buffered-range seek bar, fullscreen toggle and picture-in-picture · node failover
mid-playback · cluster status.

Continue Watching, the play queue, playlists and downloads are local device
state. They are never sent to Macha.

## Running it

```sh
npm install
npm test          # vitest — logic only, see AGENTS.md
npm run typecheck
npx expo run:ios          # or: npx expo run:android
npx expo run:android --variant release
```

Needs Node 20+, a reachable Macha node with the catalogue and playback APIs
enabled, and Xcode or Android Studio. **Expo Go cannot run this app** —
`expo-video` and `expo-screen-orientation` need a development build. Read the
exact versioned Expo docs (SDK 57) before writing code; the APIs have changed.

On first launch, enter any node address — `192.168.1.20:7438`, `macha.local`, or
a full URL. A bare host is assumed to be plain HTTP on port 7438. The client then
mints an anonymous session; there is no token to type in, on any Macha client.

## Layout

```text
src/
  api/          Thin adapters over @machafoundation/core. Nothing above this parses Macha JSON.
                errors, http, session, catalogue, media, playback, status,
                offlineLibrary
  state/        Per-device persistence over AsyncStorage, hydrated once at startup
  playback/     Device capability profile, seek/transform policy, audio engine
  providers/    MachaProvider (services) and PlaybackProvider (the runtime)
  ui/           Theme, primitives, composite views
  app/          expo-router routes
TODO/           ACTIVE.md and COMPLETED.md — see below
```

### Endpoints used

```text
POST   /api/v1/session
GET    /api/v1/catalogue/status | items | items/{id} | search | artwork/{sha256}
GET    /api/v1/catalogue/media/{media_id}/profile
POST   /api/v1/playback/sessions          PATCH|DELETE .../{id}
GET    /api/v1/playback/media             (playback facts)
GET    /api/v1/status | /api/v1/status/nodes/{id}
```

## Invariants worth knowing before changing playback

- **Configured URLs are bootstrap seeds, not a membership list.** Any node can
  answer any request; a failure on one is retried on the next rather than shown
  to the viewer. Discovered nodes are a startup hint, never user configuration.
- **`PlaybackProvider` is the sole owner** of the platform player and the active
  session lease. React owns presentation only, so moving between `/play` and the
  mini player never creates a session, reloads the source, seeks or renegotiates.
- **Transitions are generation-ordered.** A session whose POST completes after its
  generation was superseded is deleted rather than activated — a node never holds
  two transcode entitlements for one viewer.
- **Availability is never derived locally.** The node's advertised options drive
  the playback controls. Direct is the one exception: always offered as an
  explicit override.
- **Capabilities are honest and narrow.** Only decoders both platforms guarantee,
  no HDR claim, no decoder resolution limit (screen size is not one), and HLS
  codec lists narrower than the direct lists because ExoPlayer's HLS path is.
- **Stream and artwork URLs are short-lived capability URLs** and are fetched
  without credentials unless the source says otherwise.
- **Segment traffic never passes through `src/api/http.ts`.** The native players
  fetch segments themselves, so a segment's HTTP status cannot reach endpoint
  health — and `PlayerError` carries no status, code or cause.

## Working here

`AGENTS.md` has the rules that are easy to get wrong: why the test suite is
vitest rather than jest-expo, and the requirement to prove a test fails before
the fix it protects.

`TODO/ACTIVE.md` is the ranked backlog — read it before starting anything.
`TODO/COMPLETED.md` is the history, including **experiments that were tried and
reverted**, which is the half that otherwise costs a day to rediscover.
