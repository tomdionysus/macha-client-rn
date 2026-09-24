import {
  ClusterPlaybackFactsApi,
  ClusterPlaybackResolver,
  type AuthenticatedFetch,
  type ClusterEndpointRouter,
  type MediaSummary,
  type PlaybackInstruction,
  type PlaybackMediaFacts,
  type PlaybackPreferencesUpdate,
  type PlaybackSession,
  type PlaybackUpdate,
} from '@machafoundation/core';
import { deviceCapabilities } from '../playback/capabilities';
import { audioCopyable, sessionAudioCodec, transformFor } from '../playback/policy';
import type { SessionLedger } from '../playback/sessionLedger';

// The session model and its wire decoding are core's. This module was a second
// implementation of both — the keystone of the duplication, and the reason the
// `restatePreferencesClearedByMode` mirror had to exist at all: that helper
// takes core's session shape, and this client used to decode its own.
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

/**
 * Playback sessions across the cluster.
 *
 * A thin adapter over core's `ClusterPlaybackResolver`, kept because this
 * client's callers speak in whole sessions and explicit instructions while
 * core's resolver speaks in session ids and preferences. Same shape as the
 * status API: core does the work, this supplies the vocabulary.
 *
 * `capabilities` goes to `resolve` for diagnostics only — it is never sent to a
 * node. The instruction is the decision, and it is made here by
 * `choosePlaybackInstruction` before the call, because the server performs what
 * it is told without asking what this device can decode.
 */
export class ClusterPlaybackApi {
  private readonly resolver: ClusterPlaybackResolver;
  private readonly factsApi: ClusterPlaybackFactsApi;

  /**
   * `ledger` writes down every session id handed out, so the next process can
   * close what a killed one left open; see `sessionLedger.ts`. Recorded when a
   * session is handed out and forgotten only when a close succeeds — a failed
   * close is exactly the case the next launch exists to retry.
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

  /**
   * An instruction is a complete transform, so it is spread over the caller's
   * preferences rather than merged under them: naming a mode restates the whole
   * transform, and a stale `video`/`audio` surviving from an earlier preference
   * is exactly the contradiction the server's 0.34.0 change exists to prevent.
   */
  create(
    media: MediaSummary,
    instruction: PlaybackInstruction,
    seekMs?: number,
    preferences?: PlaybackPreferencesUpdate,
  ): Promise<PlaybackSession> {
    return this.resolver
      .resolve(media, deviceCapabilities(), seekMs, {
        ...preferences,
        mode: instruction.mode,
        video: instruction.video,
        audio: instruction.audio,
        ...(instruction.container ? { container: instruction.container } : {}),
      })
      .then((session) => this.held(session));
  }

  /**
   * A replacement session for a generation whose node stopped serving it.
   *
   * Core records the failed endpoint and skips it, along with every node
   * already known to have failed this generation. The transform is restated
   * for the same reason it is on create: the node performs what it is told,
   * and a replacement that quietly picked its own could come back as something
   * this device cannot decode.
   *
   * Deliberately no prepared standby. Core supports one and the web client uses
   * it, but a session's pipeline is reclaimed after about a minute idle, so a
   * standby built on the first sign of trouble is usually dead by the time it
   * is wanted — measured here as a 3ms promotion followed by a 3s failure,
   * against 214ms to admit a fresh session. The admission was never the
   * expensive part; the player reload is.
   */
  failover(
    session: PlaybackSession,
    media: MediaSummary,
    seekMs: number,
  ): Promise<PlaybackSession> {
    return this.resolver
      .failover(
        session,
        media,
        deviceCapabilities(),
        seekMs,
        // Same judgement as a mode switch: a replacement must not be asked to
        // copy audio this device cannot decode. See `transformFor`.
        transformFor(
          session.preferences.mode,
          audioCopyable(sessionAudioCodec(session), deviceCapabilities().audioCodecs ?? []),
        ),
      )
      .then((next) => {
        // Core releases the session it replaced; this one is now the holding.
        this.ledger?.forget(session.sessionId);
        return this.held(next);
      });
  }

  /**
   * Whether the node that issued this session still holds it. Pinned to that
   * node, no walk, and **nothing recorded against it either way** — core's
   * rule, so that asking cannot cost the node anything.
   */
  sessionAlive(session: PlaybackSession): Promise<boolean> {
    return this.resolver.sessionAlive(session.sessionId);
  }

  /**
   * A fresh session on the **same** node, for one that node reaped.
   *
   * Core closes the old session first and waits for it, because the node's one
   * transcode slot is held by the session being replaced; no endpoint is
   * charged. The transform is restated as on `failover`, for the same reason.
   * Throws with `REGENERATION_ENDPOINT_GONE_CODE` when the node has left the
   * registry, and the caller then fails over.
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

  update(session: PlaybackSession, update: PlaybackUpdate, signal?: AbortSignal): Promise<PlaybackSession> {
    return this.resolver.update(session.sessionId, update, signal);
  }

  stop(session: PlaybackSession): Promise<void> {
    return this.stopById(session.sessionId);
  }

  /**
   * Close a session by id alone — including one from a previous process,
   * which core closes by recovering the node from the id.
   */
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
