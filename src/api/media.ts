import type { ClusterCatalogueApi, CatalogueArtwork, CatalogueItem, CatalogueMediaProfile } from './catalogue';
import { MachaConnectionError } from './errors';
import type { Connectivity } from '../state/connectivity';
import type { OfflineLibrary } from './offlineLibrary';
import type {
  AlbumDetails,
  ArtistDetails,
  Artwork,
  ArtworkRef,
  Episode,
  LibraryHome,
  MediaDetails,
  MediaSummary,
  SeasonDetails,
  SeasonSummary,
  ShowDetails,
} from '../types';

function optional(value: number | null | undefined): number | undefined {
  return value ?? undefined;
}

/**
 * The UI-facing catalogue facade. Screens use this and never parse Macha JSON,
 * so a wire change stays inside `catalogue.ts` and this file.
 */
export class MediaApi {
  constructor(
    private readonly catalogue: ClusterCatalogueApi,
    private readonly offline?: OfflineLibrary,
    private readonly connectivity?: Connectivity,
  ) {}

  /**
   * Runs a catalogue request, falling back to what is stored on the device
   * when the cluster cannot be reached.
   *
   * Being away from your own network is ordinary for a phone, so an
   * unreachable node is a state to serve around rather than an error to show.
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
    return this.catalogue.status(signal);
  }

  mediaProfile(mediaId: string, signal?: AbortSignal): Promise<CatalogueMediaProfile | undefined> {
    return this.catalogue.mediaProfile(mediaId, signal);
  }

  artworkUrls(ref: ArtworkRef): string[] {
    // A signed capability URL needs no bearer token and is the cheapest path;
    // the per-node authenticated object URLs stay as fallbacks.
    const signed = ref.url ? [ref.url] : [];
    return [...signed, ...this.catalogue.artworkUrls(ref.id)];
  }

  home(signal?: AbortSignal): Promise<LibraryHome> {
    return this.serve(
      async () => {
        const [movies, shows, albums] = await Promise.all([
          this.catalogue.list('movie', undefined, signal),
          this.catalogue.list('show', undefined, signal),
          this.catalogue.list('album', undefined, signal),
        ]);
        return {
          movies: movies.map((item) => this.media(item)),
          shows: shows.map((item) => this.media(item)),
          albums: albums.map((item) => this.media(item)),
        };
      },
      (library) => library.home(),
    );
  }

  movies(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(
      async () => (await this.catalogue.list('movie', undefined, signal)).map((item) => this.media(item)),
      (library) => library.movies(),
    );
  }

  shows(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(
      async () => (await this.catalogue.list('show', undefined, signal)).map((item) => this.media(item)),
      (library) => library.shows(),
    );
  }

  artists(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(
      async () => (await this.catalogue.list('artist', undefined, signal)).map((item) => this.media(item)),
      (library) => library.artists(),
    );
  }

  albums(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(
      async () => (await this.catalogue.list('album', undefined, signal)).map((item) => this.media(item)),
      (library) => library.albums(),
    );
  }

  /**
   * Every track in the library, with album and artist ancestry attached.
   *
   * The catalogue only gives a track its `parent_id`, so a flat track list
   * would otherwise render without artist, album or cover art. Albums and
   * artists are small collections next to tracks, so joining them here costs
   * two extra list calls and saves one per row.
   */
  tracks(signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(() => this.liveTracks(signal), (library) => library.tracks());
  }

