import { MachaApiError } from './errors';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  mergeHeaders,
  normalizeBaseUrl,
  queryString,
  throwResponseError,
} from './http';
import { EndpointRegistry, withEndpointFailover } from './endpoints';
import { NO_AUTH, type AuthenticatedFetch } from './session';

export type CatalogueKind = 'movie' | 'show' | 'season' | 'episode' | 'artist' | 'album' | 'track';

export interface CatalogueArtwork {
  role: string;
  id: string;
  mime_type: string;
  /** Short-lived signed capability URL. Absent on a node that has not upgraded. */
  url?: string;
}

/** The exact JSON shape exposed by Macha's catalogue API. */
export interface CatalogueItem {
  id: string;
  kind: CatalogueKind;
  title: string;
  sort_title: string;
  synopsis: string;
  parent_id: string | null;
  year: number | null;
  season_number: number | null;
  episode_number: number | null;
  disc_number: number | null;
  track_number: number | null;
  aliases: string[];
  external_ids: Record<string, string>;
  media_ids: string[];
  artwork: CatalogueArtwork[];
  /** Server-resolved display artwork. Derived only; never canonical metadata. */
  effective_artwork?: CatalogueArtwork[];
  revision: number;
  updated_ns: number;
}

export interface CatalogueStatus {
  enabled: boolean;
  ready: boolean;
  metadata_generation: number;
  root: string | null;
  items: number;
  artwork_objects: number;
  local_artwork_objects: number;
  last_sync_unix_ms: number;
  error: string | null;
}

export interface CatalogueMediaStreamProfile {
  index: number;
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codec: string;
  profile: string;
  language: string;
  width: number;
  height: number;
  channels: number;
  sample_rate: number;
  bit_depth: number;
  default: boolean;
  forced: boolean;
  bitrate: number;
  attached_picture: boolean;
}

export interface CatalogueMediaProfile {
  schema_version: number;
  media_id: string;
  /**
   * The resolved container family (`mp4`, `matroska`, `webm`, `mp3`, ...).
   * Match on this, never on `format`: a demuxer name lists every container it
   * handles, so a Matroska file reports `matroska,webm` and matching the raw
   * string hands Matroska to anything that merely supports WebM.
   */
  container?: string;
  /** The raw libavformat demuxer name list. Diagnostic only. */
  format: string;
  duration_ms: number;
  bitrate: number;
  streams: CatalogueMediaStreamProfile[];
}

interface ItemEnvelope {
  items: CatalogueItem[];
}

function profilePending(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object') return false;
  const candidate = value as { status?: unknown; error?: unknown; code?: unknown; available?: unknown };
  const marker = [candidate.status, candidate.error, candidate.code]
    .find((entry): entry is string => typeof entry === 'string')
    ?.trim()
    .toLowerCase()
    .replace(/[ -]+/g, '_');
  return (
    marker === 'profile_not_available' ||
    marker === 'profile_pending' ||
    marker === 'not_available_yet' ||
    marker === 'profile_not_available_yet' ||
    candidate.available === false
  );
}

/**
 * The catalogue HTTP adapter for a single node. Cluster-wide behaviour — which
 * node to ask, and what to do when one stops answering — belongs to
 * `ClusterCatalogueApi` below, so this class stays a straight wire mapping.
 */
