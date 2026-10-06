# Macha Client (React Native)

*v0.14.0*

A phone client for [Macha](https://github.com/tomdionysus/macha), a C++ media
server for large, mostly immutable video and music libraries. It browses a
node's catalogue, negotiates playback through the node's session API, and plays
Direct, remux and transcode streams on the platform pipeline (AVPlayer on iOS,
ExoPlayer on Android).

No cloud dependency, adverts, recommendations, other-viewer activity or
telemetry. Signing in is optional: empty credentials authenticate the
`anonymous` user. Catalogue editing, ingest and administration live in the web
client; this is a viewer.

Developed with substantial AI-assisted implementation. GPL-3.0-or-later,
matching Macha; see [`LICENSE`](LICENSE).

## The project

| | |
|---|---|
| **[Macha](https://github.com/tomdionysus/macha)** (`../macha`) | The server: a C++20 distributed filesystem and media server. |
| **[`@machafoundation/core`](https://github.com/tomdionysus/macha-core-npm)** (`../macha-ts`) | Shared TypeScript library: cluster routing, sessions, playback negotiation, the model layer, per-device stores. |
| **This repo** | The phone client. |
| **[Android TV client](https://github.com/tomdionysus/macha-client-rn-android-tv)** (`../macha-client-rn-tv`) | React Native, leanback, D-pad only. A separate codebase. |
| **[Web/TV client](https://github.com/tomdionysus/macha-client)** (`../macha-client`) | Browsers, Samsung Tizen and TCL sets. Also owns administration. |

Anything not phone-specific belongs in core.

Unlike the other clients, this one does not use core's `PlaybackCoordinator`.
It calls `ClusterPlaybackResolver` directly and owns the player lifecycle in
`PlaybackProvider`, so a fix inside the coordinator does not reach this client.

## Features

- Connect by typing or scanning one or more node addresses; the rest of the
  cluster is discovered.
- Home rails; film, series, season, episode, artist, album and track views;
  library grids and search using core's sort, terms and categories.
- Continue Watching, a play queue, music playlists and offline downloads, all
  stored on the device and never sent to Macha.
- Direct/remux/transcode negotiation, with in-session mode, quality, audio,
  subtitle and version switching.
- Full-screen player with buffered seek bar, landscape fullscreen and
  picture-in-picture; a docked mini player that keeps the same session.
- Background music with a lock-screen transport; downloads play offline.
- A reaped session is regenerated on its own node; cluster status screen.
- Thumb-first: bottom navigation, 44 pt minimum controls, portrait except the
  player, double-tap to skip ten seconds. Dark only.

**Mid-playback node failover does not work on a phone.** The code is present;
see `TODO/ACTIVE.md`.

## Running it

Needs Node 20+, Xcode or Android Studio, and a reachable Macha node. On
`develop`, core is linked from a sibling checkout, so build it first:

```sh
(cd ../macha-ts && npm install && npm run build)
npm install
npm test                 # vitest, logic only
npm run typecheck
npx expo run:ios         # or: npx expo run:android [--variant release]
```

Expo Go cannot run this app: `expo-video` and `expo-screen-orientation` need a
development build.

On first launch, enter a node address (`192.168.1.20:7438`, `macha.local` or a
full URL) or scan a code. A bare host means plain HTTP on port 7438. The client
then mints an anonymous session; logging in from Settings is optional.

## Layout

```text
src/
  api/          Thin adapters over core; viewer wording for failures
  account/      What the session's roles let this viewer do
  downloads/    DownloadManager: offline copies, one session lease at a time
  state/        Per-device persistence over AsyncStorage, hydrated at startup
  playback/     Capability profile, codec probe, playback policy, audio engine
  providers/    MachaProvider (services), PlaybackProvider (owns playback)
  scan/         QR endpoint codes
  hooks/, ui/   Hooks, theme, components and every viewer label
  app/          expo-router routes
modules/
  macha-codecs/ Local Expo module: queries Android's MediaCodecList
docs/           Principles and laws shared by every Macha project
TODO/           ACTIVE.md (backlog) and COMPLETED.md (history)
```

## Talking to Macha

Every API request goes through core. The client's own requests are only those
core cannot make: the native player fetching `source.url`, the image loader
fetching artwork, and `DownloadManager` saving media and artwork. All of those
URLs come from core. Media URLs carry no header (neither the player nor the
downloader can set one); artwork sends `Authorization` only on the per-node
fallback URLs core marks `requiresAuthorization`.

## Playback invariants

These follow from [`docs/principles-and-laws.md`](docs/principles-and-laws.md).

- **Configured URLs are seeds, not a membership list.** Any node can answer any
  request; a failure on one is retried on the next.
- **`PlaybackProvider` alone owns** the platform player and the session lease.
  Moving between `/play` and the mini player never creates a session, reloads,
  seeks or renegotiates.
- **Transitions are generation-ordered.** A session whose creation completes
  after it was superseded is deleted, never activated.
- **Availability comes from the node and the device.** Direct and Remux stay in
  the menu, greyed with a reason, when the device cannot decode them.
- **Capabilities are measured where possible.** On Android, codecs, bit depth,
  HDR and Dolby Vision come from `MediaCodecList`; containers and iOS are
  still asserted.
- **Segment traffic never passes through JavaScript.** A segment's HTTP status
  cannot reach endpoint health, and expo-video's `PlayerError` carries only a
  message.

## Contributing

Read `AGENTS.md` for branches, releases, linked core and testing rules, and
`TODO/ACTIVE.md` before starting work.
