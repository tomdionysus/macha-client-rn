import { MachaMediaApi, MachaConnectionError, type ArtworkSource } from '@macha/core';
import type { ClusterCatalogueApi, CatalogueMediaProfile } from './catalogue';
import type { ArtworkRef, Episode, LibraryHome, MediaDetails, MediaSummary, SeasonDetails } from '../types';
import type { OfflineLibrary } from './offlineLibrary';
import type { Connectivity } from '../state/connectivity';

export { newestCatalogueFirst } from '@macha/core';

/**
 * The UI-facing catalogue facade, with offline fallback.
 *
 * The live path is core's `MachaMediaApi` — the catalogue calls and the mapping
 * from wire items to the model, which this file used to reimplement. What stays
 * here is the part core has no business knowing about: being away from your own
 * network is ordinary for a phone, so an unreachable node is a state to serve
 * around rather than an error to show.
 */
export class MediaApi {
  private readonly live: MachaMediaApi;

  constructor(
    catalogue: ClusterCatalogueApi,
    private readonly offline?: OfflineLibrary,
    private readonly connectivity?: Connectivity,
  ) {
    this.live = new MachaMediaApi(catalogue);
  }

  /**
   * Runs a catalogue request, falling back to what is stored on the device when
   * the cluster cannot be reached.
   *
   * Only transport failures fall back: a node that answers with a 404 has
   * genuinely answered, and pretending otherwise would hide real problems.
   */
  private async serve<T>(live: () => Promise<T>, stored: (library: OfflineLibrary) => T): Promise<T> {
    const library = this.offline;
    if (library && this.connectivity?.isOffline && !this.connectivity.shouldProbe()) return stored(library);
    try {
      const result = await live();
      this.connectivity?.reportReachable();
      return result;
    } catch (error) {
      if (library && error instanceof MachaConnectionError) {
        this.connectivity?.reportUnreachable();
        return stored(library);
      }
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
   * Where to load an artwork object from, best first.
   *
   * Each entry states whether it needs the viewer's bearer token: a signed
   * capability URL does not, the per-node object URLs do. Callers filter on
   * that rather than counting positions, so a path that cannot set headers
   * cannot silently 401 on a fallback.
   */
  artworkUrls(ref: ArtworkRef): ArtworkSource[] {
    return this.live.artworkUrls(ref);
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

  search(query: string, signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.live.search(query, signal), (library) => library.search(query));
  }

  /** The season's ordered episodes, used to build a play queue from a single episode. */
  async episodesOfSeason(seasonId: string, signal?: AbortSignal): Promise<Episode[]> {
    const details = await this.details(seasonId, signal);
    return 'episodes' in details ? (details as SeasonDetails).episodes : [];
  }

  details(id: string, signal?: AbortSignal): Promise<MediaDetails> {
    return this.serve(
      () => this.live.details(id, signal),
      (library) => {
        const stored = library.details(id);
        // Offline, an item that was never downloaded genuinely is not here.
        if (!stored) throw new MachaConnectionError('This item is not available offline.');
        return stored;
      },
    );
  }
}
