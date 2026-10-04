import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ClusterPlaybackApi, PlaybackPreferencesUpdate, PlaybackSession, PlaybackUpdate, StartProgressListener } from '../api/playback';
import type { PlaybackMode } from '../types';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import {
  choosePlaybackInstruction,
  degradeInstruction,
  playbackVersions,
  resumePreferences,
  restatePreferencesClearedByMode,
  technicalProfileFromCatalogue,
  type PlaybackInstruction,
  type PlaybackMediaFacts,
  type PlaybackStartProgress,
  type PlaybackVersions,
  type StreamInstruction,
  type VersionStep,
} from '@machafoundation/core';
import { automaticStart, deviceQualityCeiling, offerAll, versionStart, versionUpdate } from '../playback/quality';
import { belongsInContinueWatching, progressOf, type PlaybackChoice } from '../playback/resume';
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
  fileToPlay,
  classifyProbe,
  createFailureMessage,
  errorSettleMs,
  errorBlamesEndpoint,
  generationLocalMs,
  positionedUpdate,
  recoveryAfterProbe,
  restoredVolume,
  seekRefusalMessage,
  seekStillPending,
  selfSupersededGeneration,
  supersededErrorCheck,
  type PendingSupersede,
  type ProbeOutcome,
  spendsFailoverBudget,
  statedUpdate,
  titlePositionMs,
  updateRefusalMessage,
  transformFor,
} from '../playback/policy';
import { setAudioRemoteHandlers } from '../playback/audioRemote';
import { mayPlay, nextPlayablePosition } from '../playback/availability';
import { observeSeek, seekBase, seekPlan, UNCACHED_SEEK_DEBOUNCE_MS, type SeekIntent } from '../playback/seekIntent';
import { qualitySteppedDownText, tooSlowToPlay, tooSlowToPlayText, type EarlyStalls } from '../playback/tooSlow';
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
  /** Qualities the playing item offers, and any ceiling automatic play applied; absent off the disk. See `playback/quality.ts`. */
  versions?: PlaybackVersions;
  /** Failed because no node converts this quality at real speed; the failure screen offers another. See `playback/tooSlow.ts`. */
  tooSlow?: boolean;
  /** The node's progress on an async start or change (`start=async`). */
  startProgress?: PlaybackStartProgress;
  /** When the loading item was requested, for the wait notice's timer. */
  startedAtMs?: number;
  /** A new stream is being built behind the playing one (change, failover or regeneration). */
  preparing?: boolean;
}

export interface StartOptions {
  /** Where to begin. Omitted means "resume from the remembered position". */
  seekMs?: number;
  preferences?: PlaybackPreferencesUpdate;
  /** A quality the viewer picked. Never capped, and nothing re-ranks its file. */
  version?: VersionStep;
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
  /** Switch the playing item to one of `versions.steps`, as the viewer's choice. */
  playVersion(step: VersionStep): Promise<void>;
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
/** Failovers admitted before reporting the title unplayable; a broken title fails on every node. */
const MAX_FAILOVER_ATTEMPTS = 2;

/** Playback surviving this long resets the failover budget: it is a burst limit, not a lifetime one. */
const FAILOVER_BUDGET_RESET_MS = 60_000;

/** Shown when the player failed unrecoverably. expo-video hides the HTTP status, so it claims no cause. */
const PLAYER_FAILURE_MESSAGE = 'This stream stopped playing and could not be recovered. Try again.';

/** Shown when a viewer's change left the player in error; expo-video never says why, so "may". */
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
 * App-scoped playback runtime: sole owner of the platform player and the active
 * Macha session. The full-screen player and mini player are views of it, so
 * moving between them never touches the session or source.
 *
 * Source-changing transitions are generation-ordered: the old session closes
 * before a new one is created, and a session whose POST lands after its
 * generation was superseded is deleted. Transport controls stay local.
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
  /** Music runs on the native audio player for a real media session; video on expo-video. */
  const engineRef = useRef<'video' | 'audio'>('video');
  const lastCheckpointRef = useRef(0);
  const durationRef = useRef(0);
  /**
   * The node's runtime, which the player may not override: a transformed stream
   * is a growing playlist whose player `duration` is only what has been produced.
   * Zero means unknown, and only then (e.g. a download) does the player's figure count.
   */
  const knownDurationRef = useRef(0);
  const positionRef = useRef(0);
  /**
   * Whether the current source has reported progress: the only way to tell a
   * real end from the spurious `playToEnd` that `replace(null)` causes (ExoPlayer
   * lands in `STATE_ENDED`). A flag, not a position threshold, because server
   * durations can run a few seconds long.
   */
  const progressedRef = useRef(false);
  /** Where the last regeneration was asked for; see `recoveryAfterProbe`. */
  const lastRegenerationPositionRef = useRef<number | undefined>(undefined);
  /** Buffered extent, as a ref because `seekTo` is called from a gesture handler created once. */
  const bufferedRef = useRef(0);
  /** The intended video volume, for `restoredVolume` to measure a duck against. A ref so an in-app volume control would update it. */
  const intendedVolumeRef = useRef(1);
  /**
   * A seek not yet reached. Both engines report the old position for a while
   * after a seek, so reports are ignored until one lands near the target or the
   * deadline passes.
   */
  const pendingSeekRef = useRef<{ targetMs: number; atMs: number } | undefined>(undefined);
  /** The viewer's seek target, pinned until the stream serving it is tracking; see `playback/seekIntent.ts`. */
  const seekIntentRef = useRef<SeekIntent | undefined>(undefined);
  /** The last position the player actually reported, for a seek that never lands. */
  const observedPositionRef = useRef(0);
  /** A seek waiting `UNCACHED_SEEK_DEBOUNCE_MS` for the next before asking the node. */
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The node request for a seek in flight, aborted when the viewer seeks again. */
  const seekRequestRef = useRef<AbortController | undefined>(undefined);
  /**
   * Set while the frame is held for a seek's new generation; `resume` says
   * whether to play once it is on. Play/Pause meanwhile change only `resume`.
   */
  const seekHoldRef = useRef<{ resume: boolean } | undefined>(undefined);
  /** Whether the viewer paused. Not `player.playing`, which is false while ExoPlayer buffers. */
  const viewerPausedRef = useRef(false);
  const failoverAttemptsRef = useRef(0);
  const lastFailoverAtRef = useRef(0);
  const failoverInFlightRef = useRef(false);
  /** Publishes start progress for the requesting generation only; cleared once ready or failed. */
  const reportStartProgress = useCallback(
    (generation: number): StartProgressListener =>
      (progress) => {
        if (generationRef.current !== generation) return;
        const shown = progress.stage === 'ready' || progress.stage === 'failed' ? undefined : progress;
        setState((current) => ({ ...current, startProgress: shown }));
      },
    [],
  );
  /** The quality the viewer picked for this item, so a retry replays it. */
  const versionRef = useRef<VersionStep | undefined>(undefined);
  /** Whether this item's source is on the player yet; until then, an idle player's position-0 ticks are ignored. */
  const presentedRef = useRef(false);
  /** Who chose how this item plays, so a resume restores only the viewer's choices. */
  const choiceRef = useRef<PlaybackChoice>({ chosenByViewer: false });
  /** The item's file facts, so a switch to another file can name its streams. */
  const filesRef = useRef<readonly PlaybackMediaFacts[] | undefined>(undefined);
  /** The playing item's qualities, highest first, for a step down; see `tooSlowToPlay`. */
  const stepsRef = useRef<readonly VersionStep[]>([]);
  /** Early failures counted against one file, mode and cap; see `tooSlowToPlay`. */
  const earlyStallsRef = useRef<EarlyStalls>({ count: 0 });

