# Macha Client (React Native)

A React Native phone client for [Macha](../macha) — a C++ MachaDFS media server for
large, mostly immutable video and music libraries.

It browses the catalogue exposed by a Macha node, negotiates playback through the
node's playback-session API, and plays Direct/remux/transcode streams on the
platform's own video pipeline (AVPlayer on iOS, ExoPlayer on Android).

Like the web/TV client, the product is intentionally narrow. It exists to browse
and play your own media. There are no accounts, no cloud dependency, no adverts,
no recommendations, no other-viewer activity and no telemetry.

Developed with substantial use of AI-assisted implementation.

## Built for a phone, not shrunk to fit one

This is not the TV client at a smaller size. The differences are deliberate:

- **Thumb-first navigation.** Primary sections live in a docked bottom bar, not a
  top bar. Every interactive control is at least 44 pt tall.
- **Portrait everywhere except the picture.** The app is locked to portrait; the
  player alone unlocks rotation, and locks back on the way out.
- **A docked mini player.** Leaving the full-screen player keeps playback running
  and hands it to a bar above the navigation. It is the same owned session, not a
  second one.
- **Gestures where a remote used to be.** Tap the picture to reveal or hide
  chrome; double-tap the left or right half to skip ten seconds; drag the seek
  bar, which commits the seek once, on release.
- **Responsive density.** Grid columns and rail card widths follow the viewport,
  so a small phone, a large phone and a phone in landscape get cards of roughly
  the same physical size rather than the same *number* of cards.
- **Native background audio.** Music keeps playing with the screen off, with a
  lock-screen/notification transport.
- **Dark only.** A phone is usually watched in the dark, so the client commits to
  the Macha near-black/crimson palette instead of following the system scheme.

## What it does

- Connection gate: enter one node address; the rest of the cluster is discovered.
- Home with Continue Watching, Films, TV and Music rails, ordered by catalogue recency.
- Film, series → season → episode, and artist → album → track navigation.
- Library grids with an instant local filter, plus catalogue search.
- Per-device Continue Watching, limited to the last three unfinished items.
- Client-local play queue: an album queues its tracks, a season queues its
  episodes, and playback advances automatically.
- Playback-session negotiation with Direct Play, remux and transcode.
- In-session mode, quality, audio-track, subtitle-track and media-representation
  switching, driven entirely by the node's advertised options.
- Full-screen player with custom transport, buffered-range seek bar, queue
  skipping and picture-in-picture.
- Cluster status: health, node telemetry freshness, storage and cache usage.

Continue Watching and the play queue are local device state. They are never sent
to Macha.

## Requirements

- Node.js 20 or later.
- A Macha node (0.22 or later tested) with the catalogue and playback HTTP APIs
  enabled and reachable from the phone.
- For device builds: Xcode (iOS) or Android Studio (Android). Expo Go cannot run
  this app — `expo-video` and `expo-screen-orientation` need a development build.

## Running it

```sh
npm install
npm run typecheck
npx expo run:ios      # or: npx expo run:android
```

`npm start` runs the Metro dev server against an existing development build.
`npm run web` is useful for quick UI work, but the web target is not a shipping
platform for this client.

On first launch the app shows the connection gate. Enter any node address —
`192.168.1.20:7438`, `macha.local`, or a full `http://…` URL. A bare host is
assumed to be plain HTTP on port 7438, which is Macha's default. Enter an API
token only if that node sets `catalogue.api.token_file`; otherwise the client
mints an anonymous session from `POST /api/v1/session`.

## Layout

```text
src/
  api/          Wire adapters. Nothing above this layer parses Macha JSON.
    http.ts         fetch with deadlines, header merging, URL coercion
    errors.ts       error envelopes, and what counts as an endpoint failure
    endpoints.ts    endpoint registry: health, sticky preference, failover
    session.ts      anonymous session lifecycle and authenticated fetch
    catalogue.ts    catalogue wire types + per-node and cluster adapters
    media.ts        the UI-facing catalogue facade
    playback.ts     playback session create/patch/delete
    status.ts       cluster status
  state/        Per-device persistence (AsyncStorage, hydrated once at startup)
  providers/    MachaProvider (services) and PlaybackProvider (the runtime)
  playback/     Device capability profile
  ui/           Theme, primitives, and composite views
  app/          expo-router routes
```

