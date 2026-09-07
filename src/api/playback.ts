import * as Crypto from 'expo-crypto';
import { MachaApiError, parseErrorEnvelope } from './errors';
import { fetchWithTimeout, mergeHeaders, normalizeBaseUrl, queryString, retryAfterMs, throwResponseError } from './http';
import { EndpointRegistry, withEndpointFailover, type Endpoint } from './endpoints';
import { NO_AUTH, type AuthenticatedFetch } from './session';
import type { MediaSummary, PlaybackCapabilities, PlaybackMode, PlaybackSource } from '../types';

/** Session negotiation may involve real work on the node; it gets a longer deadline than the catalogue. */
const SESSION_TIMEOUT_MS = 20_000;

export type PlaybackStreamType = 'video' | 'audio' | 'subtitle' | 'other';
export type PlaybackTransform = 'copy' | 'transcode' | 'omit';

export interface PlaybackStreamInfo {
  index: number;
  type: PlaybackStreamType;
  codec: string;
  profile: string;
  language: string;
  default: boolean;
  forced: boolean;
  width?: number;
  height?: number;
  channels?: number;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
}

export interface PlaybackSourceInfo {
  path: string;
  format: string;
  size: number;
  bitrate: number;
  streams: PlaybackStreamInfo[];
}

export interface PlaybackOutputInfo {
  format?: string;
  bitrate?: number;
  video?: {
    sourceStream: number;
    transform: PlaybackTransform;
    codec?: string;
    profile?: string;
    width?: number;
    height?: number;
    bitrate?: number;
  };
  audio?: {
    sourceStream: number;
    transform: PlaybackTransform;
    codec?: string;
    profile?: string;
    channels?: number;
    sampleRate?: number;
    bitDepth?: number;
    bitrate?: number;
  };
}

export interface PlaybackOptions {
  modes: PlaybackMode[];
  qualityHeights: number[];
  mediaIds: string[];
  audioStreams: PlaybackStreamInfo[];
  subtitleStreams: PlaybackStreamInfo[];
  canSeek: boolean;
  canChangeQuality: boolean;
  canSwitchMedia: boolean;
}

export interface PlaybackPreferences {
  mode: PlaybackMode | 'auto';
  maxHeight: number | null;
  maxBitrate: number | null;
  audioStream: number | null;
  subtitleStream: number | null;
  audioLanguage: string;
  subtitleLanguage: string;
}

export interface PlaybackPreferencesUpdate {
  mode?: PlaybackMode | 'auto';
  maxHeight?: number | null;
  maxBitrate?: number | null;
  audioStream?: number | null;
  subtitleStream?: number | null;
  audioLanguage?: string;
  subtitleLanguage?: string;
}

export interface PlaybackSession {
  sessionId: string;
  /** Node provenance for this disposable playback generation. */
  endpoint: { id: string; baseUrl: string };
  itemId?: string;
  mediaId: string;
  mode: PlaybackMode;
  mimeType: string;
  source: PlaybackSource;
  durationMs: number;
  seekMs: number;
  preferences: PlaybackPreferences;
  sourceInfo: PlaybackSourceInfo;
  output: PlaybackOutputInfo;
  selected: { videoStream: number; audioStream: number; subtitleStream: number };
  transform: { video: PlaybackTransform; audio: PlaybackTransform };
  options: PlaybackOptions;
}

export interface PlaybackUpdate {
  preferences?: PlaybackPreferencesUpdate;
  seekMs?: number;
  mediaId?: string;
}

interface WireStream {
  index: number;
  type: PlaybackStreamType;
  codec: string;
  profile: string;
  language: string;
  default: boolean;
  forced: boolean;
  width?: number;
  height?: number;
  channels?: number;
  sample_rate?: number;
  bit_depth?: number;
  bitrate?: number;
}

interface WireSession {
  session_id: string;
  item_id?: string;
  media_id: string;
  mode: PlaybackMode;
  duration_ms: number;
  seek_ms: number;
  preferences: {
    mode: PlaybackMode | 'auto';
    max_height: number | null;
    max_bitrate: number | null;
    audio_stream: number | null;
    subtitle_stream: number | null;
    audio_language: string;
    subtitle_language: string;
  };
  selection: { video_stream: number; audio_stream: number; subtitle_stream: number };
  source: { path: string; format: string; size: number; bitrate: number; streams: WireStream[] };
  output: {
    format?: string;
    bitrate?: number;
    video?: { source_stream: number; transform: PlaybackTransform; codec?: string; profile?: string; width?: number; height?: number; bitrate?: number };
    audio?: { source_stream: number; transform: PlaybackTransform; codec?: string; profile?: string; channels?: number; sample_rate?: number; bit_depth?: number; bitrate?: number };
  };
  stream: { url: string; mime_type: string; subtitle_url: string | null };
  options: {
    modes: PlaybackMode[];
    quality_heights: number[];
    media_ids: string[];
    audio_streams: WireStream[];
    subtitle_streams: WireStream[];
    can_seek: boolean;
    can_change_quality: boolean;
    can_switch_media: boolean;
  };
}

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

