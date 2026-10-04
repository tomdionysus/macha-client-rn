import {
  ClusterPlaybackFactsApi,
  ClusterPlaybackResolver,
  preparePlaybackPatch,
  type AuthenticatedFetch,
  type ClusterEndpointRouter,
  type MediaSummary,
  type PlaybackInstruction,
  type PlaybackMediaFacts,
  type PlaybackPreferencesUpdate,
  type PlaybackSession,
  type PlaybackStartProgress,
  type PlaybackUpdate,
} from '@machafoundation/core';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import { audioCopyable, sessionAudioCodec, transformFor } from '../playback/policy';
import type { TranscodeRate } from '../playback/quality';
import type { SessionLedger } from '../playback/sessionLedger';

export type {
  PlaybackOptions,
  PlaybackOutputInfo,
  PlaybackPreferences,
  PlaybackPreferencesUpdate,
  PlaybackSelection,
  PlaybackSession,
  PlaybackSourceInfo,
  PlaybackStreamInfo,
  PlaybackStreamType,
  PlaybackTransform,
  PlaybackUpdate,
} from '@machafoundation/core';

/** Stage reports while a node prepares a start or change (`start=async`). Direct sessions never go pending. */
export type StartProgressListener = (progress: PlaybackStartProgress) => void;

/**
 * Playback sessions across the cluster: a thin adapter over core's
 * `ClusterPlaybackResolver` taking whole sessions and explicit instructions.
 *
 * The node performs whatever transform it is told, so the instruction is
 * decided client-side; capabilities passed to core are for diagnostics only.
 */
export class ClusterPlaybackApi {
  private readonly resolver: ClusterPlaybackResolver;
  private readonly factsApi: ClusterPlaybackFactsApi;

  /**
   * `ledger` records every session id handed out and forgets it only on a
   * successful close, so the next launch can close what a killed process left
   * open (see `sessionLedger.ts`).
   */
  constructor(
    router: ClusterEndpointRouter,
    auth: AuthenticatedFetch,
    private readonly ledger?: SessionLedger,
  ) {
    this.resolver = new ClusterPlaybackResolver(router, auth);
    this.factsApi = new ClusterPlaybackFactsApi(router, auth);
  }

  private held(session: PlaybackSession): PlaybackSession {
    this.ledger?.record(session.sessionId);
    return session;
  }

  /** The instruction is a complete transform, so it overrides any `video`/`audio` in `preferences`. */
  create(
    media: MediaSummary,
    instruction: PlaybackInstruction,
    seekMs?: number,
    preferences?: PlaybackPreferencesUpdate,
    onStartProgress?: StartProgressListener,
  ): Promise<PlaybackSession> {
    return this.resolver
      .resolve(media, deviceCapabilities(), seekMs, {
        ...preferences,
        mode: instruction.mode,
        video: instruction.video,
        audio: instruction.audio,
        ...(instruction.container ? { container: instruction.container } : {}),
      }, { onStartProgress })
      .then((session) => this.held(session));
  }

  /**
   * A replacement session on another node, skipping every node that has failed
   * this generation. The transform is restated so the replacement stays
   * decodable. No prepared standby: idle pipelines are reclaimed after about a
   * minute, so one would usually be dead when wanted.
   */
  failover(
    session: PlaybackSession,
    media: MediaSummary,
    seekMs: number,
    onStartProgress?: StartProgressListener,
  ): Promise<PlaybackSession> {
    return this.resolver
      .failover(
        session,
        media,
        deviceCapabilities(),
        seekMs,
        // Never copy audio this device cannot decode.
        transformFor(
          session.preferences.mode,
          audioCopyable(sessionAudioCodec(session), deviceCapabilities().audioCodecs ?? []),
        ),
        undefined,
        { onStartProgress },
      )
      .then((next) => {
        // Core releases the replaced session.
        this.ledger?.forget(session.sessionId);
        return this.held(next);
      });
  }

  /** Whether the issuing node still holds this session. Pinned, and records nothing against the node. */
  sessionAlive(session: PlaybackSession): Promise<boolean> {
    return this.resolver.sessionAlive(session.sessionId);
  }

  /**
   * A fresh session on the same node, for one that node reaped. Core closes the
   * old one first, as it holds the node's transcode slot. Throws with
   * `REGENERATION_ENDPOINT_GONE_CODE` if the node has left; the caller then
   * fails over.
   */
  regenerate(session: PlaybackSession, media: MediaSummary, seekMs: number): Promise<PlaybackSession> {
    return this.resolver
      .regenerate(
        session,
        media,
        deviceCapabilities(),
        seekMs,
        transformFor(
          session.preferences.mode,
          audioCopyable(sessionAudioCodec(session), deviceCapabilities().audioCodecs ?? []),
        ),
      )
      .then((next) => {
        this.ledger?.forget(session.sessionId);
        return this.held(next);
      });
  }

  /**
   * A PATCH that names its container and streams via core's
   * `preparePlaybackPatch`. Otherwise a mode change on a multi-audio file is
   * refused `choice_required` and core's retry picks the node's defaults, not
   * this device's. Seek-only updates pass through untouched.
   */
  update(
    session: PlaybackSession,
    update: PlaybackUpdate,
    signal?: AbortSignal,
    onStartProgress?: StartProgressListener,
  ): Promise<PlaybackSession> {
    return this.resolver.update(
      session.sessionId,
      preparePlaybackPatch(update, session, deviceCapabilities(), devicePlaybackOverrides()),
      signal,
      { onStartProgress },
    );
  }

  /**
   * Best measured transcode rate for this kind of picture on any node, or
   * undefined until one has been measured. Lets automatic play skip files no
   * node transcodes in real time. An arrow so it can be passed around.
   */
  readonly transcodeRate: NonNullable<TranscodeRate> = (source) => this.resolver.transcodeRate(source);

  stop(session: PlaybackSession): Promise<void> {
    return this.stopById(session.sessionId);
  }

  /** Close a session by id alone, including one from a previous process. */
  async stopById(sessionId: string): Promise<void> {
    await this.resolver.stop(sessionId);
    this.ledger?.forget(sessionId);
  }

  facts(ref: { itemId?: string; mediaId?: string }, signal?: AbortSignal): Promise<PlaybackMediaFacts[]> {
    return this.factsApi.facts(ref, signal);
  }

  recordEndpointFailure(endpointId: string): void {
    this.resolver.recordEndpointFailure(endpointId);
  }
}
