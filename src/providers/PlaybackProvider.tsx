import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ClusterPlaybackApi, PlaybackPreferencesUpdate, PlaybackSession, PlaybackUpdate } from '../api/playback';
import type { PlaybackMode } from '../types';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import {
  choosePlaybackInstruction,
  degradeInstruction,
  restatePreferencesClearedByMode,
  technicalProfileFromCatalogue,
  type PlaybackInstruction,
  type PlaybackMediaFacts,
  type StreamInstruction,
} from '@machafoundation/core';
import {
  ensureAudioEngine,
  loadAudioTrack,
  stopAudio,
  TrackPlayer,
  type AudioTrackInfo,
} from '../playback/AudioEngine';
import { Event as TrackEvent, State as TrackState } from 'react-native-track-player';
import {
  accountSessionLimitMessage,
  audioCopyable,
  buildOrder,
  classifyCreateRefusal,
  createFailureMessage,
  errorBlamesEndpoint,
  generationLocalMs,
  restoredVolume,
  seekRefusalMessage,
  seekRequiresReposition,
  seekStillPending,
  selfSupersededGeneration,
  supersededErrorCheck,
  type PendingSupersede,
  spendsFailoverBudget,
  statedUpdate,
  titlePositionMs,
  updateRefusalMessage,
  transformFor,
} from '../playback/policy';
import { setAudioRemoteHandlers } from '../playback/audioRemote';
import type { MediaApi } from '../api/media';
import { playbackFailureCode, progressFor } from '@machafoundation/core';
import { PLAY_COUNT_THRESHOLD_MS } from '../state/musicLibrary';
import type { MediaSummary } from '../types';
import { useMacha } from './MachaProvider';

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackState {
  status: PlaybackStatus;
  media?: MediaSummary;
  session?: PlaybackSession;
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  playing: boolean;
  buffering: boolean;
  error?: string;
  queue: MediaSummary[];
  queueIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface StartOptions {
  /** Where to begin. Omitted means "resume from the remembered position". */
  seekMs?: number;
  preferences?: PlaybackPreferencesUpdate;
}

interface PlaybackContextValue extends PlaybackState {
  player: VideoPlayer;
  /** True while a source-changing operation is in flight and controls should wait. */
  busy: boolean;
  start(items: readonly MediaSummary[], index: number, options?: StartOptions): Promise<void>;
  playItem(media: MediaSummary, options?: StartOptions): Promise<void>;
  toggle(): void;
  seekTo(positionMs: number): void;
  seekBy(deltaMs: number): void;
  skipNext(): Promise<void>;
  skipPrevious(): Promise<void>;
  /** Jump straight to a queue entry by its index in `queue`. */
  jumpTo(index: number): Promise<void>;
  setShuffle(shuffle: boolean): void;
  setRepeat(repeat: RepeatMode): void;
  /** Insert directly after the current item, without disturbing what follows. */
  playNext(items: readonly MediaSummary[]): void;
  addToQueue(items: readonly MediaSummary[]): void;
  removeFromQueue(index: number): void;
  moveInQueue(from: number, to: number): void;
  /** A source-generation change: mode, quality, audio, subtitles, or media representation. */
  applyUpdate(update: PlaybackUpdate): Promise<void>;
  stop(): Promise<void>;
  retry(): Promise<void>;
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(undefined);

export function usePlayback(): PlaybackContextValue {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used inside <PlaybackProvider>.');
  return value;
}

/** Progress is checkpointed at most this often; it is a resume hint, not telemetry. */
const PROGRESS_CHECKPOINT_MS = 5_000;
/**
 * How many replacements to admit before telling the viewer a title will not play.
 *
 * Bounded because a title that is genuinely broken fails identically on every
 * node, and walking a whole cluster to prove it only delays the message.
 */
const MAX_FAILOVER_ATTEMPTS = 2;

/**
 * How long playback must survive before the budget above is forgiven.
 *
 * The budget exists to stop a broken title cycling the cluster, and those
 * failures arrive back to back. A node that dies half an hour into a film is a
 * different event from the one that died at the start, and should not be
 * refused because of it — so the count is a burst limit rather than a lifetime
 * one.
 */
const FAILOVER_BUDGET_RESET_MS = 60_000;

/**
 * What a viewer reads when the player failed and no recovery was possible.
 *
 * Claims only what is known: the stream stopped, recovery did not work. The
 * player's own message is a codec or network trace and expo-video hides the
 * HTTP status that would say more.
 */
const PLAYER_FAILURE_MESSAGE = 'This stream stopped playing and could not be recovered. Try again.';

/**
 * What a viewer reads when a change they asked for left the player in error.
 *
 * Honest about what is known and no more: the change was theirs, the stream
 * after it did not play, and expo-video never says why — so "may", and a
 * remedy they can reach from where they are. Not the player's own message,
 * which on the A85 was "MediaCodecVideoRenderer error, index=0".
 */
const SUPERSEDED_FAILURE_MESSAGE =
  'Playback stopped after the change and did not recover. This device may not be able to play the stream that way. '
  + 'Try another mode from the playback menu, or try again.';

/** Restarting an item that has barely begun is more useful than resuming it. */
const RESUME_FLOOR_MS = 10_000;


const IDLE: PlaybackState = {
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  bufferedMs: 0,
  playing: false,
  buffering: false,
  queue: [],
  queueIndex: 0,
  shuffle: false,
  repeat: 'off',
};

/**
 * The application-scoped playback runtime: the sole owner of the platform
 * player and of the active Macha session lease.
 *
 * React owns presentation only. The full-screen player route and the docked
 * mini player are two views of this one runtime, so moving between them — or
 * remounting either — never creates a session, reloads the source, seeks or
 * renegotiates playback.
 *
 * Resource-changing transitions are generation-ordered: starting another item
 * closes the old session before a replacement may be created, and a session
 * whose POST completes after its generation was superseded is deleted rather
 * than activated. Transport operations that do not change the source stay
 * local and immediate.
 */
export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const {
    media: mediaApi,
    playback: playbackApi,
    continueWatching,
    queue: queueStore,
    musicLibrary,
    downloads,
    downloadManager,
    generation,
  } = useMacha();

  const player = useMemo(() => {
    const instance = createVideoPlayer(null);
    instance.timeUpdateEventInterval = 0.5;
    instance.staysActiveInBackground = true;
    instance.showNowPlayingNotification = true;
    return instance;
  }, []);

  const [state, setState] = useState<PlaybackState>(IDLE);
  const [busy, setBusy] = useState(false);

  const sessionRef = useRef<PlaybackSession | undefined>(undefined);
  const mediaRef = useRef<MediaSummary | undefined>(undefined);
  const queueRef = useRef<{ items: MediaSummary[]; index: number }>({ items: [], index: 0 });
  /** Play order over `queueRef.items`; identity when shuffle is off. */
  const orderRef = useRef<number[]>([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>('off');
  /** Guards one play-count increment per started item. */
  const countedPlayRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);
  /**
   * Which engine owns the current item. Music runs on the native audio player
   * for a real media session — notification transport, headset buttons,
   * tap-to-open — while video stays on expo-video.
   */
  const engineRef = useRef<'video' | 'audio'>('video');
  const lastCheckpointRef = useRef(0);
  const durationRef = useRef(0);
  /**
   * The runtime as the node reports it, which the player may not override.
   *
   * A transformed stream is a growing playlist, so the player's own `duration`
   * describes what has been produced rather than what the film is. Letting that
   * win pinned the seek bar to its right-hand end and left the remaining time
   * reading `−0:00` for the whole movie. Zero means nobody authoritative has
   * said yet, and only then is the player's figure worth having — a downloaded
   * file played off the disk has no session and no profile, and there the
   * player is the only source there is.
   */
  const knownDurationRef = useRef(0);
  const positionRef = useRef(0);
  /**
   * Whether the source now in the player has reported any progress.
   *
   * **The only thing that tells a real end from the one `load` causes.**
   * expo-video empties the player on `replace(null)` with `clearMediaItems()`
   * and `prepare()`, which leaves ExoPlayer in `STATE_ENDED` with no error, and
   * it sends `playToEnd` for exactly that state. `load` makes that call after
   * pointing `mediaRef` at the item it is loading, so the listener took it as
   * that item finishing: it retired it from Continue Watching and advanced —
   * and the next `load` did it again. Measured on the A85 2026-09-23 22:37:
   * Try again on S01E03 logged two ends 2 ms apart, both `positionMs: 0`,
   * `status: 'idle'`, and created a session for S01E05.
   *
   * A flag rather than a threshold on position against duration: a server
   * duration a few seconds longer than the stream would make a threshold
   * refuse genuine ends, and auto-advance is the thing being protected.
   */
  const progressedRef = useRef(false);
  /**
   * How far the player has buffered, as its own ref.
   *
   * Read by `seekTo` to decide whether a seek lands beyond what the node has
   * produced. State is no use there: `seekTo` reaches us from a gesture handler
   * created once, which would capture the first render's value forever.
   */
  const bufferedRef = useRef(0);
  /**
   * What the video player's volume should be, for `restoredVolume` to measure a
   * duck against. Constant today: nothing in this client offers an in-app volume
   * control, because a phone already has hardware buttons and a system slider.
   * It is a ref rather than a literal so that adding one later cannot forget
   * this path and leave the viewer fighting an automatic restore.
   */
  const intendedVolumeRef = useRef(1);
  /**
   * A seek the player has been asked for but has not yet reached.
   *
   * Both engines keep reporting the *old* position for a few frames after a
   * seek, and on a transformed stream for a good deal longer. Accepting those
   * reports drags the bar back to where the viewer just left, then jumps it
   * forward when the seek lands — and writes the stale position to Continue
   * Watching on the way past. So reports are ignored until one arrives near the
   * target, or until the deadline, which is the guard against a seek that never
   * lands leaving the position frozen for good.
   */
  const pendingSeekRef = useRef<{ targetMs: number; atMs: number } | undefined>(undefined);
  const failoverAttemptsRef = useRef(0);
  const lastFailoverAtRef = useRef(0);
  const failoverInFlightRef = useRef(false);

  useEffect(() => () => player.release(), [player]);

  // Restore a resumable queue on a cold start. This loads intent only: no
  // session is created until the viewer actually presses play.
  useEffect(() => {
    const restored = queueStore.load();
    if (!restored) return;
    queueRef.current = { items: restored.items, index: restored.currentIndex };
    orderRef.current = buildOrder(restored.items.length, shuffleRef.current, restored.currentIndex);
    setState((current) => ({ ...current, queue: restored.items, queueIndex: restored.currentIndex }));
  }, [queueStore]);

  const checkpoint = useCallback(
    (positionMs: number, durationMs: number, force = false) => {
      const media = mediaRef.current;
      if (!media || durationMs <= 0) return;
      const now = Date.now();
      if (!force && now - lastCheckpointRef.current < PROGRESS_CHECKPOINT_MS) return;
      lastCheckpointRef.current = now;
      continueWatching.update(progressFor(media, positionMs, durationMs));
      queueStore.updatePosition(positionMs);
    },
    [continueWatching, queueStore],
  );

  /** Tears down the owned lease. Failure is not surfaced: the node expires idle sessions anyway. */
  const releaseSession = useCallback(
    async (session: PlaybackSession | undefined) => {
      if (!session) return;
      try {
        await playbackApi.stop(session);
      } catch {
        // Session expiry and explicit cleanup are equivalent to the client.
      }
    },
    [playbackApi],
  );

  const stop = useCallback(async () => {
    generationRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = undefined;
    mediaRef.current = undefined;
    checkpoint(positionRef.current, durationRef.current, true);
    player.pause();
    player.replace(null, true);
    void stopAudio();
    engineRef.current = 'video';
    setState((current) => ({ ...IDLE, queue: current.queue, queueIndex: current.queueIndex }));
    await releaseSession(session);
  }, [checkpoint, player, releaseSession]);

  /**
   * Loads one queue entry: closes the previous generation, negotiates a fresh
   * session, and hands the resulting stream to the platform player.
   */
  const load = useCallback(
    async (items: readonly MediaSummary[], index: number, options: StartOptions = {}) => {
      const media = items[index];
      if (!media) return;

      const myGeneration = ++generationRef.current;
      const previous = sessionRef.current;
      sessionRef.current = undefined;
      mediaRef.current = media;
      // Each item gets its own budget: a title that exhausted the cluster says
      // nothing about the next one.
      failoverAttemptsRef.current = 0;
      lastFailoverAtRef.current = 0;
      failoverInFlightRef.current = false;
      const sameQueue =
        queueRef.current.items.length === items.length &&
        queueRef.current.items.every((existing, position) => existing.id === items[position]?.id);
      queueRef.current = { items: [...items], index };
      // Keep an existing shuffle order across an ordinary advance; only a
      // genuinely different queue earns a reshuffle.
      if (!sameQueue || orderRef.current.length !== items.length) {
        orderRef.current = buildOrder(items.length, shuffleRef.current, index);
      }
      countedPlayRef.current = undefined;
      positionRef.current = 0;
      // Before the `replace(null)` below, whose `playToEnd` must not count.
      progressedRef.current = false;
      lastCheckpointRef.current = 0;
      knownDurationRef.current = 0;

      // **`busy` is owned from here to the `finally` below, with nothing
      // outside it.** It used to be set here while the `try` began forty
      // lines further down, so anything thrown in between — `stopAudio`, a
      // download failing to load — stranded the flag and left the Play button
      // disabled until the app was restarted. The generation guard already
      // stopped a superseded load from clearing it; what was missing was any
      // guarantee that this load reached a `finally` at all.
      setBusy(true);
      try {
        setState((current) => ({
          ...current,
          status: 'loading',
          media,
          session: undefined,
          positionMs: 0,
          durationMs: media.durationMs ?? 0,
          bufferedMs: 0,
          buffering: true,
          error: undefined,
          queue: [...items],
          queueIndex: index,
        }));

        // The old lease is released before a replacement is requested, so a node
        // never holds two transcode entitlements for one viewer.
        const audio = media.kind === 'track';
        engineRef.current = audio ? 'audio' : 'video';
        player.pause();
        player.replace(null, true);
        // The audio engine owns music entirely, notification included, so
        // expo-video must not also claim a media session or a background slot.
        player.staysActiveInBackground = false;
        player.showNowPlayingNotification = false;
        if (!audio) await stopAudio();
        await releaseSession(previous);
        if (generationRef.current !== myGeneration) return;

        const remembered = continueWatching.positionFor(media.id);
        const seekMs = options.seekMs ?? (remembered > RESUME_FLOOR_MS ? remembered : 0);

        // A downloaded original is played straight off the disk: no session, no
        // capability URL, no node. This is the whole point of downloads — in
        // airplane mode there is nothing to negotiate with.
        const stored = downloads.localFor(media);
        if (stored?.localUri) {
          if (audio) {
            await loadAudioTrack(audioTrackFor(media, stored.localUri, stored.artworkUri, false), seekMs);
          } else {
            player.replace(
              {
                uri: stored.localUri,
                contentType: 'auto',
                metadata: { title: media.title, artist: nowPlayingArtist(media), artwork: stored.artworkUri },
              },
              true,
            );
            if (seekMs > 0) player.currentTime = seekMs / 1000;
            player.play();
          }
          // Off the disk there is no node to ask, so the player's own reading is
          // the only one available and is left free to supply it.
          knownDurationRef.current = 0;
          durationRef.current = media.durationMs ?? 0;
          setState((current) => ({
            ...current,
            status: 'ready',
            session: undefined,
            durationMs: media.durationMs ?? current.durationMs,
            positionMs: seekMs,
            buffering: false,
          }));
          // `busy` is cleared by the `finally`; this path only returns.
          return;
        }

        const { instruction, durationMs: knownDurationMs } = await chooseInstruction(
          mediaApi,
          playbackApi,
          media,
          // `'choose'` is core's client-side sentinel for "you decide". This
          // client always decides, so it never sets one — narrowing here keeps
          // that true at the type level rather than by convention.
          options.preferences?.mode === 'choose' ? undefined : options.preferences?.mode,
        );
        const session = await createSession(playbackApi, media, instruction, seekMs, options.preferences);
        if (generationRef.current !== myGeneration) {
          // A late lease belonging to a superseded generation is never activated.
          await releaseSession(session);
          return;
        }
        sessionRef.current = session;
        if (audio) {
          await loadAudioTrack(
            audioTrackFor(media, session.source.url, nowPlayingArtworkUrl(mediaApi, media), isHlsSession(session)),
            session.mode === 'direct' ? seekMs : 0,
          );
        } else {
          applySource(player, session, media, nowPlayingArtworkUrl(mediaApi, media));
          // The returned keyframe-aligned seek is the immutable origin of this
          // transformed generation; a transformed source already starts there.
          if (session.mode === 'direct' && seekMs > 0) player.currentTime = seekMs / 1000;
          player.play();
        }
        // The session's own figure first — it describes this exact output —
        // and the profile's runtime when it does not give one.
        const durationMs = session.durationMs || knownDurationMs;
        knownDurationRef.current = durationMs;
        durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          session,
          durationMs,
          positionMs: session.mode === 'direct' ? seekMs : session.seekMs,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        // What the viewer reads is a sentence about the kind of failure, never
        // core's log line; see `createFailureMessage`. The log line is kept
        // here, where it is evidence rather than copy.
        console.log('[macha] [playback] create-refused', {
          code: playbackFailureCode(error),
          refusal: classifyCreateRefusal(error),
          error: String(error),
        });
        setState((current) => ({
          ...current,
          status: 'failed',
          buffering: false,
          error: createFailureMessage(error),
        }));
      } finally {
        if (generationRef.current === myGeneration) setBusy(false);
      }
    },
    [continueWatching, player, playbackApi, releaseSession],
  );

  const start = useCallback(
    async (items: readonly MediaSummary[], index: number, options?: StartOptions) => {
      const stored = queueStore.replace(items, index);
      await load(stored?.items ?? items, stored?.currentIndex ?? index, options);
    },
    [load, queueStore],
  );

  /**
   * Plays one item, giving it the most useful queue its context allows: an
   * episode queues the rest of its season so playback keeps going, and anything
   * else queues alone.
   */
  const playItem = useCallback(
    async (media: MediaSummary, options?: StartOptions) => {
      if (media.kind === 'episode' && media.playbackContext) {
        try {
          const episodes = await mediaApi.episodesOfSeason(media.playbackContext.season.id);
          const index = episodes.findIndex((episode) => episode.id === media.id);
          if (index >= 0) {
            await start(episodes, index, options);
            return;
          }
        } catch {
          // A season listing is a convenience. If it fails, play the one item.
        }
      }
      await start([media], 0, options);
    },
    [mediaApi, start],
  );

  /**
   * Steps through the play order rather than the raw queue, so shuffle and
   * repeat work without the rest of the runtime knowing they exist. Resolves
   * false when there is nowhere to go, which is how the end of a queue is told
   * apart from a successful advance.
   */
  const advanceBy = useCallback(
    async (delta: number, wrap = repeatRef.current === 'all'): Promise<boolean> => {
      const { items, index } = queueRef.current;
      if (items.length === 0) return false;
      const order =
        orderRef.current.length === items.length
          ? orderRef.current
          : buildOrder(items.length, shuffleRef.current, index);
      const position = order.indexOf(index);
      let nextPosition = (position < 0 ? 0 : position) + delta;
      if (nextPosition < 0 || nextPosition >= order.length) {
        if (!wrap) return false;
        nextPosition = (nextPosition + order.length) % order.length;
      }
      const nextIndex = order[nextPosition];
      queueStore.select(nextIndex);
      await load(items, nextIndex, { seekMs: 0 });
      return true;
    },
    [load, queueStore],
  );

  const skipNext = useCallback(async () => {
    await advanceBy(1);
  }, [advanceBy]);

  const skipPrevious = useCallback(async () => {
    await advanceBy(-1);
  }, [advanceBy]);

  const jumpTo = useCallback(
    async (index: number) => {
      const { items } = queueRef.current;
      if (index < 0 || index >= items.length) return;
      queueStore.select(index);
      await load(items, index, { seekMs: 0 });
    },
    [load, queueStore],
  );

  const setShuffle = useCallback((shuffle: boolean) => {
    shuffleRef.current = shuffle;
    const { items, index } = queueRef.current;
    orderRef.current = buildOrder(items.length, shuffle, index);
    setState((current) => ({ ...current, shuffle }));
  }, []);

  const setRepeat = useCallback((repeat: RepeatMode) => {
    repeatRef.current = repeat;
    setState((current) => ({ ...current, repeat }));
  }, []);

  /**
   * Applies a queue edit. The playing item is identified by identity rather
   * than position, so reordering or removing around it never silently switches
   * track. Persistence keeps the resume position.
   */
  const commitQueue = useCallback(
    (items: MediaSummary[], index: number) => {
      const bounded = Math.max(0, Math.min(items.length - 1, index));
      queueRef.current = { items, index: bounded };
      orderRef.current = buildOrder(items.length, shuffleRef.current, bounded);
      queueStore.setItems(items, bounded);
      setState((current) => ({ ...current, queue: items, queueIndex: bounded }));
    },
    [queueStore],
  );

  const playNext = useCallback(
    (additions: readonly MediaSummary[]) => {
      const { items, index } = queueRef.current;
      const insertable = additions.filter((item) => items.every((existing) => existing.id !== item.id));
      if (insertable.length === 0) return;
      const at = items.length === 0 ? 0 : index + 1;
      commitQueue([...items.slice(0, at), ...insertable, ...items.slice(at)], index);
    },
    [commitQueue],
  );

  const addToQueue = useCallback(
    (additions: readonly MediaSummary[]) => {
      const { items, index } = queueRef.current;
      const insertable = additions.filter((item) => items.every((existing) => existing.id !== item.id));
      if (insertable.length === 0) return;
      commitQueue([...items, ...insertable], index);
    },
    [commitQueue],
  );

  const removeFromQueue = useCallback(
    (target: number) => {
      const { items, index } = queueRef.current;
      if (target < 0 || target >= items.length) return;
      const next = items.filter((_, position) => position !== target);
      if (next.length === 0) {
        void stop();
        queueStore.clear();
        return;
      }
      if (target < index) {
        commitQueue(next, index - 1);
        return;
      }
      commitQueue(next, index);
      // Removing the item that is playing hands the slot to whatever moved up
      // into it, so playback continues rather than stopping dead.
      if (target === index) void load(next, Math.min(index, next.length - 1), { seekMs: 0 });
    },
    [commitQueue, load, queueStore, stop],
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const { items, index } = queueRef.current;
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const playing = items[index];
      commitQueue(next, next.findIndex((item) => item.id === playing?.id));
    },
    [commitQueue],
  );

  const toggle = useCallback(() => {
    if (engineRef.current === 'audio') {
      // The engine's own state is authoritative here: the notification and the
      // headset can change it without React ever hearing about it.
      void TrackPlayer.getPlaybackState().then(({ state }) =>
        state === 'playing' ? TrackPlayer.pause() : TrackPlayer.play(),
      );
      return;
    }
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  /**
   * Moves production to where the viewer went, rather than asking for segments
   * nobody is building.
   *
   * A transformed generation is produced forward from its origin and the node
   * holds only a bounded window. Seeking an hour ahead asks for a segment
   * hundreds past anything in flight, which the node refuses **instantly** —
   * measured 2026-09-13 — and media3 makes that fatal on first occurrence rather
   * than retrying. A seek-only PATCH repositions the generation cheaply: the
   * plan state is kept and segment indices are plan-absolute.
   *
   * **The PATCH creates a new generation, and the stream URL carries the
   * generation in its path.** A request against the old one answers 404 by
   * design, so a retry loop cannot keep an abandoned encoder alive. The player
   * is therefore repointed at the URL from the response *before* it resumes
   * fetching — otherwise this trades an instant 500 for an instant 404.
   */
  const repositionTo = useCallback(
    async (targetMs: number) => {
      const session = sessionRef.current;
      const media = mediaRef.current;
      if (!session || !media) return;
      const myGeneration = ++generationRef.current;
      setBusy(true);
      setState((current) => ({ ...current, buffering: true, error: undefined }));
      // From here the node may supersede the generation the player is still
      // reading, and a fragment of it answers 410. That is our doing, not the
      // node's, and must not fail over.
      pendingSupersedeRef.current = { startedAtMs: Date.now() };
      try {
        const next = await playbackApi.update(session, { seekMs: targetMs });
        if (generationRef.current !== myGeneration) return;
        sessionRef.current = next;
        applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
        player.play();
        // The node's answer is authoritative: a transformed generation begins at
        // the nearest random-access point, rarely the millisecond asked for.
        // Believing our own target would leave the bar disagreeing with the
        // picture for as long as the difference lasts.
        positionRef.current = next.seekMs;
        bufferedRef.current = next.seekMs;
        pendingSeekRef.current = undefined;
        setState((current) => ({
          ...current,
          status: 'ready',
          session: next,
          positionMs: next.seekMs,
          bufferedMs: next.seekMs,
          buffering: true,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        setState((current) => ({ ...current, buffering: false, error: seekRefusalMessage(error) }));
      } finally {
        // Settled, success or failure: the tail is then bounded by the node's
        // own deadline rather than left open.
        const started = pendingSupersedeRef.current?.startedAtMs;
        if (started !== undefined) pendingSupersedeRef.current = { startedAtMs: started, settledAtMs: Date.now() };
        if (generationRef.current === myGeneration) setBusy(false);
      }
    },
    [mediaApi, player, playbackApi],
  );

  /**
   * A generation change this client asked for; see `selfSupersededGeneration`.
   *
   * A ref rather than state for the same reason `pendingSeekRef` is one: the
   * failover callback is created once and would capture the first render's
   * value for ever.
   */
  const pendingSupersedeRef = useRef<PendingSupersede | undefined>(undefined);

  /**
   * Tell the viewer about an error the supersede guard excused, if it is still
   * an error once the guard's window has closed.
   *
   * Scoped to the generation it was armed under: anything that bumps the
   * generation — a load, a seek, another switch, a failover — owns the screen
   * from then on, and a player that has left `error` has recovered on its own.
   * One timer at a time; a repeat of the same error re-arms rather than stacks.
   */
  const supersedeCheckRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportIfStillFailed = useCallback(
    (generation: number) => {
      clearTimeout(supersedeCheckRef.current);
      const check = (): void => {
        if (generationRef.current !== generation) return;
        const verdict = supersededErrorCheck(pendingSupersedeRef.current, sessionRef.current, Date.now());
        if (verdict.kind === 'wait') {
          supersedeCheckRef.current = setTimeout(check, Math.max(0, verdict.recheckAtMs - Date.now()));
          return;
        }
        if (player.status !== 'error') return;
        console.log('[macha] [playback] superseded-error-reported', { generation });
        setState((current) => ({
          ...current,
          status: 'failed',
          buffering: false,
          error: SUPERSEDED_FAILURE_MESSAGE,
        }));
      };
      check();
    },
    [player],
  );
  useEffect(() => () => clearTimeout(supersedeCheckRef.current), []);

  const seekTo = useCallback(
    (positionMs: number) => {
      const bounded = Math.max(0, Math.min(durationRef.current || Number.MAX_SAFE_INTEGER, positionMs));
      positionRef.current = bounded;
      pendingSeekRef.current = { targetMs: bounded, atMs: Date.now() };
      if (engineRef.current === 'audio') {
        // The music path has the same exposure and is deliberately not fixed
        // here: a seek beyond production on a transformed track is still
        // refused. Correcting it means reloading the track at the new URL
        // rather than writing a position, which is separate work.
        void TrackPlayer.seekTo(bounded / 1000);
      } else if (seekRequiresReposition(sessionRef.current, bounded, bufferedRef.current)) {
        void repositionTo(bounded);
        return;
      } else {
        // Back onto the player's timeline: a title-absolute value written to a
        // generation that began an hour in asks for a point far past anything
        // the node has produced.
        player.currentTime = generationLocalMs(sessionRef.current, bounded) / 1000;
      }
      setState((current) => ({ ...current, positionMs: bounded }));
    },
    [player, repositionTo],
  );

  const seekBy = useCallback((deltaMs: number) => seekTo(positionRef.current + deltaMs), [seekTo]);

  /**
   * A source-generation change: mode, quality ceiling, audio stream, subtitle
   * stream or media representation. The node's answer is authoritative, and a
   * subtitle-only change may come back with the A/V generation unchanged — in
   * which case the player is left alone and only the subtitle URL is replaced.
   */
  /**
   * Replace the source with an equivalent one from another node.
   *
   * A player error mid-stream is usually a fact about the node rather than the
   * media — the socket died, the extent went away — so the viewer should get
   * the picture back rather than a failure screen. Core picks the replacement,
   * skipping the failed endpoint and any other node already known to have
   * failed this generation, and records the failure so ranking learns from it.
   *
   * This is a reload rather than a seamless hand-off: the picture stops and
   * resumes at the same position. A truly silent swap needs the player to
   * accept an alternate source without dropping the presentation, which this
   * client's Platform contract cannot yet express.
   *
   * Returns whether a replacement was actually installed, so the caller can
   * fall back to telling the viewer when there is nowhere left to go.
   */
  const failoverSource = useCallback(async (): Promise<boolean> => {
    // The failed player keeps reporting the error for as long as it is on
    // screen, and admitting a replacement is not instant — so without this every
    // repeat of the same failure starts another failover, spends the budget and
    // churns the UI. One at a time.
    if (failoverInFlightRef.current) return true;
    const session = sessionRef.current;
    const media = mediaRef.current;
    if (!session || !media) {
      console.log('[macha] [playback] failover-declined', { reason: 'no-session' });
      return false;
    }
    // An error under a seek we asked for, on a generation the node is still
    // producing, says we asked for something that does not exist yet — not that
    // the node is failing. Failing over on it abandons a working node and throws
    // away every frame it had built. Measured doing exactly that on 2026-09-13.
    //
    // No budget spent and no failure recorded: there is nothing here to learn
    // about the endpoint. `repositionTo` is what actually resolves this case;
    // this only stops the wrong remedy running first.
    if (!errorBlamesEndpoint(session, pendingSeekRef.current, Date.now(), pendingSupersedeRef.current)) {
      // Asked of the guard itself rather than of the ref: the ref is never
      // cleared, so its mere presence labelled every later seek decline too.
      const superseded = selfSupersededGeneration(pendingSupersedeRef.current, session, Date.now());
      console.log('[macha] [playback] failover-declined', {
        reason: superseded ? 'generation-superseded-by-us' : 'seek-outstanding',
      });
      // Declining the failover must not mean declining to tell anyone. If the
      // player is still in error once the guard's own window has closed, the
      // new generation is what failed; see `supersededErrorCheck`.
      if (superseded) reportIfStillFailed(generationRef.current);
      return true;
    }
    // Playback that has been fine for a while earns a fresh budget: the limit
    // is there to stop a broken title cycling nodes, not to ration recovery
    // across a whole film.
    if (Date.now() - lastFailoverAtRef.current > FAILOVER_BUDGET_RESET_MS) failoverAttemptsRef.current = 0;
    if (failoverAttemptsRef.current >= MAX_FAILOVER_ATTEMPTS) {
      console.log('[macha] [playback] failover-declined', {
        reason: 'budget-spent',
        attempts: failoverAttemptsRef.current,
      });
      return false;
    }
    failoverAttemptsRef.current += 1;
    lastFailoverAtRef.current = Date.now();
    failoverInFlightRef.current = true;
    // Stop the dead source now rather than leaving it to keep failing behind
    // the replacement being built.
    player.pause();

    // **Bumping the generation means taking ownership of `busy`.** Every other
    // path that bumps it — `load`, `repositionTo`, `applyUpdate` — sets `busy`
    // and clears it in a `finally` under the same generation guard. This one
    // bumped and did not, which is how the flag came to be stranded: a `load`
    // awaiting `releaseSession` returns early when the generation moves,
    // deliberately leaving `busy` to whoever superseded it, and a failover
    // then never cleared it. The Play button stayed disabled until the app was
    // restarted. Measured on the A85 2026-09-21, four titles in a row.
    setBusy(true);
    const myGeneration = ++generationRef.current;
    const resumeMs = positionRef.current;
    // Logged because a short outage is recovered by the platform player's own
    // retry and never reaches here at all — so "did it fail over, or did
    // ExoPlayer just reconnect?" is otherwise indistinguishable from outside.
    console.log('[macha] [playback] failover-attempt', {
      from: session.endpoint?.baseUrl,
      attempt: failoverAttemptsRef.current,
      resumeMs,
    });
    try {
      const next = await playbackApi.failover(session, media, resumeMs);
      console.log('[macha] [playback] failover-result', { to: next.endpoint?.baseUrl });
      if (generationRef.current !== myGeneration) return true;
      sessionRef.current = next;
      applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
      // A transformed generation starts at the seek point it was cut for; a
      // direct one is the whole file and has to be told where to resume.
      if (next.mode === 'direct' && resumeMs > 0) player.currentTime = resumeMs / 1000;
      player.play();
      setState((current) => ({ ...current, status: 'ready', session: next, buffering: true, error: undefined }));
      return true;
    } catch (error) {
      // The account is at its session cap. No node refused us and none would
      // have answered differently, so this is not a recovery that failed — it
      // is a recovery that was never available. Give the attempt back: the
      // budget exists to stop a broken title cycling nodes, and spending it
      // here leaves the next genuine failure with nothing. Core had the same
      // defect in its own charging and fixed it; this is our version of it.
      if (!spendsFailoverBudget(error)) {
        failoverAttemptsRef.current = Math.max(0, failoverAttemptsRef.current - 1);
        console.log('[macha] [playback] failover-declined', {
          reason: 'account-session-limit',
          code: playbackFailureCode(error),
          attempts: failoverAttemptsRef.current,
        });
        if (generationRef.current !== myGeneration) return true;
        // And say so. Left silent, the viewer gets a paused player and no
        // reason — the failure mode core warned about when it asked whether
        // the cap should ship with the routes.
        setState((current) => ({
          ...current,
          status: 'failed',
          buffering: false,
          error: accountSessionLimitMessage(error),
        }));
        return true;
      }
      console.log('[macha] [playback] failover-failed', { error: String(error) });
      // Superseded work is not a failure anyone should hear about.
      return generationRef.current !== myGeneration;
    } finally {
      failoverInFlightRef.current = false;
      // Same guard as every other owner: a recovery that has itself been
      // superseded must not clear the flag out from under whatever replaced
      // it. See the note beside the `setBusy(true)` above.
      if (generationRef.current === myGeneration) setBusy(false);
    }
  }, [mediaApi, player, playbackApi, reportIfStillFailed]);

  // Held in a ref so the player's listeners never have to resubscribe when the
  // services object is rebuilt.
  const failoverRef = useRef(failoverSource);
  useEffect(() => {
    failoverRef.current = failoverSource;
  }, [failoverSource]);

  const applyUpdate = useCallback(
    async (update: PlaybackUpdate) => {
      const session = sessionRef.current;
      const media = mediaRef.current;
      if (!session || !media) return;
      const myGeneration = ++generationRef.current;
      const resumeMs = positionRef.current;
      setBusy(true);
      setState((current) => ({ ...current, buffering: true, error: undefined }));
      // From here the node may supersede the generation the player is still
      // reading, and a fragment of it answers 410. That is our doing, not the
      // node's, and must not fail over.
      pendingSupersedeRef.current = { startedAtMs: Date.now() };
      try {
        const next = await playbackApi.update(session, statedUpdate(update, session));
        if (generationRef.current !== myGeneration) return;
        sessionRef.current = next;
        const sourceUnchanged = next.source.url === session.source.url;
        if (!sourceUnchanged) {
          applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
          if (next.mode === 'direct' && resumeMs > 0) player.currentTime = resumeMs / 1000;
          player.play();
        }
        const durationMs = next.durationMs || knownDurationRef.current;
        knownDurationRef.current = durationMs;
        durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          session: next,
          durationMs,
          buffering: !sourceUnchanged,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        // The existing source is still playing; say that rather than core's
        // "request failed", which reads as a dead player to someone watching.
        setState((current) => ({ ...current, buffering: false, error: updateRefusalMessage(error) }));
      } finally {
        // Settled, success or failure: the tail is then bounded by the node's
        // own deadline rather than left open.
        const started = pendingSupersedeRef.current?.startedAtMs;
        if (started !== undefined) pendingSupersedeRef.current = { startedAtMs: started, settledAtMs: Date.now() };
        if (generationRef.current === myGeneration) setBusy(false);
      }
    },
    [mediaApi, player, playbackApi],
  );

  const retry = useCallback(async () => {
    const { items, index } = queueRef.current;
    if (items.length === 0) return;
    await load(items, index, { seekMs: positionRef.current });
  }, [load]);

  // Platform player events are the authority for transport state; React never
  // polls, and never writes back a position the player did not report.
  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        // Two engines, one state: stand down unless this one owns playback.
        if (engineRef.current !== 'video') return;
        // The player counts from the start of the *generation*; everything
        // above this line means the title's timeline. Convert once, here, at
        // the point the figure arrives — see `generationOriginMs`. Without it
        // a rebuilding seek left the bar reading 0:13 of a three-hour film,
        // measured on the A85 2026-09-21, and it also mismatched the seek
        // target below and checkpointed the wrong resume position.
        if (currentTime > 0) progressedRef.current = true;
        const positionMs = titlePositionMs(sessionRef.current, Math.round(currentTime * 1000));
        const pendingSeek = pendingSeekRef.current;
        if (pendingSeek) {
          if (seekStillPending(sessionRef.current, pendingSeek, positionMs, Date.now())) return;
          pendingSeekRef.current = undefined;
        }
        positionRef.current = positionMs;
        const bufferedMs = titlePositionMs(sessionRef.current, Math.round((bufferedPosition ?? 0) * 1000));
        bufferedRef.current = bufferedMs;
        const reported = Math.max(0, Math.round((player.duration || 0) * 1000));
        const durationMs = knownDurationRef.current || reported || durationRef.current;
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          positionMs,
          durationMs: durationMs || current.durationMs,
          bufferedMs,
        }));
        checkpoint(positionMs, durationMs || durationRef.current);
        // One count per started item, once the listener has clearly committed
        // to it. Seeking backwards must not count the same play twice.
        const playing = mediaRef.current;
        if (playing && positionMs >= PLAY_COUNT_THRESHOLD_MS && countedPlayRef.current !== playing.id) {
          countedPlayRef.current = playing.id;
          musicLibrary.recordPlay(playing.id);
        }
      }),
      // expo-video ducks by halving the viewer-facing volume and, because its
      // `volume` setter also assigns `userVolume`, its own unduck restores the
      // ducked value. Nothing inside the library ever puts this back, and the
      // halvings compound. `restoredVolume` returns undefined once the value
      // matches, which is what stops this write re-triggering itself.
      player.addListener('volumeChange', ({ volume }) => {
        if (engineRef.current !== 'video') return;
        const restore = restoredVolume(volume, intendedVolumeRef.current);
        if (restore === undefined) return;
        // Logged because the duck is invisible from JS otherwise: expo-video
        // reports no focus event, so without this there is no way to tell a
        // restore that fired from one that never needed to.
        console.log('[macha] [playback] volume-restored', { from: volume, to: restore });
        player.volume = restore;
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        // Two engines, one state: stand down unless this one owns playback.
        if (engineRef.current !== 'video') return;
        setState((current) => ({ ...current, playing: isPlaying }));
      }),
      player.addListener('statusChange', ({ status, error }) => {
        // Two engines, one state: stand down unless this one owns playback.
        if (engineRef.current !== 'video') return;
        if (status === 'error') {
          // Try another node before saying anything. A stream that stops
          // mid-playback is far more often the node than the title, and the
          // viewer would rather have the picture back than an explanation.
          setState((current) => ({ ...current, buffering: true }));
          void failoverRef.current().then((swapped) => {
            if (swapped) return;
            // The player's own message is a codec or network trace
            // ("MediaCodecVideoRenderer error, index=0") and expo-video never
            // says more, so the honest sentence is the one that claims only
            // what is known. The trace goes to the log.
            console.log('[macha] [playback] player-failed', { message: error?.message });
            setState((current) => ({
              ...current,
              status: 'failed',
              buffering: false,
              error: PLAYER_FAILURE_MESSAGE,
            }));
          });
          return;
        }
        setState((current) => ({
          ...current,
          buffering: status === 'loading',
          status: current.status === 'loading' && status === 'readyToPlay' ? 'ready' : current.status,
        }));
      }),
      player.addListener('sourceLoad', ({ duration }) => {
        // Two engines, one state: stand down unless this one owns playback.
        if (engineRef.current !== 'video') return;
        if (knownDurationRef.current > 0) return;
        const durationMs = Math.max(0, Math.round(duration * 1000));
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({ ...current, durationMs: durationMs || current.durationMs }));
      }),
      player.addListener('playToEnd', () => {
        // Two engines, one state: stand down unless this one owns playback.
        if (engineRef.current !== 'video') return;
        const media = mediaRef.current;
        // Tearing down clears the current item before it clears the source, and
        // replacing a source with null can itself emit playToEnd. Without this
        // guard, closing the player advanced into the next queue item instead
        // of stopping.
        if (!media) return;
        // An end the player never played to is the one `load`'s own
        // `replace(null)` produces; see `progressedRef`. Acting on it retired
        // the item and advanced twice in a row.
        if (!progressedRef.current) {
          console.log('[macha] [playback] play-to-end-ignored', { mediaId: media.id, reason: 'no-progress-since-load' });
          return;
        }
        console.log('[macha] [playback] play-to-end', {
          mediaId: media.id,
          positionMs: positionRef.current,
          durationMs: durationRef.current,
        });
        if (durationRef.current > 0) {
          // Reaching the end retires the item from Continue Watching rather
          // than leaving it parked one second from the credits.
          continueWatching.update(progressFor(media, durationRef.current, durationRef.current));
        }
        if (repeatRef.current === 'one') {
          // Repeat-one is a local transport operation: no new session, no
          // renegotiation, just play the same generation again from the top.
          player.currentTime = 0;
          player.play();
          return;
        }
        void advanceBy(1).then((moved) => {
          if (!moved) void stop();
        });
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [advanceBy, checkpoint, continueWatching, musicLibrary, player, stop]);

  // The native audio player is the authority for music transport. Its events
  // are the only way React learns about a pause from the notification, the
  // lock screen, a headset button or an audio-focus loss.
  useEffect(() => {
    void ensureAudioEngine().catch(() => undefined);
    const subscriptions = [
      TrackPlayer.addEventListener(TrackEvent.PlaybackProgressUpdated, ({ position, duration, buffered }) => {
        if (engineRef.current !== 'audio') return;
        const positionMs = Math.max(0, Math.round(position * 1000));
        const pendingSeek = pendingSeekRef.current;
        if (pendingSeek) {
          if (seekStillPending(sessionRef.current, pendingSeek, positionMs, Date.now())) return;
          pendingSeekRef.current = undefined;
        }
        const durationMs = knownDurationRef.current || Math.max(0, Math.round(duration * 1000));
        positionRef.current = positionMs;
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          positionMs,
          durationMs: durationMs || current.durationMs,
          bufferedMs: Math.max(0, Math.round((buffered ?? 0) * 1000)),
        }));
        checkpoint(positionMs, durationMs || durationRef.current);
        const playing = mediaRef.current;
        if (playing && positionMs >= PLAY_COUNT_THRESHOLD_MS && countedPlayRef.current !== playing.id) {
          countedPlayRef.current = playing.id;
          musicLibrary.recordPlay(playing.id);
        }
      }),
      TrackPlayer.addEventListener(TrackEvent.PlaybackState, ({ state: trackState }) => {
        if (engineRef.current !== 'audio') return;
        setState((current) => ({
          ...current,
          playing: trackState === TrackState.Playing,
          buffering: trackState === TrackState.Buffering || trackState === TrackState.Loading,
          status: trackState === TrackState.Error ? 'failed' : current.status === 'loading' ? 'ready' : current.status,
        }));
      }),
      TrackPlayer.addEventListener(TrackEvent.PlaybackError, ({ message }) => {
        if (engineRef.current !== 'audio') return;
        setState((current) => ({ ...current, status: 'failed', buffering: false, error: message }));
      }),
      TrackPlayer.addEventListener(TrackEvent.PlaybackQueueEnded, () => {
        if (engineRef.current !== 'audio') return;
        const media = mediaRef.current;
        if (!media) return;
        if (durationRef.current > 0) {
          continueWatching.update(progressFor(media, durationRef.current, durationRef.current));
        }
        if (repeatRef.current === 'one') {
          void TrackPlayer.seekTo(0).then(() => TrackPlayer.play());
          return;
        }
        void advanceBy(1).then((moved) => {
          if (!moved) void stop();
        });
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [advanceBy, checkpoint, continueWatching, musicLibrary, stop]);

  /**
   * Transport events from the notification, lock screen, headset and Bluetooth.
   *
   * These are registered here, not only in the background service: on Android
   * that service is a headless task the platform may never start while the app
   * is alive, which left the notification's buttons doing nothing at all.
   * Pausing on an unplugged headset lives here too — music suddenly playing out
   * loud on a train is the behaviour nobody wants.
   */
  useEffect(() => {
    const subscriptions = [
      TrackPlayer.addEventListener(TrackEvent.RemotePlay, () => void TrackPlayer.play()),
      TrackPlayer.addEventListener(TrackEvent.RemotePause, () => void TrackPlayer.pause()),
      TrackPlayer.addEventListener(TrackEvent.RemoteStop, () => void stop()),
      TrackPlayer.addEventListener(TrackEvent.RemoteNext, () => void skipNext()),
      TrackPlayer.addEventListener(TrackEvent.RemotePrevious, () => void skipPrevious()),
      TrackPlayer.addEventListener(TrackEvent.RemoteSeek, ({ position }) => seekTo(position * 1000)),
      TrackPlayer.addEventListener(TrackEvent.RemoteDuck, ({ paused, permanent }) => {
        if (permanent || paused) void TrackPlayer.pause();
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [seekTo, skipNext, skipPrevious, stop]);

  // The headless service reaches the runtime through this table when it does
  // run, so there is one implementation of what Next means either way.
  useEffect(() => {
    setAudioRemoteHandlers({
      play: () => void TrackPlayer.play(),
      pause: () => void TrackPlayer.pause(),
      stop: () => void stop(),
      next: () => void skipNext(),
      previous: () => void skipPrevious(),
      seekTo: (positionMs) => seekTo(positionMs),
    });
  }, [seekTo, skipNext, skipPrevious, stop]);

  // A background transfer that was killed mid-flight leaves a record marked
  // downloading with nothing running. Requeue those once, at startup.
  useEffect(() => {
    downloadManager.resumeInterrupted();
  }, [downloadManager]);

  // Backgrounding is the one moment a checkpoint is guaranteed to matter: the
  // process may not get another chance to write one.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') checkpoint(positionRef.current, durationRef.current, true);
    });
    return () => subscription.remove();
  }, [checkpoint]);

  // Reconfiguring the connection invalidates any lease held on the old cluster.
  const previousGeneration = useRef(generation);
  useEffect(() => {
    if (previousGeneration.current === generation) return;
    previousGeneration.current = generation;
    void stop();
  }, [generation, stop]);

  const value = useMemo<PlaybackContextValue>(
    () => ({
      ...state,
      player,
      busy,
      start,
      playItem,
      toggle,
      seekTo,
      seekBy,
      skipNext,
      skipPrevious,
      jumpTo,
      setShuffle,
      setRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      applyUpdate,
      stop,
      retry,
    }),
    [
      state,
      player,
      busy,
      start,
      playItem,
      toggle,
      seekTo,
      seekBy,
      skipNext,
      skipPrevious,
      jumpTo,
      setShuffle,
      setRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      applyUpdate,
      stop,
      retry,
    ],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

/**
 * Hands a negotiated session to the platform player.
 *
 * Stream URLs are short-lived capability URLs and are loaded without the
 * anonymous session's Authorization header, which is only for session control.
 * (There is no "permanent" token: the manual one was removed in 0.3.4, and this
 * comment used to describe it.) `contentType`
 * is set explicitly because a Macha HLS URL has no `.m3u8` extension for the
 * player to recognise.
 */
function applySource(
  player: VideoPlayer,
  session: PlaybackSession,
  media: MediaSummary,
  artworkUrl: string | undefined,
): void {
  const hls = session.source.isManifest;
  const source: VideoSource = {
    uri: session.source.url,
    contentType: hls ? 'hls' : 'auto',
    metadata: {
      title: media.title,
      artist: nowPlayingArtist(media),
      artwork: artworkUrl,
    },
  };
  player.replace(source, true);
}

/**
 * The second line of the lock-screen and notification transport.
 *
 * A track wants its artist, an episode its series. Falling back to the generic
 * subtitle would print "Track 3" on the lock screen, which is what the first
 * cut of this did.
 */
function nowPlayingArtist(media: MediaSummary): string {
  const music = media.musicContext;
  if (music) return [music.artist?.title, music.album.title].filter(Boolean).join(' — ') || 'Macha';
  return media.playbackContext?.series.title ?? media.subtitle ?? 'Macha';
}

/**
 * Describes one track for the native audio player, which owns the notification
 * and lock-screen presentation. Artist and album are separate fields here —
 * unlike expo-video's metadata, which only has an artist line to fold them into.
 */
function audioTrackFor(
  media: MediaSummary,
  url: string,
  artwork: string | undefined,
  hls: boolean,
): AudioTrackInfo {
  return {
    id: media.id,
    url,
    title: media.title,
    artist: media.musicContext?.artist?.title,
    album: media.musicContext?.album.title,
    artwork,
    durationMs: media.durationMs,
    hls,
  };
}

/** Remux and transcode always deliver HLS; Direct Play hands over the original bytes. */
function isHlsSession(session: PlaybackSession): boolean {
  // Decided once when the session is decoded, so the audio engine and core's
  // Direct/Remux badge can never disagree about what is being served.
  return session.source.isManifest;
}

/**
 * A directly loadable artwork URL for the transport notification. Prefers the
 * item's own art, then the album cover a track inherits. The platform fetches
 * this itself, so it must be a plain URL the node will serve.
 */
function nowPlayingArtworkUrl(mediaApi: MediaApi, media: MediaSummary): string | undefined {
  const ref =
    media.artwork?.poster ??
    media.artwork?.thumbnail ??
    media.musicContext?.artwork ??
    media.artwork?.backdrop;
  if (!ref) return undefined;
  // The lock-screen notification loads this URL itself, in a process that has
  // no access to the session token — so only a self-authenticating source is
  // usable. Taking the first entry regardless would put an authenticated
  // per-node URL on the notification, which fails as a blank cover with
  // nothing anywhere to say why.
  return mediaApi.artworkUrls(ref).find((source) => !source.requiresAuthorization)?.url;
}



/**
 * Decides how to ask for a piece of media.
 *
 * The server stopped choosing: it reports what a file is and performs exactly
 * what it is told, so asking for `direct` on something this device cannot
 * demux yields the file and a black screen rather than an error. The decision
 * therefore lives entirely here, and it comes from `@machafoundation/core` so that the
 * phone, TV and web clients cannot drift apart on the same file.
 *
 * Two deliberate points. A user's explicit choice in the playback sheet wins
 * outright — they may know something the facts do not. And with no technical
 * facts at all, the answer is transcode: the one instruction that is always
 * playable, because there is no fallback to recover into.
 */
/**
 * What to ask the node for, and how long the media actually runs.
 *
 * The runtime comes back with it because the technical profile is the only
 * place the client reliably learns it: the catalogue does not carry a duration,
 * and a transformed session describes a stream that is still being produced.
 * The chooser has already paid for these facts, so carrying the number out
 * costs nothing and saves the seek bar from having to trust the player.
 */
async function chooseInstruction(
  mediaApi: MediaApi,
  playbackApi: ClusterPlaybackApi,
  media: MediaSummary,
  requested: PlaybackMode | undefined,
): Promise<{ instruction: PlaybackInstruction; durationMs: number }> {
  const mediaId = media.mediaIds[0];

  if (requested) {
    // The viewer named the mode, so no facts are needed to choose one — but
    // the runtime still is, and asking for it must not fail the playback.
    const stated = await playbackFacts(playbackApi, media, mediaId);
    return {
      instruction: {
        // The viewer named the mode, not the audio codec: a remux of a title
        // this device cannot decode the audio of must still transcode it, and
        // the mode has to be renamed with it. See `transformFor`.
        ...transformFor(
          requested,
          audioCopyable(
            stated?.profile.streams.find((stream) => stream.type === 'audio')?.codec,
            deviceCapabilities().audioCodecs ?? [],
          ),
        ),
        reasons: [],
        // The viewer said so. Nothing was inferred, so nothing was assumed.
        assumed: [],
      },
      durationMs: stated?.profile.durationMs ?? 0,
    };
  }

  const capabilities = deviceCapabilities();
  const overrides = devicePlaybackOverrides();

  const facts = await playbackFacts(playbackApi, media, mediaId);
  if (facts) {
    return {
      instruction: choosePlaybackInstruction(facts.profile, capabilities, {
        overrides,
        operations: facts.operations,
      }),
      durationMs: facts.profile.durationMs,
    };
  }

  const profile = mediaId ? await mediaApi.mediaProfile(mediaId).catch(() => undefined) : undefined;
  if (!profile) {
    // Not an assumption about an optional input: there are no facts at all,
    // which `reasons` already says plainly.
    return {
      instruction: { mode: 'transcode', video: 'transcode', audio: 'transcode', reasons: ['no-technical-facts'], assumed: [] },
      durationMs: 0,
    };
  }
  const catalogued = technicalProfileFromCatalogue(profile);
  return {
    instruction: choosePlaybackInstruction(catalogued, capabilities, { overrides }),
    durationMs: catalogued.durationMs,
  };
}

/**
 * The facts for the media this item will actually resolve to, or undefined
 * when no node can answer.
 *
 * Asked by item rather than by media id so the answer describes the same
 * source session creation will pick. Failure is not fatal: an older node has
 * no facts endpoint, and the caller still has the catalogue profile to fall
 * back on.
 */
async function playbackFacts(
  playbackApi: ClusterPlaybackApi,
  media: MediaSummary,
  mediaId: string | undefined,
): Promise<PlaybackMediaFacts | undefined> {
  const facts = await playbackApi.facts({ itemId: media.id }).catch(() => undefined);
  if (!facts || facts.length === 0) return undefined;
  return facts.find((entry) => entry.mediaId === mediaId) ?? facts[0];
}

/**
 * Creates the session, giving up one ambition at a time if the node refuses.
 *
 * `operations` should make this unnecessary — the chooser no longer asks for
 * what the node cannot perform. It stays because the gate depends on the node
 * reporting honestly and on the client having reached the node that executes,
 * and the cost of being wrong is the viewer getting nothing at all. Degrading
 * is one step and one direction — a copy becomes a transcode, never the
 * reverse — so it converges and cannot loop.
 */
async function createSession(
  playbackApi: ClusterPlaybackApi,
  media: MediaSummary,
  instruction: PlaybackInstruction,
  seekMs: number | undefined,
  preferences: PlaybackPreferencesUpdate | undefined,
): Promise<PlaybackSession> {
  let attempt: PlaybackInstruction | undefined = instruction;
  let refusal: unknown;
  while (attempt) {
    try {
      return await playbackApi.create(media, attempt, seekMs, preferences);
    } catch (error) {
      // Only a refusal degrades. An unreachable node or a server fault says
      // nothing about the instruction, and asking for less would not help.
      //
      // Classified rather than `instanceof`-tested: core's resolver raises its
      // own `MachaPlaybackError`, so the identity test this used to do could
      // never match and every refusal was fatal, degrade path included.
      const kind = classifyCreateRefusal(error);
      // The account cap is not about the instruction. Every node answers it
      // identically, so degrading burns the viewer's time proving that.
      if (kind !== 'degrade') throw error;
      refusal = error;
      attempt = degradeInstruction(attempt);
    }
  }
  throw refusal;
}
