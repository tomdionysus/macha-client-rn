import {
  compareIndexedTitles,
  isSearchable,
  searchCategoryOf,
  searchTerms,
  type SearchCategoryKey,
} from '@machafoundation/core';
import type { DownloadRecord, DownloadStore } from '../state/downloads';
import { offlineMedia } from '../state/downloads';
import type { AlbumDetails, ArtistDetails, LibraryHome, MediaDetails, MediaSummary, SeasonDetails, ShowDetails } from '../types';

/**
 * The library as it exists on this device.
 *
 * Downloads carry a full metadata snapshot, so an offline library can be
 * derived from them entirely — including albums and artists, which are
 * reconstructed from the ancestry each downloaded track already carries rather
 * than needing the catalogue.
 */
export class OfflineLibrary {
  constructor(private readonly downloads: DownloadStore) {}

  private records(): DownloadRecord[] {
    return this.downloads.complete();
  }

  private items(): MediaSummary[] {
    return this.records().map(offlineMedia);
  }

  private byKind(kind: MediaSummary['kind']): MediaSummary[] {
    return this.items()
      .filter((item) => item.kind === kind)
      .sort((a, b) => compareIndexedTitles(a.title, b.title));
  }

  get isEmpty(): boolean {
    return this.records().length === 0;
  }

  movies(): MediaSummary[] {
    return this.byKind('movie');
  }

  tracks(): MediaSummary[] {
    return this.items()
      .filter((item) => item.kind === 'track')
      .sort(
        (a, b) =>
          (a.musicContext?.album.title ?? '').localeCompare(b.musicContext?.album.title ?? '') ||
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      );
  }

  episodes(): MediaSummary[] {
    return this.items()
      .filter((item) => item.kind === 'episode')
      .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
  }

  /**
   * Albums reconstructed from downloaded tracks. An album exists offline
   * because some of its tracks do, so its artwork and title come from the
   * tracks themselves.
   */
  albums(): MediaSummary[] {
    const albums = new Map<string, MediaSummary>();
    for (const track of this.tracks()) {
      const context = track.musicContext;
      if (!context || albums.has(context.album.id)) continue;
      albums.set(context.album.id, {
        id: context.album.id,
        kind: 'album',
        title: context.album.title,
        subtitle: context.artist?.title,
        year: track.year,
        artwork: context.artwork ? { poster: context.artwork, thumbnail: context.artwork } : track.artwork,
        mediaIds: [],
        musicContext: context,
      });
    }
    return [...albums.values()].sort((a, b) => compareIndexedTitles(a.title, b.title));
  }

  artists(): MediaSummary[] {
    const artists = new Map<string, MediaSummary>();
    for (const track of this.tracks()) {
      const artist = track.musicContext?.artist;
      if (!artist || artists.has(artist.id)) continue;
      artists.set(artist.id, {
        id: artist.id,
        kind: 'artist',
        title: artist.title,
        artwork: track.musicContext?.artwork ? { poster: track.musicContext.artwork } : undefined,
        mediaIds: [],
      });
    }
    return [...artists.values()].sort((a, b) => compareIndexedTitles(a.title, b.title));
  }

  /** Series reconstructed from downloaded episodes, same principle as albums. */
  shows(): MediaSummary[] {
    const shows = new Map<string, MediaSummary>();
    for (const episode of this.episodes()) {
      const series = episode.playbackContext?.series;
      if (!series || shows.has(series.id)) continue;
      shows.set(series.id, {
        id: series.id,
        kind: 'show',
        title: series.title,
        artwork: episode.artwork,
        mediaIds: [],
      });
    }
    return [...shows.values()].sort((a, b) => compareIndexedTitles(a.title, b.title));
  }

  home(): LibraryHome {
    return { movies: this.movies(), shows: this.shows(), albums: this.albums() };
  }

  search(query: string, categories?: readonly SearchCategoryKey[]): MediaSummary[] {
    const haystack = [...this.movies(), ...this.shows(), ...this.albums(), ...this.artists(), ...this.tracks(), ...this.episodes()];
    return searchOffline(haystack, query, categories);
  }

  /** Detail for anything reachable offline, assembled from what is stored. */
  details(id: string): MediaDetails | undefined {
    const direct = this.items().find((item) => item.id === id);
    if (direct && (direct.kind === 'movie' || direct.kind === 'track' || direct.kind === 'episode')) return direct;

    const album = this.albums().find((item) => item.id === id);
    if (album) {
      const tracks = this.tracks().filter((track) => track.musicContext?.album.id === id);
      return { ...album, kind: 'album', tracks } as AlbumDetails;
    }

    const artist = this.artists().find((item) => item.id === id);
    if (artist) {
      const albums = this.albums().filter((entry) => entry.musicContext?.artist?.id === id);
      return { ...artist, kind: 'artist', albums } as ArtistDetails;
    }

    const show = this.shows().find((item) => item.id === id);
    if (show) {
      // Seasons are synthesised from the episodes actually held, so a part-
      // downloaded series still navigates the way the online one does.
      const seasons = new Map<string, SeasonDetails>();
      for (const episode of this.episodes()) {
        const context = episode.playbackContext;
        if (!context || context.series.id !== id) continue;
        const existing = seasons.get(context.season.id);
        if (existing) existing.episodes.push(episode as never);
        else
          seasons.set(context.season.id, {
            id: context.season.id,
            kind: 'season',
            title: context.season.title,
            showId: id,
            seasonNumber: context.season.seasonNumber,
            artwork: episode.artwork,
            mediaIds: [],
            episodes: [episode as never],
          });
      }
      const seasonList = [...seasons.values()].sort((a, b) => a.seasonNumber - b.seasonNumber);
      const season = seasonList.find((entry) => entry.id === id);
      if (season) return season;
      return { ...show, kind: 'show', seasons: seasonList } as ShowDetails;
    }

    // A season addressed directly, rather than through its series.
    for (const episode of this.episodes()) {
      const context = episode.playbackContext;
      if (context?.season.id !== id) continue;
      const episodes = this.episodes().filter((entry) => entry.playbackContext?.season.id === id);
      return {
        id,
        kind: 'season',
        title: context.season.title,
        showId: context.series.id,
        seasonNumber: context.season.seasonNumber,
        artwork: episode.artwork,
        mediaIds: [],
        episodes: episodes as never,
      } as SeasonDetails;
    }

    return direct;
  }
}

/**
 * Search over what is downloaded, on the same terms as the live search.
 *
 * Tom's rulings, relayed by core and confirmed here 2026-09-24: "the", "a" and
 * "an" are never searched on, at least `MIN_SEARCH_TERM_LENGTH` characters must
 * be left, and the category toggles narrow the result — an empty list means
 * nothing, absent means everything. Core applies all three inside
 * `MachaMediaApi.search`; this is the offline path, which applied none, so the
 * same query answered differently in airplane mode. The rules are core's
 * functions, used as they are.
 */
export function searchOffline(
  haystack: readonly MediaSummary[],
  query: string,
  categories?: readonly SearchCategoryKey[],
): MediaSummary[] {
  if (!isSearchable(query)) return [];
  if (categories && categories.length === 0) return [];
  const needle = searchTerms(query).toLowerCase();
  const allowed = categories ? new Set(categories) : undefined;
  return haystack.filter((item) => {
    if (allowed) {
      const category = searchCategoryOf(item.kind);
      if (!category || !allowed.has(category)) return false;
    }
    return [item.title, item.musicContext?.album.title, item.musicContext?.artist?.title, item.playbackContext?.series.title]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });
}