  private async liveTracks(signal?: AbortSignal): Promise<MediaSummary[]> {
    const [trackItems, albumItems, artistItems] = await Promise.all([
      this.catalogue.list('track', undefined, signal),
      this.catalogue.list('album', undefined, signal),
      this.catalogue.list('artist', undefined, signal),
    ]);
    const artistsById = new Map(artistItems.map((artist) => [artist.id, artist]));
    const albumsById = new Map(albumItems.map((album) => [album.id, album]));

    return trackItems
      .map((item) => {
        const track = this.media(item);
        const album = item.parent_id ? albumsById.get(item.parent_id) : undefined;
        if (!album) return track;
        const artist = album.parent_id ? artistsById.get(album.parent_id) : undefined;
        const albumArtwork = this.mapArtwork(album.effective_artwork ?? album.artwork ?? []);
        return {
          ...track,
          musicContext: {
            album: { id: album.id, title: album.title },
            artist: artist ? { id: artist.id, title: artist.title } : undefined,
            artwork: albumArtwork?.poster ?? albumArtwork?.thumbnail,
          },
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  search(query: string, signal?: AbortSignal): Promise<MediaSummary[]> {
    return this.serve(
      async () => (await this.catalogue.search(query, 50, signal)).map((item) => this.media(item)),
      (library) => library.search(query),
    );
  }

  /**
   * Detail for one item, plus exactly one level of children. Opening a series
   * lists its seasons; it deliberately does not download every episode.
   */
  details(id: string, signal?: AbortSignal): Promise<MediaDetails> {
    return this.serve(
      () => this.liveDetails(id, signal),
      (library) => {
        const stored = library.details(id);
        // Offline, an item that was never downloaded genuinely is not here.
        if (!stored) throw new MachaConnectionError('This item is not available offline.');
        return stored;
      },
    );
  }

  private async liveDetails(id: string, signal?: AbortSignal): Promise<MediaDetails> {
    const item = await this.catalogue.get(id, signal);

    if (item.kind === 'show') {
      const seasons = (await this.catalogue.list('season', item.id, signal))
        .map((season) => this.seasonSummary(season, item.id))
        .sort((a, b) => a.seasonNumber - b.seasonNumber);
      return { ...this.media(item), kind: 'show', seasons } as ShowDetails;
    }

    if (item.kind === 'season') {
      const [show, episodeItems] = await Promise.all([
        this.catalogue.get(this.parentId(item), signal),
        this.catalogue.list('episode', item.id, signal),
      ]);
      const episodes = episodeItems
        .map((episode) => this.episode(episode, item, show))
        .sort((a, b) => a.episodeNumber - b.episodeNumber);
      return { ...this.seasonSummary(item, show.id), episodes } as SeasonDetails;
    }

    if (item.kind === 'episode') {
      const season = await this.catalogue.get(this.parentId(item), signal);
      const show = await this.catalogue.get(this.parentId(season), signal);
      return this.episode(item, season, show);
    }

    if (item.kind === 'artist') {
      const albums = (await this.catalogue.list('album', item.id, signal))
        .map((album) => this.media(album))
        .sort(
          (a, b) =>
            (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER) ||
            a.title.localeCompare(b.title),
        );
      return { ...this.media(item), kind: 'artist', albums } as ArtistDetails;
    }

    if (item.kind === 'album') {
      const album = this.media(item);
      // The artist is one hop up. Fetching it here is what lets a track carry
      // its own artist name into a lock-screen notification and an offline
      // playlist row, instead of every caller re-deriving the ancestry.
      const artist = item.parent_id
        ? await this.catalogue.get(item.parent_id, signal).catch(() => undefined)
        : undefined;
      const context = {
        album: { id: item.id, title: item.title },
        artist: artist ? { id: artist.id, title: artist.title } : undefined,
        artwork: album.artwork?.poster ?? album.artwork?.thumbnail,
      };
      const tracks = (await this.catalogue.list('track', item.id, signal))
        .map((track) => ({ ...this.media(track), musicContext: context }))
        .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
      return { ...album, kind: 'album', tracks } as AlbumDetails;
    }

    return this.media(item);
  }

  /** The season's ordered episodes, used to build a play queue from a single episode. */
  async episodesOfSeason(seasonId: string, signal?: AbortSignal): Promise<Episode[]> {
    const details = await this.details(seasonId, signal);
    return 'episodes' in details ? (details as SeasonDetails).episodes : [];
  }

  /**
   * The single producer of episodes. A wire episode carries only its season's
   * `parent_id`, so the series/season ancestry that Continue Watching cards and
   * the player heading render is resolved here, never by callers.
   */
  private episode(item: CatalogueItem, season: CatalogueItem, show: CatalogueItem): Episode {
    const seasonNumber = season.season_number ?? 0;
    return {
      ...this.media(item),
      kind: 'episode',
      seasonNumber: item.season_number ?? seasonNumber,
      episodeNumber: item.episode_number ?? 0,
      playbackContext: {
        series: { id: show.id, title: show.title },
        season: { id: season.id, title: season.title || `Season ${seasonNumber}`, seasonNumber },
      },
    };
  }

  private parentId(item: CatalogueItem): string {
    if (!item.parent_id) throw new Error(`Catalogue ${item.kind} ${item.id} has no parent.`);
    return item.parent_id;
  }

  private seasonSummary(item: CatalogueItem, showId: string): SeasonSummary {
    const seasonNumber = item.season_number ?? 0;
    return {
      ...this.media(item),
      kind: 'season',
      showId,
      seasonNumber,
      title: item.title || `Season ${seasonNumber}`,
    };
  }

  private media(item: CatalogueItem): MediaSummary {
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: this.subtitle(item),
      year: optional(item.year),
      synopsis: item.synopsis || undefined,
      artwork: this.mapArtwork(item.effective_artwork ?? item.artwork ?? []),
      parentId: item.parent_id ?? undefined,
      seasonNumber: optional(item.season_number),
      episodeNumber: optional(item.episode_number),
      discNumber: optional(item.disc_number),
      trackNumber: optional(item.track_number),
      mediaIds: [...(item.media_ids ?? [])],
      catalogueUpdatedNs: item.updated_ns,
    };
  }

  private mapArtwork(items: CatalogueArtwork[]): Artwork | undefined {
    if (items.length === 0) return undefined;
    const byRole = (roles: string[]): ArtworkRef | undefined => {
      const match = items.find((candidate) => roles.includes(candidate.role));
      return match ? { id: match.id, mimeType: match.mime_type, url: match.url } : undefined;
    };
    const result: Artwork = {
      poster: byRole(['poster', 'cover']),
      backdrop: byRole(['backdrop', 'background', 'fanart']),
      thumbnail: byRole(['still', 'thumbnail', 'thumb']),
    };
    return result.poster || result.backdrop || result.thumbnail ? result : undefined;
  }

  private subtitle(item: CatalogueItem): string | undefined {
    if (item.kind === 'episode' && item.episode_number !== null) {
      const episode = String(item.episode_number).padStart(2, '0');
      if (item.season_number !== null) return `S${String(item.season_number).padStart(2, '0')}E${episode}`;
      return `Episode ${item.episode_number}`;
    }
    if (item.kind === 'season' && item.season_number !== null) return `Season ${item.season_number}`;
    if (item.kind === 'track' && item.track_number !== null) {
      return item.disc_number && item.disc_number > 1
        ? `Disc ${item.disc_number} · Track ${item.track_number}`
        : `Track ${item.track_number}`;
    }
    return undefined;
  }
}

/**
 * Home recency ordering. `updated_ns` is the catalogue's only chronology
 * signal; items without it fall back to title order rather than to the top.
 */
export function newestCatalogueFirst(items: readonly MediaSummary[]): MediaSummary[] {
  return [...items].sort((a, b) => {
    const left = a.catalogueUpdatedNs ?? 0;
    const right = b.catalogueUpdatedNs ?? 0;
    if (left !== right) return right - left;
    return a.title.localeCompare(b.title);
  });
}
