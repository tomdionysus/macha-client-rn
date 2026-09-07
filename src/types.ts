import type { CatalogueKind } from './api/catalogue';

export type MediaKind = CatalogueKind;

export interface ArtworkRef {
  id: string;
  mimeType: string;
  /**
   * Short-lived signed capability URL when the node supplies one. It needs no
   * Authorization header, so it can go straight into an `<Image>` source.
   */
  url?: string;
}

export interface Artwork {
  poster?: ArtworkRef;
  backdrop?: ArtworkRef;
  thumbnail?: ArtworkRef;
}

export interface PlaybackHierarchyContext {
  series: { id: string; title: string };
  season: { id: string; title: string; seasonNumber: number };
}

export interface MusicHierarchyContext {
  album: { id: string; title: string };
  artist?: { id: string; title: string };
  /** Album cover, used wherever a track carries no artwork of its own. */
  artwork?: ArtworkRef;
}

export interface MediaSummary {
  id: string;
  kind: MediaKind;
  title: string;
  subtitle?: string;
  year?: number;
  synopsis?: string;
  artwork?: Artwork;
  parentId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  discNumber?: number;
  trackNumber?: number;
  mediaIds: string[];
  durationMs?: number;
  playbackContext?: PlaybackHierarchyContext;
  /** Album/artist ancestry for a track. Resolved by MediaApi, never by callers. */
  musicContext?: MusicHierarchyContext;
  /** Catalogue `updated_ns` — the server's only chronology signal for Home recency. */
  catalogueUpdatedNs?: number;
}

export interface Episode extends MediaSummary {
  kind: 'episode';
  seasonNumber: number;
  episodeNumber: number;
  playbackContext: PlaybackHierarchyContext;
}

export interface SeasonSummary extends MediaSummary {
  kind: 'season';
  showId: string;
  seasonNumber: number;
}

export interface SeasonDetails extends SeasonSummary {
  episodes: Episode[];
}

export interface ShowDetails extends MediaSummary {
  kind: 'show';
  seasons: SeasonSummary[];
}

export interface ArtistDetails extends MediaSummary {
  kind: 'artist';
  albums: MediaSummary[];
}

export interface AlbumDetails extends MediaSummary {
  kind: 'album';
  tracks: MediaSummary[];
}

export type MediaDetails =
  | ShowDetails
  | SeasonDetails
  | ArtistDetails
  | AlbumDetails
  | Episode
  | MediaSummary;

export interface LibraryHome {
  movies: MediaSummary[];
  shows: MediaSummary[];
  albums: MediaSummary[];
}

export interface PlaybackProgress {
  mediaId: string;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
  media?: MediaSummary;
}

export type PlaybackMode = 'direct' | 'remux' | 'transcode';

// PlaybackCapabilities now comes from @macha/core, so every client describes
// its decoder to the same chooser rather than to its own local shape.
export type { PlaybackCapabilities } from '@macha/core';

export interface PlaybackSource {
  mediaId: string;
  url: string;
  subtitleUrl?: string;
  mimeType?: string;
  mode: PlaybackMode;
  durationMs?: number;
  sizeBytes?: number;
}
