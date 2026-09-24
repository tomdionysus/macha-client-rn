# Macha Client (React Native)

*v0.9.0*

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

Macha has three clients and one shared library, and the clients share their
brains rather than their views:

| | |
|---|---|
| **`@machafoundation/core`** (`../macha-ts`) | The shared TypeScript library: cluster routing, session lifecycle, playback decoding and negotiation, the model layer, per-device stores. On `develop` it is linked with `file:../macha-ts`, so **core's working tree is this client's code** — a rebuild picks up uncommitted changes, and `dist/` is what actually resolves. A release on `main` pins the published package instead; see `AGENTS.md`. |
| **This repo** | The phone. |
| **Android TV client** (`../macha-client-rn-tv`) | The television. A separate React Native codebase: nothing measured on it transfers to this one. |
| **Web/TV client** (`../macha-client`) | Browser, Samsung Tizen and TCL sets. Also owns administration. |

Anything not phone-specific belongs in core, not here. The convergence work is
mostly done: `src/api/` is now thin adapters over core, and four local modules
were deleted outright when core grew their equivalents.

**One difference matters when reading core's release notes.** The other
clients drive playback through core's `PlaybackCoordinator`; this one calls
`ClusterPlaybackResolver` directly and owns its player lifecycle in
`PlaybackProvider`. So a fix made *inside* the coordinator does not reach this
client, however the release note is worded. This has caused real confusion —
check before assuming.

## Built for a phone, not shrunk to fit one

- **Thumb-first navigation.** Primary sections in a docked bottom bar; every
  control at least 44 pt tall.
- **Portrait everywhere except the picture.** The player alone leaves portrait,
  and its fullscreen toggle locks landscape.
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

Connection gate (one or more node addresses, typed or scanned from a QR code;
the rest of the cluster is discovered) · optional login · Home rails · film,
series → season → episode and artist → album → track navigation · library grids
ordered by core's sort choices · catalogue search by core's terms and categories ·
Continue Watching and a play queue, both per-device · named music playlists ·
offline downloads · playback-session negotiation with Direct/Remux/transcode and
in-session mode, quality, audio, subtitle and version switching · full-screen
player with buffered-range seek bar, fullscreen toggle and picture-in-picture ·
a reaped session regenerated on its own node · cluster status.

**Node failover mid-playback does not work on this client** (Tom, 2026-09-21).
The code for it is there; the recovery it attempts does not succeed on a phone.
See `TODO/ACTIVE.md`.

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
a full URL — or scan a code. A bare host is assumed to be plain HTTP on port
7438. The client then mints an anonymous session; there is no token to type in,
on any Macha client. Logging in, from Settings or the account marker on Home,
is optional.

## Layout

```text
src/
  api/          Thin adapters over @machafoundation/core, plus the viewer wording
                for failures (failureMessages). This client parses no Macha JSON.
  account/      Media access: what the session's roles let this viewer do
  downloads/    DownloadManager: offline copies, one session lease at a time
  state/        Per-device persistence over AsyncStorage, hydrated once at startup
  playback/     Capability profile and codec probe, playback policy, audio engine
  providers/    MachaProvider (services) and PlaybackProvider (the playback owner)
  scan/         QR endpoint codes
  hooks/, ui/   Hooks; theme, primitives, composite views, every viewer label
  app/          expo-router routes
modules/
  macha-codecs/ Local Expo module: asks Android's MediaCodecList what it decodes
docs/           principles-and-laws.md — the laws every Macha project shares
TODO/           ACTIVE.md and COMPLETED.md — see below
```

### What talks to Macha

Every API request goes through core: session, users, catalogue, playback
sessions, status and the liveness check. The list of routes is core's to keep,
not this file's. This client's own requests are only the ones core cannot make:
the native player fetching a session's `source.url`, the image loader fetching
artwork URLs, and `DownloadManager` saving media and artwork to the device.
Every one of those URLs comes from core. Media URLs carry no header, and
cannot: neither the native player nor the downloader can set one. Artwork
sends the session's `Authorization` only on the per-node fallback URLs core
marks `requiresAuthorization`. Signed capability URLs need nothing.

## Invariants worth knowing before changing playback

The laws that order everything below are in
[`docs/principles-and-laws.md`](docs/principles-and-laws.md), shared by every
Macha project and numbered the same in all of them.

- **Configured URLs are bootstrap seeds, not a membership list.** Any node can
  answer any request; a failure on one is retried on the next rather than shown
  to the viewer. Discovered nodes are a startup hint, never user configuration.
- **`PlaybackProvider` is the sole owner** of the platform player and the active
  session lease. React owns presentation only, so moving between `/play` and the
  mini player never creates a session, reloads the source, seeks or renegotiates.
- **Transitions are generation-ordered.** A session whose POST completes after its
  generation was superseded is deleted rather than activated — a node never holds
  two transcode entitlements for one viewer.
- **Availability comes from the node and the device, never a guess.** The
  node's advertised options drive the playback controls. Direct and Remux stay
  in the menu, greyed out with a reason, when this device cannot decode what
  they would copy.
- **Capabilities are measured, not asserted, where they can be.** On Android,
  `modules/macha-codecs` asks `MediaCodecList`, and the video and audio codecs,
  bit depth, HDR and Dolby Vision all come from that. Containers and the iOS
  and web branches are still asserted; `TODO/ACTIVE.md` lists what is left.
- **Stream and artwork URLs are short-lived capability URLs** and are fetched
  without credentials unless the source says otherwise.
- **Segment traffic never passes through JavaScript.** The native player
  fetches segments itself, so a segment's HTTP status cannot reach endpoint
  health, and expo-video's `PlayerError` is `{ message }` alone: media3's
  `errorCode` is dropped inside expo-video.

## Working here

`AGENTS.md` has the rules that are easy to get wrong: branches and releases,
linked core on `develop` and published core on `main`, why the test suite is
vitest rather than jest-expo, and the requirement to prove a test fails before
the fix it protects.

`TODO/ACTIVE.md` is the ranked backlog — read it before starting anything.
`TODO/COMPLETED.md` is the history, including **experiments that were tried and
reverted**, which is the half that otherwise costs a day to rediscover.
