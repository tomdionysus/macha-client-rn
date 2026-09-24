import type { MediaSortKey, SearchCategoryKey } from '@machafoundation/core';
import type { MediaSummary } from '../types';

/**
 * Every word a viewer reads about a catalogue item, composed here.
 *
 * **Tom's ruling, 2026-09-24, given to core directly: core writes no viewer
 * text.** It hands over structured data — `playbackContext`, `musicContext`
 * with the album's year, `seasonNumber`, `episodeNumber`, `discNumber`,
 * `trackNumber`, sort and category keys — and the wording is each client's.
 * Core cut its label helpers and `MediaSummary.subtitle` the same day; these
 * replace them, worded as the other clients word them so the four stay
 * alike by agreement rather than by a shared function.
 */

/** "Season 1 Episode 5", or "Episode 5" when the season is not known. */
export function episodeLabel(item: MediaSummary): string | undefined {
  if (item.kind !== 'episode' || item.episodeNumber === undefined) return undefined;
  const season = item.playbackContext?.season.seasonNumber ?? item.seasonNumber;
  return season === undefined ? `Episode ${item.episodeNumber}` : `Season ${season} Episode ${item.episodeNumber}`;
}

/**
 * "S01E05" — the compact form a season page lists, where the season is
 * already the page. It used to be the server's subtitle.
 */
export function episodeCode(item: Pick<MediaSummary, 'seasonNumber' | 'episodeNumber'>): string | undefined {
  if (item.episodeNumber === undefined) return undefined;
  const episode = `E${String(item.episodeNumber).padStart(2, '0')}`;
  return item.seasonNumber === undefined ? episode : `S${String(item.seasonNumber).padStart(2, '0')}${episode}`;
}

/** "Homogenic (1997)"; no year, no brackets. */
export function albumLabel(album: { title: string; year?: number }): string {
  return album.year === undefined ? album.title : `${album.title} (${album.year})`;
}

/** "Track 9", or "Disc 4 · Track 1" when there is more than one disc. */
export function trackNumberLabel(item: Pick<MediaSummary, 'discNumber' | 'trackNumber'>): string | undefined {
  if (item.trackNumber === undefined) return undefined;
  return item.discNumber !== undefined && item.discNumber > 1
    ? `Disc ${item.discNumber} · Track ${item.trackNumber}`
    : `Track ${item.trackNumber}`;
}

const SORT_LABELS: Record<MediaSortKey, string> = {
  relevance: 'Relevance',
  title: 'Title',
  year: 'Year',
  recent: 'Recently added',
};

/**
 * "Sort By Title" — each choice reads as a whole, with no "Sort by" heading
 * over the control (Tom, 2026-09-23). Core keeps the keys and the orders.
 */
export function sortChoiceLabel(key: MediaSortKey): string {
  return `Sort By ${SORT_LABELS[key]}`;
}

/** The search category toggles, named as on every client. */
export const CATEGORY_LABELS: Record<SearchCategoryKey, string> = {
  movies: 'Movies',
  shows: 'TV Shows',
  music: 'Music',
};

/**
 * A playlist's name, or a placeholder when it has none. Core stores an
 * unnamed list as `''` — the one it adopts from the store it replaced, and any
 * name that trims to nothing — and leaves the placeholder to the host.
 */
export function playlistName(playlist: { name: string }): string {
  return playlist.name || 'Untitled playlist';
}