  useEffect(() => () => player.release(), [player]);

  // Restore a saved queue on cold start; no session until the viewer presses play.
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
      if (belongsInContinueWatching(media)) {
        continueWatching.update(progressOf(media, positionMs, durationMs, sessionRef.current, choiceRef.current));
      }
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
        // Expiry and explicit cleanup are equivalent.
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
      // Each item gets its own failover budget.
      failoverAttemptsRef.current = 0;
      lastFailoverAtRef.current = 0;
      failoverInFlightRef.current = false;
      const sameQueue =
        queueRef.current.items.length === items.length &&
        queueRef.current.items.every((existing, position) => existing.id === items[position]?.id);
      queueRef.current = { items: [...items], index };
      // Keep the shuffle order across an advance; only a different queue reshuffles.
      if (!sameQueue || orderRef.current.length !== items.length) {
        orderRef.current = buildOrder(items.length, shuffleRef.current, index);
      }
      countedPlayRef.current = undefined;
      versionRef.current = options.version;
      filesRef.current = undefined;
      stepsRef.current = [];
      earlyStallsRef.current = { count: 0 };
      clearTimeout(seekDebounceRef.current);
      seekDebounceRef.current = undefined;
      seekRequestRef.current?.abort();
      seekRequestRef.current = undefined;
      seekIntentRef.current = undefined;
      seekHoldRef.current = undefined;
      viewerPausedRef.current = false;
      presentedRef.current = false;
      positionRef.current = 0;
      lastRegenerationPositionRef.current = undefined;
      // Before the `replace(null)` below, whose `playToEnd` must not count.
      progressedRef.current = false;
      lastCheckpointRef.current = 0;
      knownDurationRef.current = 0;
      // Otherwise the previous item's duration lingers until the source reports.
      durationRef.current = media.durationMs ?? 0;

