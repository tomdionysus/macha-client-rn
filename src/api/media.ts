import {
  currentAvailability,
  MachaConnectionError,
  MachaMediaApi,
  type ArtworkSource,
  type ItemAvailability,
  type SearchCategoryKey,
} from '@machafoundation/core';
import type { ClusterCatalogueApi, CatalogueMediaProfile } from './catalogue';
import type { ArtworkRef, Episode, LibraryHome, MediaDetails, MediaSummary, SeasonDetails } from '../types';
import type { OfflineLibrary } from './offlineLibrary';
import type { Connectivity } from '../state/connectivity';
import { isAuthRefusal, isSessionNotStarted, isUnreachable } from './errors';

export { newestCatalogueFirst } from '@machafoundation/core';

/**
 * The UI-facing catalogue facade: core's `MachaMediaApi` plus a fallback to
 * downloads, since a phone away from its network is an ordinary state, not an
 * error.
 */
export class MediaApi {
  private readonly live: MachaMediaApi;

  constructor(
    private readonly catalogue: ClusterCatalogueApi,
    private readonly offline?: OfflineLibrary,
    private readonly connectivity?: Connectivity,
    /**
     * Whether this cluster will serve media to the current viewer. A function
     * because access is learned after the services are built, and rebuilding
     * them would bump `generation` and reload every screen.
     */
    private readonly mayRequest?: () => boolean,
  ) {
    this.live = new MachaMediaApi(catalogue);
  }

  /**
   * Runs a catalogue request, serving downloads instead when the cluster is
   * unreachable, refuses this viewer, or the session has not started. Any other
   * answer (a 404, a 500) is real and is thrown.
   */
  private async serve<T>(live: () => Promise<T>, stored: (library: OfflineLibrary) => T): Promise<T> {
    const library = this.offline;
    // A cluster that refuses this viewer refuses every call, so do not ask.
    if (library && this.mayRequest && !this.mayRequest()) return stored(library);
    if (library && this.connectivity?.isOffline && !this.connectivity.shouldProbe()) return stored(library);
    try {
      const result = await live();
      this.connectivity?.reportReachable();
      return result;
    } catch (error) {
      // Session not started yet: normal on cold start, since child effects (a
      // screen's first load) run before the provider starts the manager. Must
      // precede the unreachable branch, as `SessionNotStartedError` extends
      // `MachaConnectionError`, and must not report the cluster offline, which
      // would suppress real requests until the next probe.
      if (library && isSessionNotStarted(error)) return stored(library);
      if (library && isUnreachable(error)) {
        this.connectivity?.reportUnreachable();
        return stored(library);
      }
      // A refusal: serve downloads and let the access notice explain the rest.
      // The cluster answered, so it is not reported unreachable.
      if (library && isAuthRefusal(error)) return stored(library);
      throw error;
    }
  }

  status(signal?: AbortSignal) {
    return this.live.status(signal);
  }

  mediaProfile(mediaId: string, signal?: AbortSignal): Promise<CatalogueMediaProfile | undefined> {
    return this.live.mediaProfile(mediaId, signal);
  }

  /**
   * Where to load an artwork object from, best first. Each entry says whether
   * it needs the Authorization header (signed URLs do not, per-node URLs do);
   * callers that cannot set headers filter on that, not on position.
   */
  artworkUrls(ref: ArtworkRef): ArtworkSource[] {
    return this.live.artworkUrls(ref);
  }

  /**
   * Tells core an artwork URL loaded, so later candidates prefer its host and
   * `expo-image`'s URL-keyed cache stays warm. Call on success only.
   */
  noteArtworkLoaded(url: string): void {
    this.live.noteArtworkLoaded(url);
  }

  home(signal?: AbortSignal): Promise<LibraryHome> {
    return this.serve(() => this.live.home(signal), (library) => library.home());
  }

  movies(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.movies(signal), (library) => library.movies());
  }

  shows(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.shows(signal), (library) => library.shows());
  }

  artists(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.artists(signal), (library) => library.artists());
  }

  albums(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.albums(signal), (library) => library.albums());
  }

  tracks(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.tracks(signal), (library) => library.tracks());
  }

  /** `categories` narrows by kind: absent is everything, empty is nothing. */
  search(query: string, signal?: AbortSignal, categories?: readonly SearchCategoryKey[]): Promise<MediaSummary[]> {
    return this.serve(
      () => this.live.search(query, signal, categories ? { categories } : undefined),
      (library) => library.search(query, categories),
    );
  }

  /** The season's ordered episodes, used to build a play queue from a single episode. */
  async episodesOfSeason(seasonId: string, signal?: AbortSignal): Promise<Episode[]> {
    const details = await this.details(seasonId, signal);
    return 'episodes' in details ? (details as SeasonDetails).episodes : [];
  }

  /**
   * Current availability of stored titles, by item id (stores do not keep it).
   * Empty when the cluster will not serve this viewer; a title missing from the
   * answer shows no marker and stays playable.
   */
  async currentAvailability(itemIds: readonly string[], signal?: AbortSignal): Promise<Map<string, ItemAvailability>> {
    if (itemIds.length === 0 || this.mayRequest?.() === false) return new Map();
    return currentAvailability(itemIds, this.catalogue, signal);
  }

  details(id: string, signal?: AbortSignal): Promise<MediaDetails> {
    return this.serve(
      () => this.live.details(id, signal),
      (library) => {
        const stored = library.details(id);
        if (!stored) throw new MachaConnectionError('This item is not available offline.');
        return stored;
      },
    );
  }
}
