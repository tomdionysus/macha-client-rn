import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PlaybackPreferencesUpdate, PlaybackSession, PlaybackUpdate } from '../api/playback';
import { describeError } from '../api/errors';
import { deviceCapabilities } from '../playback/capabilities';
import type { MediaApi } from '../api/media';
import { progressFor } from '../state/continueWatching';
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
/** Restarting an item that has barely begun is more useful than resuming it. */
const RESUME_FLOOR_MS = 10_000;

/**
 * A play order over the queue.
 *
 * Shuffle has to be *stable*: re-randomising on every skip means Previous
 * doesn't return where you came from, and a "random" run can repeat a track
 * while others go unheard. So the order is computed once when shuffle is
 * turned on and kept until it is turned off or the queue is replaced. The
 * current item is pinned to the front so enabling shuffle never interrupts
 * what is playing.
 */
function buildOrder(length: number, shuffle: boolean, currentIndex: number): number[] {
  const sequential = Array.from({ length }, (_, index) => index);
  if (!shuffle || length < 2) return sequential;
  const rest = sequential.filter((index) => index !== currentIndex);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return currentIndex >= 0 && currentIndex < length ? [currentIndex, ...rest] : rest;
}

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
  const lastCheckpointRef = useRef(0);
  const durationRef = useRef(0);
  const positionRef = useRef(0);

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
      lastCheckpointRef.current = 0;

      setBusy(true);
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
      player.pause();
      player.replace(null, true);
      // Music is meant to keep playing with the screen off; video playing on
      // in the background is just a decoder burning battery for nobody.
      player.staysActiveInBackground = media.kind === 'track';
      player.showNowPlayingNotification = media.kind === 'track';
      await releaseSession(previous);
      if (generationRef.current !== myGeneration) return;

      const remembered = continueWatching.positionFor(media.id);
      const seekMs = options.seekMs ?? (remembered > RESUME_FLOOR_MS ? remembered : 0);

      // A downloaded original is played straight off the disk: no session, no
      // capability URL, no node. This is the whole point of downloads — in
      // airplane mode there is nothing to negotiate with.
      const stored = downloads.localFor(media);
      if (stored?.localUri) {
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
        durationRef.current = media.durationMs ?? 0;
        setState((current) => ({
          ...current,
          status: 'ready',
          session: undefined,
          durationMs: media.durationMs ?? current.durationMs,
          positionMs: seekMs,
          buffering: false,
        }));
        setBusy(false);
        return;
      }

      try {
        const session = await playbackApi.create(media, deviceCapabilities(), seekMs, options.preferences);
        if (generationRef.current !== myGeneration) {
          // A late lease belonging to a superseded generation is never activated.
          await releaseSession(session);
          return;
        }
        sessionRef.current = session;
        applySource(player, session, media, nowPlayingArtworkUrl(mediaApi, media));
        // The returned keyframe-aligned seek is the immutable origin of this
        // transformed generation; a transformed source already starts there.
        if (session.mode === 'direct' && seekMs > 0) player.currentTime = seekMs / 1000;
        player.play();
        durationRef.current = session.durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          session,
          durationMs: session.durationMs,
          positionMs: session.mode === 'direct' ? seekMs : session.seekMs,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        setState((current) => ({ ...current, status: 'failed', buffering: false, error: describeError(error) }));
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
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const seekTo = useCallback(
    (positionMs: number) => {
      const bounded = Math.max(0, Math.min(durationRef.current || Number.MAX_SAFE_INTEGER, positionMs));
      positionRef.current = bounded;
      player.currentTime = bounded / 1000;
      setState((current) => ({ ...current, positionMs: bounded }));
    },
    [player],
  );

  const seekBy = useCallback((deltaMs: number) => seekTo(positionRef.current + deltaMs), [seekTo]);

  /**
   * A source-generation change: mode, quality ceiling, audio stream, subtitle
   * stream or media representation. The node's answer is authoritative, and a
   * subtitle-only change may come back with the A/V generation unchanged — in
   * which case the player is left alone and only the subtitle URL is replaced.
   */
  const applyUpdate = useCallback(
    async (update: PlaybackUpdate) => {
      const session = sessionRef.current;
      const media = mediaRef.current;
      if (!session || !media) return;
      const myGeneration = ++generationRef.current;
      const resumeMs = positionRef.current;
      setBusy(true);
      setState((current) => ({ ...current, buffering: true, error: undefined }));
      try {
        const next = await playbackApi.update(session, update);
        if (generationRef.current !== myGeneration) return;
        sessionRef.current = next;
        const sourceUnchanged = next.source.url === session.source.url;
        if (!sourceUnchanged) {
          applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
          if (next.mode === 'direct' && resumeMs > 0) player.currentTime = resumeMs / 1000;
          player.play();
        }
        durationRef.current = next.durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          session: next,
          durationMs: next.durationMs,
          buffering: !sourceUnchanged,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        setState((current) => ({ ...current, buffering: false, error: describeError(error) }));
      } finally {
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
        const positionMs = Math.max(0, Math.round(currentTime * 1000));
        positionRef.current = positionMs;
        const durationMs = Math.max(0, Math.round((player.duration || durationRef.current / 1000) * 1000));
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          positionMs,
          durationMs: durationMs || current.durationMs,
          bufferedMs: Math.max(0, Math.round((bufferedPosition ?? 0) * 1000)),
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
      player.addListener('playingChange', ({ isPlaying }) => {
        setState((current) => ({ ...current, playing: isPlaying }));
      }),
      player.addListener('statusChange', ({ status, error }) => {
        setState((current) => ({
          ...current,
          buffering: status === 'loading',
          status: status === 'error' ? 'failed' : current.status === 'loading' && status === 'readyToPlay' ? 'ready' : current.status,
          error: status === 'error' ? (error?.message ?? 'The player could not play this stream.') : current.error,
        }));
      }),
      player.addListener('sourceLoad', ({ duration }) => {
        const durationMs = Math.max(0, Math.round(duration * 1000));
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({ ...current, durationMs: durationMs || current.durationMs }));
      }),
      player.addListener('playToEnd', () => {
        const media = mediaRef.current;
        if (media && durationRef.current > 0) {
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
 * permanent bearer token — that token is only for session control. `contentType`
 * is set explicitly because a Macha HLS URL has no `.m3u8` extension for the
 * player to recognise.
 */
function applySource(
  player: VideoPlayer,
  session: PlaybackSession,
  media: MediaSummary,
  artworkUrl: string | undefined,
): void {
  const hls = session.mode !== 'direct' || (session.mimeType ?? '').includes('mpegurl');
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
  return ref ? mediaApi.artworkUrls(ref)[0] : undefined;
}
