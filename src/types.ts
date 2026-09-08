// The model layer is core's.
//
// This file was a copy of it that had drifted by exactly one field, comments
// included — which is the subset trap in its clearest form: the two never
// disagreed, but only one of them could see a wire change arriving.
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
} from '@macha/core';

import type { CoreMediaDetails, Episode } from './types';

/**
 * Core's union plus `Episode`.
 *
 * Structurally redundant — `Episode extends MediaSummary`, which core's union
 * already admits — but it matters for narrowing: this client discriminates on
 * `kind` and wants the episode arm to exist. Raised with the package session
 * as something core's union should probably carry itself.
 */
export type MediaDetails = CoreMediaDetails | Episode;