export class NodeCatalogueApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly auth: AuthenticatedFetch = NO_AUTH) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  status(signal?: AbortSignal): Promise<CatalogueStatus> {
    return this.request('/api/v1/catalogue/status', { method: 'GET', signal });
  }

  async list(kind?: CatalogueKind, parent?: string, signal?: AbortSignal): Promise<CatalogueItem[]> {
    const query = queryString([
      ['type', kind],
      ['parent', parent],
    ]);
    const envelope = await this.request<ItemEnvelope>(`/api/v1/catalogue/items${query ? `?${query}` : ''}`, {
      method: 'GET',
      signal,
    });
    return (envelope.items ?? []).map((item) => this.absolutize(item));
  }

  async get(id: string, signal?: AbortSignal): Promise<CatalogueItem> {
    return this.absolutize(
      await this.request<CatalogueItem>(`/api/v1/catalogue/items/${encodeURIComponent(id)}`, { method: 'GET', signal }),
    );
  }

  async search(query: string, limit = 50, signal?: AbortSignal): Promise<CatalogueItem[]> {
    const params = queryString([
      ['q', query],
      ['limit', String(limit)],
    ]);
    const envelope = await this.request<ItemEnvelope>(`/api/v1/catalogue/search?${params}`, { method: 'GET', signal });
    return (envelope.items ?? []).map((item) => this.absolutize(item));
  }

  /**
   * Immutable technical facts. Absence is temporary while catalogue hydration
   * catches up, so `202`/`404` are `undefined` rather than an error — the
   * detail screen simply shows less, and playback never waits on this.
   */
  async mediaProfile(mediaId: string, signal?: AbortSignal): Promise<CatalogueMediaProfile | undefined> {
    // Mutable path identities are deliberately ineligible for profile caching.
    if (!mediaId.startsWith('macha:')) return undefined;
    try {
      const profile = await this.request<CatalogueMediaProfile | Record<string, unknown> | undefined>(
        `/api/v1/catalogue/media/${encodeURIComponent(mediaId)}/profile`,
        { method: 'GET', signal },
      );
      if (profile === undefined || profilePending(profile)) return undefined;
      const candidate = profile as CatalogueMediaProfile;
      // Any schema the node emits is accepted, not one pinned version. Pinning
      // to 1 silently discarded every profile once the server moved to 2 —
      // invisibly, because profiles are advisory. Newer schemas only add
      // fields, so unknown ones are read for what they do carry.
      if (
        typeof candidate.schema_version !== 'number' ||
        candidate.schema_version < 1 ||
        candidate.media_id !== mediaId ||
        !Array.isArray(candidate.streams)
      ) {
        return undefined;
      }
      return candidate;
    } catch (error) {
      if (error instanceof MachaApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  /** Absolute URL for an artwork object on this node, for direct `<Image>` loading. */
  artworkUrl(id: string): string {
    return `${this.baseUrl}/api/v1/catalogue/artwork/${encodeURIComponent(id)}`;
  }

  /**
   * A signed artwork URL arrives as a bare path, meaningful only relative to
   * the node that issued it. Absolutizing it here means every layer above can
   * treat it as already correct and never rediscover which node it came from.
   */
  private resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (!this.baseUrl) return path;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private absolutizeArtwork(artwork: CatalogueArtwork): CatalogueArtwork {
    return artwork.url ? { ...artwork, url: this.resolveUrl(artwork.url) } : artwork;
  }

  private absolutize(item: CatalogueItem): CatalogueItem {
    return {
      ...item,
      artwork: (item.artwork ?? []).map((entry) => this.absolutizeArtwork(entry)),
      effective_artwork: item.effective_artwork?.map((entry) => this.absolutizeArtwork(entry)),
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetchWithTimeout(
      (url, requestInit) => this.auth.fetch(url, requestInit),
      `${this.baseUrl}${path}`,
      { ...init, headers: mergeHeaders(init.headers, { Accept: 'application/json' }) },
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) await throwResponseError(response, 'Macha catalogue request failed');
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      // `202 Accepted` with Retry-After may intentionally carry no body.
      if (response.status === 202) return undefined as T;
      throw new MachaApiError('Macha catalogue returned a malformed response.', response.status);
    }
  }
}

/**
 * The catalogue as the rest of the app sees it: one library, whichever node
 * happens to answer. Every call is retried across candidate endpoints, and the
 * node that answered becomes the sticky preference for the next one.
 */
export class ClusterCatalogueApi {
  constructor(private readonly registry: EndpointRegistry, private readonly auth: AuthenticatedFetch) {}

  private on<T>(call: (api: NodeCatalogueApi) => Promise<T>): Promise<T> {
    return withEndpointFailover(this.registry, (endpoint) => call(new NodeCatalogueApi(endpoint.baseUrl, this.auth)));
  }

  status(signal?: AbortSignal): Promise<CatalogueStatus> {
    return this.on((api) => api.status(signal));
  }

  list(kind?: CatalogueKind, parent?: string, signal?: AbortSignal): Promise<CatalogueItem[]> {
    return this.on((api) => api.list(kind, parent, signal));
  }

  get(id: string, signal?: AbortSignal): Promise<CatalogueItem> {
    return this.on((api) => api.get(id, signal));
  }

  search(query: string, limit?: number, signal?: AbortSignal): Promise<CatalogueItem[]> {
    return this.on((api) => api.search(query, limit, signal));
  }

  mediaProfile(mediaId: string, signal?: AbortSignal): Promise<CatalogueMediaProfile | undefined> {
    return this.on((api) => api.mediaProfile(mediaId, signal));
  }

  /**
   * Artwork is content-addressed, so any node that holds the object will do.
   * The preferred node is offered first and the rest as fallbacks, which the
   * image component walks through on decode or transport failure.
   */
  artworkUrls(id: string): string[] {
    return this.registry.candidates().map(({ endpoint }) => new NodeCatalogueApi(endpoint.baseUrl).artworkUrl(id));
  }
}
