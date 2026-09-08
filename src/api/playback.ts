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
} from '@macha/core';
import { deviceCapabilities } from '../playback/capabilities';

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
} from '@macha/core';

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

  constructor(router: ClusterEndpointRouter, auth: AuthenticatedFetch, _viewerSession: string) {
    this.resolver = new ClusterPlaybackResolver(router, auth);
    this.factsApi = new ClusterPlaybackFactsApi(router, auth);
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
    return this.resolver.resolve(media, deviceCapabilities(), seekMs, {
      ...preferences,
      mode: instruction.mode,
      video: instruction.video,
      audio: instruction.audio,
      ...(instruction.container ? { container: instruction.container } : {}),
    });
  }

  update(session: PlaybackSession, update: PlaybackUpdate, signal?: AbortSignal): Promise<PlaybackSession> {
    return this.resolver.update(session.sessionId, update, signal);
  }

  stop(session: PlaybackSession): Promise<void> {
    return this.resolver.stop(session.sessionId);
  }

  facts(ref: { itemId?: string; mediaId?: string }, signal?: AbortSignal): Promise<PlaybackMediaFacts[]> {
    return this.factsApi.facts(ref, signal);
  }

  recordEndpointFailure(endpointId: string): void {
    this.resolver.recordEndpointFailure(endpointId);
  }
}
