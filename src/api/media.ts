import { MachaConnectionError, MachaMediaApi, type ArtworkSource, type SearchCategoryKey } from '@machafoundation/core';
import type { ClusterCatalogueApi, CatalogueMediaProfile } from './catalogue';
import type { ArtworkRef, Episode, LibraryHome, MediaDetails, MediaSummary, SeasonDetails } from '../types';
import type { OfflineLibrary } from './offlineLibrary';
import type { Connectivity } from '../state/connectivity';
import { isAuthRefusal, isSessionNotStarted, isUnreachable } from './errors';

export { newestCatalogueFirst } from '@machafoundation/core';

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
    /**
     * Whether this cluster will serve media to whoever we currently are.
     *
     * A function rather than a value because access is discovered after the
     * services are built — a session has to be minted and a whoami answered
     * before anything is known — and rebuilding every service to carry the
     * answer would bump `generation` and re-run every screen's load.
     */
    private readonly mayRequest?: () => boolean,
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
    // A cluster that has refused this viewer will refuse every catalogue call,
    // and it refuses with a real answer rather than a transport fault — so the
    // `MachaConnectionError` fallback below never fires for it, and the screen
    // shows an error where the device's own library was the right answer.
    // Decided before asking, because there is nothing useful to catch after.
    if (library && this.mayRequest && !this.mayRequest()) return stored(library);
    if (library && this.connectivity?.isOffline && !this.connectivity.shouldProbe()) return stored(library);
    try {
      const result = await live();
      this.connectivity?.reportReachable();
      return result;
    } catch (error) {
      // "We could not ask" — a third answer, and it must not be read as either
      // of the two below. It arrives before `start()` on every cold start:
      // `AppShell` mounts screens on the render `hydrated` flips, and React runs
      // child effects before parent effects, so a screen's first load fires
      // before the provider's effect has started the session manager.
      //
      // This sits *ahead* of the branch below because core `0.12.0` made
      // `SessionNotStartedError` extend `MachaConnectionError` — which is what
      // keeps this fallback working for hosts that do nothing, but would
      // otherwise route it through `reportUnreachable()`. That would mark a
      // cluster that is up and answering as offline, and `shouldProbe()` then
      // suppresses real requests for twenty seconds, so a viewer on a healthy
      // node gets their downloads instead of their library on every launch.
      // The stored library is still the right answer; the offline verdict is
      // not. Same reasoning as the refusal branch below, for the same reason.
      if (library && isSessionNotStarted(error)) return stored(library);
      if (library && isUnreachable(error)) {
        this.connectivity?.reportUnreachable();
        return stored(library);
      }
      // A refusal is an answer, and the device's own library is the honest
      // reply to it: these are the items this viewer may actually have. The
      // access notice says why the rest is missing, so nothing is hidden —
      // what is avoided is a raw bearer-token message on a library screen.
      //
      // Deliberately no `reportUnreachable` here. The cluster is perfectly
      // reachable and answered promptly; recording it as offline would suppress
      // real requests and mislabel a working node.
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
   * Where to load an artwork object from, best first.
   *
   * Each entry states whether it needs the anonymous session's Authorization
   * header: a signed
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

  /** `categories` narrows by kind: absent is everything, empty is nothing. Core's rule, on both paths. */
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