      // Nothing may throw between setting `busy` and the `try`, or the flag is
      // stranded and Play stays disabled.
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
          tooSlow: undefined,
          startProgress: undefined,
          startedAtMs: Date.now(),
          preparing: false,
          queue: [...items],
          queueIndex: index,
          versions: undefined,
        }));

        // Release the old session before requesting a new one, so a node never
        // holds two transcode slots for one viewer.
        const audio = media.kind === 'track';
        engineRef.current = audio ? 'audio' : 'video';
        player.pause();
        player.replace(null, true);
        // The audio engine owns music and its notification; expo-video must not
        // also claim a media session.
        player.staysActiveInBackground = false;
        player.showNowPlayingNotification = false;
        if (!audio) await stopAudio();
        await releaseSession(previous);
        if (generationRef.current !== myGeneration) return;

        const remembered = continueWatching.positionFor(media.id);
        const seekMs = options.seekMs ?? (remembered > RESUME_FLOOR_MS ? remembered : 0);
        // The resume point stands until this source reports a position.
        positionRef.current = seekMs;
        // A plain resume restores the same file and the viewer's chosen mode, cap
        // and tracks. "From start", a picked quality or a picked mode does not.
        const resumeEntry =
          !options.version && options.preferences?.mode === undefined && seekMs > 0 && seekMs === remembered
            ? continueWatching.entryFor(media.id)
            : undefined;
        const startPreferences: PlaybackPreferencesUpdate = {
          ...(resumeEntry ? resumePreferences(resumeEntry) : {}),
          ...options.preferences,
        };
        // `'choose'` is core's "you decide" sentinel; this client always decides.
        const requestedMode = startPreferences.mode === 'choose' ? undefined : startPreferences.mode;
        choiceRef.current = {
          chosenByViewer: !!options.version || requestedMode !== undefined,
          quality: options.version?.quality,
          mode: options.version?.instruction.mode ?? requestedMode,
        };
        // A start seek is pending like any other, so the player's initial 0s are
        // not checkpointed over the resume point.
        const startSeek = () => {
          pendingSeekRef.current = seekMs > 0 ? { targetMs: seekMs, atMs: Date.now() } : undefined;
        };
        pendingSeekRef.current = undefined;

        // A download plays straight off the disk: no session, no node.
        const stored = downloads.localFor(media);
        if (stored?.localUri) {
          startSeek();
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
          // A newer load may have begun during the await.
          if (generationRef.current === myGeneration) presentedRef.current = true;
          // Off the disk, the player's own duration is the only source.
          knownDurationRef.current = 0;
          durationRef.current = media.durationMs ?? 0;
          setState((current) => ({
            ...current,
            status: 'ready',
            tooSlow: undefined,
            session: undefined,
            durationMs: media.durationMs ?? current.durationMs,
            positionMs: seekMs,
            buffering: false,
          }));
          // `busy` is cleared by the `finally`.
          return;
        }

        const {
          instruction,
          durationMs: knownDurationMs,
          mediaId: chosenMediaId,
          preferences: chosenPreferences,
          versions,
          files,
        } = await chooseInstruction(
          mediaApi,
          playbackApi,
          media,
          requestedMode,
          startPreferences,
          options.version,
        );
        if (generationRef.current !== myGeneration) return;
        filesRef.current = files;
        if (!choiceRef.current.chosenByViewer && versions?.automatic) {
          choiceRef.current = { chosenByViewer: false, quality: versions.automatic.quality };
        }
        if (versions) {
          stepsRef.current = versions.steps;
          setState((current) => ({ ...current, versions }));
        }
        const session = await createSession(playbackApi, media, instruction, seekMs, {
          ...startPreferences,
          // Height cap and named streams for the chosen file.
          ...chosenPreferences,
          // The chosen file, as `media_id`; core restates it on every generation.
          ...(chosenMediaId ? { mediaId: chosenMediaId } : {}),
        }, reportStartProgress(myGeneration));
        if (generationRef.current !== myGeneration) {
          // A late session for a superseded generation is never activated.
          await releaseSession(session);
          return;
        }
        sessionRef.current = session;
        // A transformed generation already begins at the start position.
        if (session.mode === 'direct') startSeek();
        if (audio) {
          await loadAudioTrack(
            audioTrackFor(media, session.source.url, nowPlayingArtworkUrl(mediaApi, media), isHlsSession(session)),
            session.mode === 'direct' ? seekMs : 0,
          );
        } else {
          applySource(player, session, media, nowPlayingArtworkUrl(mediaApi, media));
          if (session.mode === 'direct' && seekMs > 0) player.currentTime = seekMs / 1000;
          player.play();
        }
        if (generationRef.current === myGeneration) presentedRef.current = true;
        // The session's figure describes this exact output; the profile's is the fallback.
        const durationMs = session.durationMs || knownDurationMs;
        knownDurationRef.current = durationMs;
        durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          tooSlow: undefined,
          session,
          durationMs,
          positionMs: session.mode === 'direct' ? seekMs : session.seekMs,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        // The viewer gets a sentence (`createFailureMessage`); the raw error goes to the log.
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
        if (generationRef.current === myGeneration) {
          setBusy(false);
          setState((current) => ({ ...current, startProgress: undefined }));
        }
      }
    },
    [continueWatching, player, playbackApi, releaseSession, reportStartProgress],
  );

  /**
   * A title that may not be played: unavailable on the cluster and not
   * downloaded. A title restored from storage has no availability, and plays.
   */
  const heldBack = useCallback(
    (item: MediaSummary | undefined) => !!item && !mayPlay(item, downloads.localFor(item)?.localUri !== undefined),
    [downloads],
  );

  const start = useCallback(
    async (items: readonly MediaSummary[], index: number, options?: StartOptions) => {
      // Start at the first playable title from `index`, or not at all.
      const first = heldBack(items[index])
        ? nextPlayablePosition(items.length, index, 1, false, (position) => !heldBack(items[position]))
        : index;
      if (first === undefined) return;
      const stored = queueStore.replace(items, first);
      await load(stored?.items ?? items, stored?.currentIndex ?? first, first === index ? options : undefined);
    },
    [heldBack, load, queueStore],
  );

  /** Plays one item; an episode queues its season, anything else queues alone. */
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
          // Fall back to playing the one item.
        }
      }
      await start([media], 0, options);
    },
    [mediaApi, start],
  );

  /** Steps through the play order (shuffle and repeat). Resolves false at the end of the queue. */
  const advanceBy = useCallback(
    async (delta: number, wrap = repeatRef.current === 'all'): Promise<boolean> => {
      const { items, index } = queueRef.current;
      if (items.length === 0) return false;
      const order =
        orderRef.current.length === items.length
          ? orderRef.current
          : buildOrder(items.length, shuffleRef.current, index);
      const position = order.indexOf(index);
      const nextPosition = nextPlayablePosition(order.length, position < 0 ? 0 : position, delta, wrap, (candidate) =>
        !heldBack(items[order[candidate]!]),
      );
      if (nextPosition === undefined) return false;
      const nextIndex = order[nextPosition]!;
      queueStore.select(nextIndex);
      await load(items, nextIndex, { seekMs: 0 });
      return true;
    },
    [heldBack, load, queueStore],
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
      if (index < 0 || index >= items.length || heldBack(items[index])) return;
      queueStore.select(index);
      await load(items, index, { seekMs: 0 });
    },
    [heldBack, load, queueStore],
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

  /** Applies a queue edit; callers pass the playing item's new index so edits never switch track. */
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
      // Removing the playing item plays whatever moved up into its slot.
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
      // The engine's state is authoritative: the notification and headset change it too.
      void TrackPlayer.getPlaybackState().then(({ state }) =>
        state === 'playing' ? TrackPlayer.pause() : TrackPlayer.play(),
      );
      return;
    }
    // During a seek hold, Play/Pause decide what happens once the new generation is on.
    const hold = seekHoldRef.current;
    if (hold) {
      hold.resume = !hold.resume;
      viewerPausedRef.current = !hold.resume;
      setState((current) => ({ ...current, playing: hold.resume }));
      return;
    }
    if (player.playing) {
      viewerPausedRef.current = true;
      player.pause();
    } else {
      viewerPausedRef.current = false;
      player.play();
    }
  }, [player]);

  /**
   * Moves production to the seek target with a seek-only PATCH. A transformed
   * generation is produced forward within a bounded window; a segment far
   * beyond it is refused instantly, and media3 treats that as fatal.
   *
   * The PATCH makes a new generation whose URL differs (the old one answers
   * 404), so the player is repointed before it resumes fetching.
   */
  const repositionTo = useCallback(
    async () => {
      const session = sessionRef.current;
      const media = mediaRef.current;
      const intent = seekIntentRef.current;
      if (!session || !media || !intent) return;
      // The latest target at the moment of asking.
      const targetMs = intent.targetMs;
      const myGeneration = ++generationRef.current;
      const request = new AbortController();
      seekRequestRef.current = request;
      // From here the old generation's fragments may answer 410; that is our
      // doing and must not fail over.
      pendingSupersedeRef.current = { startedAtMs: Date.now() };
      console.log('[macha] [playback] seek-needs-generation', {
        sessionId: session.sessionId,
        targetMs,
        generationStartMs: session.seekMs,
      });
      try {
        const next = await playbackApi.update(session, { seekMs: targetMs }, request.signal, reportStartProgress(myGeneration));
        if (generationRef.current !== myGeneration) return;
        sessionRef.current = next;
        applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
        const resume = seekHoldRef.current?.resume ?? true;
        seekHoldRef.current = undefined;
        if (resume) player.play();
        // The target stays pinned until the player tracks near it (a generation
        // starts at a random-access point). See `observeSeek`.
        const pinned = seekIntentRef.current;
        if (pinned) seekIntentRef.current = { targetMs: pinned.targetMs, presented: true };
        bufferedRef.current = next.seekMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          tooSlow: undefined,
          session: next,
          playing: resume,
          bufferedMs: next.seekMs,
          buffering: true,
        }));
      } catch (error) {
        if (generationRef.current !== myGeneration) return;
        // The seek never landed: restore the bar to the player's real position.
        seekIntentRef.current = undefined;
        pendingSeekRef.current = undefined;
        positionRef.current = observedPositionRef.current;
        const resume = seekHoldRef.current?.resume ?? false;
        seekHoldRef.current = undefined;
        if (resume) player.play();
        setState((current) => ({
          ...current,
          positionMs: observedPositionRef.current,
          playing: resume,
          buffering: false,
          error: seekRefusalMessage(error),
        }));
      } finally {
        if (seekRequestRef.current === request) seekRequestRef.current = undefined;
        // Once settled, the supersede window is bounded by the node's deadline.
        const started = pendingSupersedeRef.current?.startedAtMs;
        if (started !== undefined) pendingSupersedeRef.current = { startedAtMs: started, settledAtMs: Date.now() };
        if (generationRef.current === myGeneration) {
          setState((current) => ({ ...current, preparing: false, startProgress: undefined }));
        }
      }
    },
    [mediaApi, player, playbackApi, reportStartProgress],
  );

  /** A generation change this client asked for; see `selfSupersededGeneration`. */
  const pendingSupersedeRef = useRef<PendingSupersede | undefined>(undefined);

  /**
   * Reports an error the supersede guard excused if it persists after the
   * guard's window. Scoped to the arming generation; one timer at a time.
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
  useEffect(() => () => clearTimeout(seekDebounceRef.current), []);

  /**
   * Moves the bar at once. Seeks within the current generation go straight to
   * the player; otherwise the picture is held and the node is asked for a new
   * generation, once per burst of presses. See `playback/seekIntent.ts`.
   */
  const seekTo = useCallback(
    (positionMs: number) => {
      // Whole milliseconds: lock-screen and headset seeks can be fractional.
      const bounded = Math.round(Math.max(0, Math.min(durationRef.current || Number.MAX_SAFE_INTEGER, positionMs)));
      positionRef.current = bounded;
      pendingSeekRef.current = { targetMs: bounded, atMs: Date.now() };
      setState((current) => ({ ...current, positionMs: bounded }));
      if (engineRef.current === 'audio') {
        // Known gap: a seek beyond production on a transformed track is still
        // refused; fixing it means reloading the track at a new URL.
        void TrackPlayer.seekTo(bounded / 1000);
        return;
      }
      // Once a new generation is on its way, the rest of the burst follows it.
      const negotiating = seekDebounceRef.current !== undefined || seekRequestRef.current !== undefined;
      const plan = negotiating ? { kind: 'reposition' as const } : seekPlan(sessionRef.current, bounded, bufferedRef.current);
      if (plan.kind === 'local') {
        seekIntentRef.current = { targetMs: bounded, presented: true };
        player.currentTime = plan.localMs / 1000;
        return;
      }
      seekIntentRef.current = { targetMs: bounded, presented: false };
      if (!seekHoldRef.current) {
        seekHoldRef.current = { resume: !viewerPausedRef.current };
        player.pause();
      }
      // Abort the in-flight request, retiring its generation first so the
      // abort's rejection is not taken as a failed seek and rolled back.
      if (seekRequestRef.current) {
        seekRequestRef.current.abort();
        seekRequestRef.current = undefined;
        ++generationRef.current;
      }
      clearTimeout(seekDebounceRef.current);
      setState((current) => ({ ...current, buffering: true, error: undefined, preparing: true, startProgress: undefined }));
      seekDebounceRef.current = setTimeout(() => {
        seekDebounceRef.current = undefined;
        void repositionTo();
      }, UNCACHED_SEEK_DEBOUNCE_MS);
    },
    [player, repositionTo],
  );

  const seekBy = useCallback(
    (deltaMs: number) => seekTo(seekBase(seekIntentRef.current, positionRef.current) + deltaMs),
    [seekTo],
  );

  /**
   * A fresh session on the node that reaped this one, at the current position.
   * Spends no failover budget. Returns false when failover should run instead.
   */
  const regenerateSource = useCallback(
    async (session: PlaybackSession, media: MediaSummary): Promise<boolean> => {
      failoverInFlightRef.current = true;
      setBusy(true);
      const myGeneration = ++generationRef.current;
      const resumeMs = positionRef.current;
      lastRegenerationPositionRef.current = resumeMs;
      setState((current) => ({ ...current, preparing: true, startProgress: undefined }));
      console.log('[macha] [playback] regenerate-attempt', { on: session.endpoint?.baseUrl, resumeMs });
      try {
        const next = await playbackApi.regenerate(session, media, resumeMs);
        console.log('[macha] [playback] regenerate-result', { on: next.endpoint?.baseUrl, sessionId: next.sessionId });
        if (generationRef.current !== myGeneration) return true;
        sessionRef.current = next;
        applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
        if (next.mode === 'direct' && resumeMs > 0) player.currentTime = resumeMs / 1000;
        player.play();
        setState((current) => ({ ...current, status: 'ready', session: next, buffering: true, error: undefined, tooSlow: undefined }));
        return true;
      } catch (error) {
        // Includes the node having left the registry, where failing over is right.
        console.log('[macha] [playback] regenerate-failed', { code: playbackFailureCode(error), error: String(error) });
        return generationRef.current !== myGeneration;
      } finally {
        failoverInFlightRef.current = false;
        if (generationRef.current === myGeneration) {
          setBusy(false);
          setState((current) => ({ ...current, preparing: false, startProgress: undefined }));
        }
      }
    },
    [mediaApi, player, playbackApi],
  );

  /**
   * Replaces the source with an equivalent one from another node (core picks it
   * and records the failure). A reload, not a seamless hand-off. Returns false
   * when there is nowhere left to go.
   */
  const failoverSource = useCallback(async (): Promise<boolean> => {
    // One at a time: the failed player repeats its error while it is up.
    if (failoverInFlightRef.current) return true;
    const session = sessionRef.current;
    const media = mediaRef.current;
    if (!session || !media) {
      console.log('[macha] [playback] failover-declined', { reason: 'no-session' });
      return false;
    }
    // An error under our own seek or generation change is not the node's fault;
    // `repositionTo` resolves it. No budget spent, nothing recorded.
    if (!errorBlamesEndpoint(session, pendingSeekRef.current, Date.now(), pendingSupersedeRef.current)) {
      // Ask the guard, not the ref: the ref is never cleared.
      const superseded = selfSupersededGeneration(pendingSupersedeRef.current, session, Date.now());
      console.log('[macha] [playback] failover-declined', {
        reason: superseded ? 'generation-superseded-by-us' : 'seek-outstanding',
      });
      // Still report it if the error outlasts the guard's window.
      if (superseded) reportIfStillFailed(generationRef.current);
      return true;
    }
    // Trust the error only if it persists; see `errorSettleMs`. One at a time.
    failoverInFlightRef.current = true;
    const erroredGeneration = generationRef.current;
    console.log('[macha] [playback] player-error-settling', { settleMs: errorSettleMs(session) });
    try {
      await new Promise((resolve) => setTimeout(resolve, errorSettleMs(session)));
    } finally {
      failoverInFlightRef.current = false;
    }
    if (generationRef.current !== erroredGeneration || sessionRef.current !== session) return true;
    if (player.status !== 'error') {
      console.log('[macha] [playback] player-error-cleared', { settleMs: errorSettleMs(session) });
      return true;
    }
    // Ask the issuing node whether it still holds the session; this records nothing.
    let outcome: ProbeOutcome;
    try {
      outcome = classifyProbe({ alive: await playbackApi.sessionAlive(session) });
    } catch (error) {
      outcome = classifyProbe({ error });
    }
    if (generationRef.current !== erroredGeneration || sessionRef.current !== session) return true;
    const recovery = recoveryAfterProbe(outcome, positionRef.current, lastRegenerationPositionRef.current);
    console.log('[macha] [playback] session-probe', { outcome, recovery, positionMs: positionRef.current });
    if (recovery === 'regenerate' && (await regenerateSource(session, media))) return true;
    // A repeated early failure means no node converts this quality at real
    // speed; see `tooSlowToPlay`. Checked before the failover budget.
    const slow = tooSlowToPlay(
      earlyStallsRef.current,
      session,
      presentedRef.current ? generationLocalMs(session, positionRef.current) : undefined,
      choiceRef.current,
      stepsRef.current,
    );
    earlyStallsRef.current = slow.stalls;
    if (slow.verdict.kind !== 'keeps-up') {
      const quality = choiceRef.current.quality;
      console.log('[macha] [playback] too-slow-to-play', {
        mediaId: session.mediaId,
        mode: session.mode,
        quality,
        steppingDownTo: slow.verdict.kind === 'step-down' ? slow.verdict.step.quality : undefined,
        viewerChose: choiceRef.current.chosenByViewer,
      });
      if (slow.verdict.kind === 'step-down') {
        // One at a time, as for failover.
        failoverInFlightRef.current = true;
        try {
          await stepDownRef.current(slow.verdict.step);
        } finally {
          failoverInFlightRef.current = false;
        }
        return true;
      }
      player.pause();
      setState((current) => ({
        ...current,
        status: 'failed',
        buffering: false,
        error: tooSlowToPlayText(quality, session.transform),
        tooSlow: true,
      }));
      return true;
    }
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
    // Stop the dead source while the replacement is built.
    player.pause();

    // Bumping the generation means owning `busy`: a superseded `load` leaves it
    // to whoever superseded it.
    setBusy(true);
    const myGeneration = ++generationRef.current;
    const resumeMs = positionRef.current;
    // Logged to tell a failover from ExoPlayer's own reconnect.
    console.log('[macha] [playback] failover-attempt', {
      from: session.endpoint?.baseUrl,
      attempt: failoverAttemptsRef.current,
      resumeMs,
    });
    setState((current) => ({ ...current, preparing: true, startProgress: undefined }));
    try {
      const next = await playbackApi.failover(session, media, resumeMs, reportStartProgress(myGeneration));
      console.log('[macha] [playback] failover-result', { to: next.endpoint?.baseUrl });
      if (generationRef.current !== myGeneration) return true;
      sessionRef.current = next;
      applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
      // Only a direct source needs telling where to resume.
      if (next.mode === 'direct' && resumeMs > 0) player.currentTime = resumeMs / 1000;
      player.play();
      setState((current) => ({ ...current, status: 'ready', session: next, buffering: true, error: undefined, tooSlow: undefined }));
      return true;
    } catch (error) {
      // The account is at its session cap: no node would answer differently,
      // so refund the attempt and say why.
      if (!spendsFailoverBudget(error)) {
        failoverAttemptsRef.current = Math.max(0, failoverAttemptsRef.current - 1);
        console.log('[macha] [playback] failover-declined', {
          reason: 'account-session-limit',
          code: playbackFailureCode(error),
          attempts: failoverAttemptsRef.current,
        });
        if (generationRef.current !== myGeneration) return true;
        setState((current) => ({
          ...current,
          status: 'failed',
          buffering: false,
          error: accountSessionLimitMessage(error),
        }));
        return true;
      }
      console.log('[macha] [playback] failover-failed', { error: String(error) });
      // Superseded work is not a failure.
      return generationRef.current !== myGeneration;
    } finally {
      failoverInFlightRef.current = false;
      // A superseded recovery must not clear the flag under whatever replaced it.
      if (generationRef.current === myGeneration) {
        setBusy(false);
        setState((current) => ({ ...current, preparing: false, startProgress: undefined }));
      }
    }
  }, [mediaApi, player, playbackApi, regenerateSource, reportIfStillFailed, reportStartProgress]);

  // A ref so the player's listeners need not resubscribe when services rebuild.
  const failoverRef = useRef(failoverSource);
  useEffect(() => {
    failoverRef.current = failoverSource;
  }, [failoverSource]);

  /**
   * `stated` marks an update whose transform is already complete (a picked
   * quality), which `statedUpdate` must not rewrite from the current file.
   */
  const sendUpdate = useCallback(
    async (update: PlaybackUpdate, stated: boolean): Promise<boolean> => {
      const session = sessionRef.current;
      const media = mediaRef.current;
      if (!session || !media) return false;
      const myGeneration = ++generationRef.current;
      const resumeMs = positionRef.current;
      setBusy(true);
      setState((current) => ({ ...current, buffering: true, error: undefined, preparing: true, startProgress: undefined }));
      // From here the old generation's fragments may answer 410; that is our
      // doing and must not fail over.
      pendingSupersedeRef.current = { startedAtMs: Date.now() };
      try {
        const positioned = positionedUpdate(update, session, resumeMs);
        const next = await playbackApi.update(
          session,
          stated ? positioned : statedUpdate(positioned, session),
          undefined,
          reportStartProgress(myGeneration),
        );
        if (generationRef.current !== myGeneration) return false;
        sessionRef.current = next;
        const sourceUnchanged = next.source.url === session.source.url;
        if (!sourceUnchanged) {
          applySource(player, next, media, nowPlayingArtworkUrl(mediaApi, media));
          if (next.mode === 'direct' && resumeMs > 0) {
            // The new source reports 0 before the seek lands, as at a start.
            pendingSeekRef.current = { targetMs: resumeMs, atMs: Date.now() };
            player.currentTime = resumeMs / 1000;
          }
          player.play();
        }
        const durationMs = next.durationMs || knownDurationRef.current;
        knownDurationRef.current = durationMs;
        durationRef.current = durationMs;
        setState((current) => ({
          ...current,
          status: 'ready',
          tooSlow: undefined,
          session: next,
          durationMs,
          buffering: !sourceUnchanged,
        }));
        return true;
      } catch (error) {
        if (generationRef.current !== myGeneration) return false;
        // The existing source is still playing; the message must say so.
        setState((current) => ({ ...current, buffering: false, error: updateRefusalMessage(error) }));
        return false;
      } finally {
        // Once settled, the supersede window is bounded by the node's deadline.
        const started = pendingSupersedeRef.current?.startedAtMs;
        if (started !== undefined) pendingSupersedeRef.current = { startedAtMs: started, settledAtMs: Date.now() };
        if (generationRef.current === myGeneration) {
          setBusy(false);
          setState((current) => ({ ...current, preparing: false, startProgress: undefined }));
        }
      }
    },
    [mediaApi, player, playbackApi, reportStartProgress],
  );

  const applyUpdate = useCallback(
    async (update: PlaybackUpdate) => {
      // A mode or cap change replaces the picked quality, but only once it
      // lands: it can be refused (429 `resource_limit`), leaving the pick playing.
      const preferences = update.preferences;
      const replacesPick = preferences?.mode !== undefined || preferences?.maxHeight !== undefined;
      if ((await sendUpdate(update, false)) && replacesPick) {
        versionRef.current = undefined;
        const mode = preferences?.mode;
        choiceRef.current = {
          chosenByViewer: true,
          // A cap alone keeps the mode the viewer already chose.
          mode: mode !== undefined && mode !== 'choose' ? mode : choiceRef.current.mode,
        };
      }
    },
    [sendUpdate],
  );

  const playVersion = useCallback(
    async (step: VersionStep) => {
      const session = sessionRef.current;
      if (!session) return;
      console.log('[macha] [playback] version-chosen', {
        quality: step.quality,
        source: step.source,
        file: step.mediaId,
        switching: step.mediaId !== undefined && step.mediaId !== session.mediaId,
      });
      // Remembered only once it plays, so a refused switch does not change what retry plays.
      if (await sendUpdate(versionUpdate(step, session, filesRef.current), true)) {
        versionRef.current = step;
        choiceRef.current = { chosenByViewer: true, quality: step.quality, mode: step.instruction.mode };
      }
    },
    [sendUpdate],
  );

  // Steps automatic play down to a quality a node keeps up with; still automatic.
  const stepDown = useCallback(
    async (step: VersionStep) => {
      const session = sessionRef.current;
      if (!session) return;
      if (await sendUpdate(versionUpdate(step, session, filesRef.current), true)) {
        choiceRef.current = { chosenByViewer: false, quality: step.quality };
        setState((current) => ({ ...current, error: qualitySteppedDownText(step.quality) }));
      }
    },
    [sendUpdate],
  );
  // A ref because the failover above is declared before `sendUpdate`.
  const stepDownRef = useRef(stepDown);
  useEffect(() => {
    stepDownRef.current = stepDown;
  }, [stepDown]);

  const retry = useCallback(async () => {
    const { items, index } = queueRef.current;
    if (items.length === 0) return;
    // A picked quality survives a retry; automatic play chooses afresh.
    await load(items, index, { seekMs: positionRef.current, version: versionRef.current });
  }, [load]);

  // Player events are the authority for transport state; React never polls.
  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        if (engineRef.current !== 'video') return;
        // See `presentedRef`.
        if (!presentedRef.current) return;
        // The player counts from the generation's start; convert to the title's
        // timeline once, here.
        if (currentTime > 0) progressedRef.current = true;
        const positionMs = titlePositionMs(sessionRef.current, Math.round(currentTime * 1000));
        observedPositionRef.current = positionMs;
        // A viewer's seek pins the bar until its stream is tracking; see `observeSeek`.
        const intent = seekIntentRef.current;
        if (intent) {
          const next = observeSeek(intent, positionMs);
          seekIntentRef.current = next;
          if (next) return;
          pendingSeekRef.current = undefined;
          console.log('[macha] [playback] seek-settled', { targetMs: intent.targetMs, positionMs });
        }
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
        // One play count per started item.
        const playing = mediaRef.current;
        if (playing && positionMs >= PLAY_COUNT_THRESHOLD_MS && countedPlayRef.current !== playing.id) {
          countedPlayRef.current = playing.id;
          musicLibrary.recordPlay(playing.id);
        }
      }),
      // expo-video's unduck restores the ducked volume (its `volume` setter also
      // sets `userVolume`), so halvings compound. Restore it ourselves;
      // `restoredVolume` returns undefined once it matches, ending the loop.
      player.addListener('volumeChange', ({ volume }) => {
        if (engineRef.current !== 'video') return;
        const restore = restoredVolume(volume, intendedVolumeRef.current);
        if (restore === undefined) return;
        // expo-video reports no focus event, so this log is the only trace.
        console.log('[macha] [playback] volume-restored', { from: volume, to: restore });
        player.volume = restore;
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (engineRef.current !== 'video') return;
        // A seek hold is not the viewer pausing.
        if (seekHoldRef.current) return;
        setState((current) => ({ ...current, playing: isPlaying }));
      }),
      player.addListener('statusChange', ({ status, error }) => {
        if (engineRef.current !== 'video') return;
        if (status === 'error') {
          // Try another node first: a mid-stream stop is usually the node, not the title.
          setState((current) => ({ ...current, buffering: true }));
          void failoverRef.current().then((swapped) => {
            if (swapped) return;
            // The player's message is a codec trace; it goes to the log only.
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
        if (engineRef.current !== 'video') return;
        if (knownDurationRef.current > 0) return;
        const durationMs = Math.max(0, Math.round(duration * 1000));
        if (durationMs > 0) durationRef.current = durationMs;
        setState((current) => ({ ...current, durationMs: durationMs || current.durationMs }));
      }),
      player.addListener('playToEnd', () => {
        if (engineRef.current !== 'video') return;
        const media = mediaRef.current;
        // Teardown clears the item before the source, and `replace(null)` can
        // emit playToEnd; closing must not advance.
        if (!media) return;
        // See `progressedRef`.
        if (!progressedRef.current) {
          console.log('[macha] [playback] play-to-end-ignored', { mediaId: media.id, reason: 'no-progress-since-load' });
          return;
        }
        console.log('[macha] [playback] play-to-end', {
          mediaId: media.id,
          positionMs: positionRef.current,
          durationMs: durationRef.current,
        });
        if (durationRef.current > 0 && belongsInContinueWatching(media)) {
          // Reaching the end retires the item from Continue Watching.
          continueWatching.update(progressFor(media, durationRef.current, durationRef.current));
        }
        if (repeatRef.current === 'one') {
          // Repeat-one replays the same generation; no new session.
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

  // The native audio player is the authority for music transport, including
  // changes from the notification, lock screen, headset or focus loss.
  useEffect(() => {
    void ensureAudioEngine().catch(() => undefined);
    const subscriptions = [
      TrackPlayer.addEventListener(TrackEvent.PlaybackProgressUpdated, ({ position, duration, buffered }) => {
        if (engineRef.current !== 'audio') return;
        // Nothing of ours is on the player yet; see `presentedRef`.
        if (!presentedRef.current) return;
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
        if (durationRef.current > 0 && belongsInContinueWatching(media)) {
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
   * Remote transport events (notification, lock screen, headset, Bluetooth).
   * Registered here as well as in the background service, because Android may
   * never start that headless task while the app is alive.
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

  // The headless service, when it runs, calls these, so there is one implementation.
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

  // Checkpoint on backgrounding: the process may not get another chance.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') checkpoint(positionRef.current, durationRef.current, true);
    });
    return () => subscription.remove();
  }, [checkpoint]);

  // Reconfiguring the connection invalidates any session on the old cluster.
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
      playVersion,
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
      playVersion,
      stop,
      retry,
    ],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

/**
 * Hands a session's stream to the player. Stream URLs are capability URLs, so
 * no Authorization header; `contentType` is explicit because Macha HLS URLs
 * have no `.m3u8` extension.
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

/** The lock-screen second line: a track's artist and album, or an episode's series. */
function nowPlayingArtist(media: MediaSummary): string {
  const music = media.musicContext;
  if (music) return [music.artist?.title, music.album.title].filter(Boolean).join(' — ') || 'Macha';
  return media.playbackContext?.series.title ?? 'Macha';
}

/** Describes one track for the native audio player, which owns the notification and lock screen. */
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
  // Decided once at decode, so the audio engine and the mode badge agree.
  return session.source.isManifest;
}

/** Artwork URL for the transport notification: the item's own art, else a track's album cover. */
function nowPlayingArtworkUrl(mediaApi: MediaApi, media: MediaSummary): string | undefined {
  const ref =
    media.artwork?.poster ??
    media.artwork?.thumbnail ??
    media.musicContext?.artwork ??
    media.artwork?.backdrop;
  if (!ref) return undefined;
  // The notification fetches this without the session token, so only a
  // self-authenticating URL works; an authenticated one shows a blank cover.
  return mediaApi.artworkUrls(ref).find((source) => !source.requiresAuthorization)?.url;
}



/**
 * What to ask the node for, and the media's runtime. The server performs
 * exactly what it is told, so the decision is core's (shared by every client).
 * A viewer's choice wins; with no technical facts the answer is transcode.
 * The runtime comes from the technical profile, the only reliable source.
 */
async function chooseInstruction(
  mediaApi: MediaApi,
  playbackApi: ClusterPlaybackApi,
  media: MediaSummary,
  requested: PlaybackMode | undefined,
  preferences: PlaybackPreferencesUpdate | undefined,
  version: VersionStep | undefined,
): Promise<{
  instruction: PlaybackInstruction;
  durationMs: number;
  mediaId?: string;
  /** Height cap and named streams, where a version or automatic play chose them. */
  preferences?: PlaybackPreferencesUpdate;
  versions?: PlaybackVersions;
  files?: readonly PlaybackMediaFacts[];
}> {
  const mediaId = media.mediaIds[0];
  const capabilities = deviceCapabilities();
  const overrides = devicePlaybackOverrides();
  // Every file of the item, on every path: the qualities offered during play come from them.
  const files = await playbackApi.facts({ itemId: media.id }).catch(() => undefined);

  if (version) {
    // A picked quality: never capped or re-ranked.
    const start = versionStart(version, files ?? [], media.mediaIds, capabilities, overrides, preferences, playbackApi.transcodeRate);
    return { ...start, ...(files ? { files } : { versions: undefined }) };
  }

  if (requested) {
    // The viewer named the mode. A resume names its file; otherwise pick one
    // (`fileToPlay`) and read the runtime and audio codec from it.
    const named = preferences?.mediaId !== undefined && media.mediaIds.includes(preferences.mediaId) ? preferences.mediaId : undefined;
    const chosenMediaId = named ?? fileToPlay(files, media.mediaIds, capabilities, overrides);
    const stated = files?.find((entry) => entry.mediaId === chosenMediaId) ?? files?.[0];
    return {
      instruction: {
        // Audio this device cannot decode is still transcoded; see `transformFor`.
        ...transformFor(
          requested,
          audioCopyable(
            stated?.profile.streams.find((stream) => stream.type === 'audio')?.codec,
            deviceCapabilities().audioCodecs ?? [],
          ),
        ),
        reasons: [],
        assumed: [],
      },
      durationMs: stated?.profile.durationMs ?? 0,
      ...(chosenMediaId ? { mediaId: chosenMediaId } : {}),
      ...(files ? { files } : {}),
    };
  }

  // Automatic play: the best file within the device's current ceiling. A resume
  // keeps its file (choosing only how), but every file is still offered.
  const named = preferences?.mediaId !== undefined ? files?.filter((file) => file.mediaId === preferences.mediaId) : undefined;
  const candidates = named && named.length > 0 ? named : files;
  const chosen = candidates
    ? automaticStart(candidates, media.mediaIds, capabilities, overrides, deviceQualityCeiling(), preferences, playbackApi.transcodeRate)
    : undefined;
  if (chosen && candidates !== files && files) {
    chosen.versions = { ...chosen.versions, steps: playbackVersions(files, capabilities, { overrides, mediaIds: media.mediaIds, offerAll: offerAll(), transcodeRate: playbackApi.transcodeRate }).steps };
  }
  if (chosen) {
    if (chosen.versions.limitedBy) {
      console.log('[macha] [playback] quality-limited', {
        quality: chosen.versions.automatic?.quality,
        ceiling: chosen.versions.limitedBy.quality,
        reason: chosen.versions.limitedBy.reason,
      });
    }
    return { ...chosen, files };
  }

  const profile = mediaId ? await mediaApi.mediaProfile(mediaId).catch(() => undefined) : undefined;
  if (!profile) {
    return {
      instruction: { mode: 'transcode', video: 'transcode', audio: 'transcode', reasons: ['no-technical-facts'], assumed: [] },
      durationMs: 0,
    };
  }
  const catalogued = technicalProfileFromCatalogue(profile);
  return {
    instruction: choosePlaybackInstruction(catalogued, capabilities, { overrides }),
    durationMs: catalogued.durationMs,
    // Judged from the first file, so only named when it is the only one.
    ...(media.mediaIds.length === 1 ? { mediaId } : {}),
  };
}

/**
 * Creates the session, degrading one step per refusal (copy to transcode,
 * never back, so it terminates). A safety net: the chooser already respects
 * the node's advertised `operations`, but that relies on the node reporting
 * honestly.
 */
async function createSession(
  playbackApi: ClusterPlaybackApi,
  media: MediaSummary,
  instruction: PlaybackInstruction,
  seekMs: number | undefined,
  preferences: PlaybackPreferencesUpdate | undefined,
  onStartProgress?: StartProgressListener,
): Promise<PlaybackSession> {
  let attempt: PlaybackInstruction | undefined = instruction;
  let refusal: unknown;
  while (attempt) {
    try {
      return await playbackApi.create(media, attempt, seekMs, preferences, onStartProgress);
    } catch (error) {
      // Only a refusal of the instruction degrades: not unreachability, a
      // server fault or the account session cap. Classified, not `instanceof`,
      // because core raises its own error classes.
      const kind = classifyCreateRefusal(error);
      if (kind !== 'degrade') throw error;
      refusal = error;
      attempt = degradeInstruction(attempt);
    }
  }
  throw refusal;
}
