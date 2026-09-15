import { useSyncExternalStore } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { Playlist } from '@machafoundation/core';
import type { MusicLibraryView } from '../state/musicLibrary';

/**
 * Playlists, subscribed properly.
 *
 * The subscribed value has to be the array itself, not a revision counter
 * beside it. Subscribing and then calling `list()` anyway leaves the call
 * keyed on the store singleton, which the React Compiler will happily cache
 * against forever — the list then never changes after its first render.
 */
export function usePlaylists(): Playlist[] {
  const { playlists } = useMacha();
  return useSyncExternalStore(playlists.subscribe, playlists.getSnapshot, playlists.getSnapshot);
}

/**
 * Per-device listening state: favourites, play counts, recently played.
 *
 * Callers read several different projections of it, so what comes back is a
 * handle with the same reads on it rather than one prepared snapshot — but a
 * *new* handle each time the state changes, so those projections are keyed on
 * something that can actually invalidate.
 */
export function useMusicLibrary(): MusicLibraryView {
  const { musicLibrary } = useMacha();
  return useSyncExternalStore(musicLibrary.subscribe, musicLibrary.getSnapshot, musicLibrary.getSnapshot);
}
