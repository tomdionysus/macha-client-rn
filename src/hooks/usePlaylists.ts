import { useSyncExternalStore } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { Playlist } from '@machafoundation/core';
import type { MusicLibraryView } from '../state/musicLibrary';

/**
 * Playlists. The snapshot must be the array itself: calling `list()` beside a
 * revision counter keys on the store singleton, which the React Compiler caches
 * forever.
 */
export function usePlaylists(): Playlist[] {
  const { playlists } = useMacha();
  return useSyncExternalStore(playlists.subscribe, playlists.getSnapshot, playlists.getSnapshot);
}

/**
 * Per-device listening state (favourites, play counts, recently played), as a
 * read handle that is replaced on every change so memoised projections invalidate.
 */
export function useMusicLibrary(): MusicLibraryView {
  const { musicLibrary } = useMacha();
  return useSyncExternalStore(musicLibrary.subscribe, musicLibrary.getSnapshot, musicLibrary.getSnapshot);
}
