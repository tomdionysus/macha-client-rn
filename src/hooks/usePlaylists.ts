import { useSyncExternalStore } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { Playlist } from '../state/playlists';

/**
 * Playlists, subscribed properly.
 *
 * `useSyncExternalStore` is the correct way to read a mutable store from
 * React, and — unlike re-reading inside a `useMemo` keyed on a counter — it
 * survives the React Compiler, which is entitled to drop a dependency that
 * cannot affect the memo's result and did exactly that.
 */
export function usePlaylists(): Playlist[] {
  const { playlists } = useMacha();
  // The revision is the snapshot: it is a primitive that changes on every
  // mutation, so React sees a new value. `list()` itself returns a fresh array
  // each call, which would make the store look permanently changed.
  useSyncExternalStore(playlists.subscribe, playlists.getRevision, playlists.getRevision);
  return playlists.list();
}

/**
 * Subscribes to per-device listening state (favourites, play counts, recently
 * played) and returns the store to read from during render.
 *
 * Deliberately returns the store rather than a snapshot: the callers read
 * several different projections of it, and memoizing those reads is what broke
 * here in the first place.
 */
export function useMusicLibrary() {
  const { musicLibrary } = useMacha();
  useSyncExternalStore(musicLibrary.subscribe, musicLibrary.getRevision, musicLibrary.getRevision);
  return musicLibrary;
}