function mapStream(stream: WireStream): PlaybackStreamInfo {
  return {
    index: stream.index,
    type: stream.type,
    codec: stream.codec,
    profile: stream.profile,
    language: stream.language,
    default: stream.default,
    forced: stream.forced,
    width: stream.width,
    height: stream.height,
    channels: stream.channels,
    sampleRate: stream.sample_rate,
    bitDepth: stream.bit_depth,
    bitrate: stream.bitrate,
  };
}

function wirePreferences(preferences?: PlaybackPreferencesUpdate): Record<string, unknown> | undefined {
  if (!preferences) return undefined;
  const out: Record<string, unknown> = {};
  if (preferences.mode !== undefined) out.mode = preferences.mode;
  if (preferences.maxHeight !== undefined) out.max_height = preferences.maxHeight;
  if (preferences.maxBitrate !== undefined) out.max_bitrate = preferences.maxBitrate;
  if (preferences.audioStream !== undefined) out.audio_stream = preferences.audioStream;
  if (preferences.subtitleStream !== undefined) out.subtitle_stream = preferences.subtitleStream;
  if (preferences.audioLanguage !== undefined) out.audio_language = preferences.audioLanguage;
  if (preferences.subtitleLanguage !== undefined) out.subtitle_language = preferences.subtitleLanguage;
  return out;
}

