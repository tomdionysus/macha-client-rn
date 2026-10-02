// The model layer is core's.
export type {
  AlbumDetails,
  ArtistDetails,
  Artwork,
  ArtworkRef,
  Episode,
  LibraryHome,
  MediaDetails as CoreMediaDetails,
  MediaKind,
  MediaSummary,
  MovieDetails,
  MusicHierarchyContext,
  PlaybackCapabilities,
  PlaybackHierarchyContext,
  PlaybackMode,
  PlaybackProgress,
  PlaybackSource,
  SeasonDetails,
  SeasonSummary,
  ShowDetails,
} from '@machafoundation/core';

import type { CoreMediaDetails, Episode } from './types';

/**
 * Core's union plus `Episode`. Structurally redundant, since `Episode extends
 * MediaSummary`, but it gives narrowing on `kind` an episode arm.
 */
export type MediaDetails = CoreMediaDetails | Episode;
