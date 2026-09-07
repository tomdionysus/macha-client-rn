import * as Crypto from 'expo-crypto';
import type { MediaSummary } from '../types';
import { readValidatedJson, writeJson } from './storage';
import { isPlayable } from './queue';

export interface Playlist {
  id: string;
  name: string;
  /**
   * Full item snapshots rather than catalogue ids.
   *
   * A playlist has to render and play with no node reachable — that is the
   * whole point once downloads exist — so it carries what it needs to draw a
   * row and start playback. It costs a little duplication against the
   * catalogue and buys working offline playlists.
   */
  items: MediaSummary[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistFile {
  version: 1;
  playlists: Playlist[];
}

function validPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Playlist>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.items) &&
    candidate.items.every((item) => item && typeof item === 'object' && typeof (item as MediaSummary).id === 'string') &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

function validFile(value: unknown): value is PlaylistFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlaylistFile>;
  return candidate.version === 1 && Array.isArray(candidate.playlists) && candidate.playlists.every(validPlaylist);
}

/**
 * User-curated playlists, held on this device only.
 *
 * Macha has no playlist API and deliberately stores no per-viewer state, so
 * playlists sit alongside Continue Watching and the play queue as client-owned
 * data. They are never sent to a node.
 */
export class PlaylistStore {
  private readonly key: string;
  private readonly listeners = new Set<() => void>();
  /**
   * Bumped on every mutation.
   *
   * React needs a *value* that changes to know this store has changed. A
   * "re-read on a counter" pattern does not survive the React Compiler, which
   * correctly observes that a counter never referenced inside a memo cannot
   * affect its result and drops it — leaving the list frozen at whatever it
   * was first computed from.
   */
  private revision = 0;

  constructor(clientId: string) {
    this.key = `macha.playlists.v1.${clientId}`;
  }

  getRevision = (): number => this.revision;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private changed(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  list(): Playlist[] {
    const file = readValidatedJson(this.key, validFile);
    return (file?.playlists ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Playlist | undefined {
    return this.list().find((playlist) => playlist.id === id);
  }

  create(name: string, items: readonly MediaSummary[] = []): Playlist {
    const now = Date.now();
    const playlist: Playlist = {
      id: Crypto.randomUUID(),
      name: name.trim() || 'Untitled playlist',
      items: items.filter(isPlayable),
      createdAt: now,
      updatedAt: now,
    };
    this.write([playlist, ...this.list()]);
    return playlist;
  }

  rename(id: string, name: string): Playlist | undefined {
    return this.mutate(id, (playlist) => ({ ...playlist, name: name.trim() || playlist.name }));
  }

  delete(id: string): void {
    this.write(this.list().filter((playlist) => playlist.id !== id));
  }

  /** Appends, skipping anything already present so a double-tap cannot duplicate a track. */
  add(id: string, items: readonly MediaSummary[]): Playlist | undefined {
    return this.mutate(id, (playlist) => {
      const existing = new Set(playlist.items.map((item) => item.id));
      const additions = items.filter((item) => isPlayable(item) && !existing.has(item.id));
      return additions.length === 0 ? playlist : { ...playlist, items: [...playlist.items, ...additions] };
    });
  }

  removeAt(id: string, index: number): Playlist | undefined {
    return this.mutate(id, (playlist) => ({
      ...playlist,
      items: playlist.items.filter((_, position) => position !== index),
    }));
  }

  /** Moves one entry, for drag-to-reorder. Out-of-range indices are a no-op rather than an error. */
  move(id: string, from: number, to: number): Playlist | undefined {
    return this.mutate(id, (playlist) => {
      if (from === to || from < 0 || to < 0 || from >= playlist.items.length || to >= playlist.items.length) {
        return playlist;
      }
      const items = [...playlist.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...playlist, items };
    });
  }

  /** Drops an item from every playlist — used when a track disappears from the catalogue. */
  purge(itemId: string): void {
    this.write(
      this.list().map((playlist) => {
        const items = playlist.items.filter((item) => item.id !== itemId);
        return items.length === playlist.items.length ? playlist : { ...playlist, items, updatedAt: Date.now() };
      }),
    );
  }

  private mutate(id: string, change: (playlist: Playlist) => Playlist): Playlist | undefined {
    const playlists = this.list();
    const index = playlists.findIndex((playlist) => playlist.id === id);
    if (index < 0) return undefined;
    const changed = change(playlists[index]);
    const next = changed === playlists[index] ? changed : { ...changed, updatedAt: Date.now() };
    playlists[index] = next;
    this.write(playlists);
    return next;
  }

  private write(playlists: Playlist[]): void {
    writeJson<PlaylistFile>(this.key, { version: 1, playlists });
    this.changed();
  }
}