/** Playback session control against one node. */
export class NodePlaybackApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly auth: AuthenticatedFetch = NO_AUTH, private readonly viewerSession?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async create(
    media: MediaSummary,
    capabilities: PlaybackCapabilities,
    seekMs: number | undefined,
    preferences: PlaybackPreferencesUpdate | undefined,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<PlaybackSession> {
    const wireCapabilities: Record<string, unknown> = {
      containers: capabilities.containers,
      video_codecs: capabilities.videoCodecs,
      audio_codecs: capabilities.audioCodecs,
      hls_fmp4: capabilities.hls,
    };
    if (capabilities.maxWidth !== undefined) wireCapabilities.max_width = capabilities.maxWidth;
    if (capabilities.maxHeight !== undefined) wireCapabilities.max_height = capabilities.maxHeight;

    const body: Record<string, unknown> = {
      item_id: media.id,
      capabilities: wireCapabilities,
      preferences: wirePreferences({ ...preferences, mode: preferences?.mode ?? 'auto' }),
    };
    if (seekMs !== undefined) body.seek_ms = Math.max(0, Math.round(seekMs));

    const wire = await this.request<WireSession>(
      `/api/v1/playback/sessions?${queryString([['idempotency_key', idempotencyKey]])}`,
      { method: 'POST', body: JSON.stringify(body), signal },
    );
    return this.mapSession(wire);
  }

  async update(sessionId: string, update: PlaybackUpdate, signal?: AbortSignal): Promise<PlaybackSession> {
    const body: Record<string, unknown> = {};
    const preferences = wirePreferences(update.preferences);
    if (preferences) body.preferences = preferences;
    if (update.seekMs !== undefined) body.seek_ms = Math.max(0, Math.round(update.seekMs));
    if (update.mediaId !== undefined) body.media_id = update.mediaId;
    return this.mapSession(
      await this.request<WireSession>(`/api/v1/playback/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      }),
    );
  }

  async stop(sessionId: string): Promise<void> {
    try {
      await this.request<void>(`/api/v1/playback/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (error) {
      // Expiry and explicit cleanup are equivalent from the client's view.
      if (error instanceof MachaApiError && error.status === 404) return;
      throw error;
    }
  }

  private streamUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (!this.baseUrl) return path;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private mapSession(wire: WireSession): PlaybackSession {
    const source: PlaybackSource = {
      mediaId: wire.media_id,
      url: this.streamUrl(wire.stream.url),
      subtitleUrl: wire.stream.subtitle_url ? this.streamUrl(wire.stream.subtitle_url) : undefined,
      mimeType: wire.stream.mime_type,
      mode: wire.mode,
      durationMs: wire.duration_ms,
      sizeBytes: wire.source.size,
    };
    return {
      sessionId: wire.session_id,
      endpoint: { id: this.baseUrl || 'same-origin', baseUrl: this.baseUrl },
      itemId: wire.item_id,
      mediaId: wire.media_id,
      mode: wire.mode,
      mimeType: wire.stream.mime_type,
      source,
      durationMs: wire.duration_ms,
      seekMs: wire.seek_ms,
      preferences: {
        mode: wire.preferences.mode,
        maxHeight: wire.preferences.max_height,
        maxBitrate: wire.preferences.max_bitrate,
        audioStream: wire.preferences.audio_stream,
        subtitleStream: wire.preferences.subtitle_stream,
        audioLanguage: wire.preferences.audio_language,
        subtitleLanguage: wire.preferences.subtitle_language,
      },
      sourceInfo: {
        path: wire.source.path,
        format: wire.source.format,
        size: wire.source.size,
        bitrate: wire.source.bitrate,
        streams: (wire.source.streams ?? []).map(mapStream),
      },
      output: {
        format: wire.output?.format,
        bitrate: wire.output?.bitrate,
        video: wire.output?.video
          ? {
              sourceStream: wire.output.video.source_stream,
              transform: wire.output.video.transform,
              codec: wire.output.video.codec,
              profile: wire.output.video.profile,
              width: wire.output.video.width,
              height: wire.output.video.height,
              bitrate: wire.output.video.bitrate,
            }
          : undefined,
        audio: wire.output?.audio
          ? {
              sourceStream: wire.output.audio.source_stream,
              transform: wire.output.audio.transform,
              codec: wire.output.audio.codec,
              profile: wire.output.audio.profile,
              channels: wire.output.audio.channels,
              sampleRate: wire.output.audio.sample_rate,
              bitDepth: wire.output.audio.bit_depth,
              bitrate: wire.output.audio.bitrate,
            }
          : undefined,
      },
      selected: {
        videoStream: wire.selection.video_stream,
        audioStream: wire.selection.audio_stream,
        subtitleStream: wire.selection.subtitle_stream,
      },
      transform: {
        video: wire.output?.video?.transform ?? 'omit',
        audio: wire.output?.audio?.transform ?? 'omit',
      },
      options: {
        // Direct is an explicit user override, not a capability-derived offer:
        // always expose it alongside the server-derived Remux/Transcode choices.
        modes: ['direct', ...(wire.options.modes ?? []).filter((mode) => mode !== 'direct')],
        qualityHeights: wire.options.quality_heights ?? [],
        mediaIds: wire.options.media_ids ?? [],
        audioStreams: (wire.options.audio_streams ?? []).map(mapStream),
        subtitleStreams: (wire.options.subtitle_streams ?? []).map(mapStream),
        canSeek: wire.options.can_seek,
        canChangeQuality: wire.options.can_change_quality,
        canSwitchMedia: wire.options.can_switch_media,
      },
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetchWithTimeout(
      (url, requestInit) => this.auth.fetch(url, requestInit),
      `${this.baseUrl}${path}`,
      {
        ...init,
        headers: mergeHeaders(init.headers, {
          Accept: 'application/json',
          'Content-Type': init.body !== undefined ? 'application/json' : undefined,
          // One logical viewer and its single transcode entitlement. Not an
          // account, an authorization credential, or a progress identity.
          'Macha-Viewer-Session': this.viewerSession,
        }),
      },
      SESSION_TIMEOUT_MS,
    );
    if (!response.ok) await throwResponseError(response, 'Macha playback request failed');
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => undefined)) as unknown;
    if (response.status === 202) {
      // Asynchronous profile-pending belongs to the optional profile GET only.
      // A session POST answering this way is a non-conforming node, so treat it
      // as an endpoint failure and let failover try somebody else.
      const parsed = parseErrorEnvelope(body, 'Playback profile is pending.');
      throw new MachaApiError(
        `Macha playback session was not created: ${parsed.message}`,
        503,
        parsed.code,
        retryAfterMs(response.headers.get('retry-after')),
      );
    }
    return body as T;
  }
}

/**
 * Playback session control across the cluster.
 *
 * Session creation is an *admission* operation: each distinct admission gets a
 * fresh idempotency key, and retries of that same admission across nodes keep
 * the key and the exact body, so a node that already accepted the request
 * cannot leave a duplicate lease behind. Once a session exists it belongs to
 * the node that issued it, so `update` and `stop` address that node directly
 * and never fail over.
 */
export class ClusterPlaybackApi {
  constructor(
    private readonly registry: EndpointRegistry,
    private readonly auth: AuthenticatedFetch,
    private readonly viewerSession: string,
  ) {}

  private node(endpoint: Endpoint | { baseUrl: string }): NodePlaybackApi {
    return new NodePlaybackApi(endpoint.baseUrl, this.auth, this.viewerSession);
  }

  create(
    media: MediaSummary,
    capabilities: PlaybackCapabilities,
    seekMs?: number,
    preferences?: PlaybackPreferencesUpdate,
    signal?: AbortSignal,
  ): Promise<PlaybackSession> {
    const idempotencyKey = newIdempotencyKey();
    return withEndpointFailover(this.registry, (endpoint) =>
      this.node(endpoint).create(media, capabilities, seekMs, preferences, idempotencyKey, signal),
    );
  }

  update(session: PlaybackSession, update: PlaybackUpdate, signal?: AbortSignal): Promise<PlaybackSession> {
    return this.node(session.endpoint).update(session.sessionId, update, signal);
  }

  stop(session: PlaybackSession): Promise<void> {
    return this.node(session.endpoint).stop(session.sessionId);
  }

  recordEndpointFailure(endpointId: string): void {
    this.registry.recordFailure(endpointId);
  }
}