### Routes

```text
/                       Home
/connect                Connection gate
/movies                 Film library
/movies/[id]            Film
/shows                  TV library
/shows/[id]             Series (lists seasons)
/seasons/[id]           Season (lists episodes)
/episodes/[id]          Episode
/music                  Albums / artists
/music/artists/[id]     Artist
/music/albums/[id]      Album
/search                 Catalogue search
/play                   Full-screen player
/settings               Settings
/status                 Cluster status
```

## Macha integration

### Endpoints used

```text
POST   /api/v1/session
GET    /api/v1/catalogue/status
GET    /api/v1/catalogue/items?type=…&parent=…
GET    /api/v1/catalogue/items/{id}
GET    /api/v1/catalogue/search?q=…&limit=…
GET    /api/v1/catalogue/artwork/{sha256}
GET    /api/v1/catalogue/media/{media_id}/profile
POST   /api/v1/playback/sessions
PATCH  /api/v1/playback/sessions/{id}
DELETE /api/v1/playback/sessions/{id}
GET    /api/v1/status
```

### Cluster behaviour

Configured URLs are bootstrap seeds, not a membership list. Any node can answer
any catalogue or session request, so a request that fails on one node is retried
on the next rather than surfaced to the viewer, and the node that last answered
stays preferred. A node is rested for thirty seconds after two consecutive
endpoint-shaped failures; a 404 from a node that is plainly answering is the
answer, not a reason to ask somebody else.

The client makes one best-effort membership refresh per connection, merging the
client-facing API bases the cluster advertises (`api_host`/`api_port`) as extra
candidates. Those are remembered as a startup hint, never as user configuration,
and the internal RPC `host`/`port` fields are never used to guess an API URL.

### Artwork

Artwork objects are content-addressed, so any node holding one will serve it. The
image component walks its candidates in order — the node's signed capability URL
first (no bearer token needed), then the authenticated per-node object URLs — and
moves on only when one actually fails. A failure is therefore never a permanently
blank poster while another node still has the bytes.

### Playback

`PlaybackProvider` is the application-scoped runtime and the sole owner of the
platform player and the active session lease. React owns presentation only: the
`/play` route and the docked mini player are two views of the same runtime, so
moving between them never creates a session, reloads the source, seeks or
renegotiates.

Resource-changing transitions are generation-ordered. Starting another item
releases the old lease before a replacement may be created, and a session whose
POST completes after its generation was superseded is deleted rather than
activated — a node never holds two transcode entitlements for one viewer.
Transport operations that do not change the source stay local and immediate.

Every session POST carries `Macha-Viewer-Session`, one opaque identity for the
life of the app process, and a fresh `Idempotency-Key` per admission that is
retained across endpoint retries of that same admission. Stream and subtitle URLs
are short-lived capability URLs and are loaded without the permanent bearer
token; that token is only ever used for session control.

Availability is never derived locally. `options.modes`, `quality_heights`,
`audio_streams`, `subtitle_streams` and `media_ids` drive the playback controls.
Direct is the single exception: it is always offered as an explicit override,
because a viewer who knows their device can play a file should be able to say so.

The device capability profile advertises only decoders both platforms guarantee,
and deliberately advertises no decoder resolution limit — screen size is not a
decoder limit, and claiming otherwise would force a pointless transcode.

Immutable media profiles are advisory. A `202 profile_pending` or `404` produces
less detail on a screen and nothing else; session negotiation never waits on one.

## Deliberate omissions

No account model, cloud login, discovery service, advertising, recommendation
engine, other-viewer activity, telemetry framework, global watchlist or plugin
ecosystem. Catalogue editing, ingest and cluster administration stay in the
web client — this is a viewer.

## Licence

GPL-3.0-or-later, matching Macha. See [`LICENSE`](LICENSE).
