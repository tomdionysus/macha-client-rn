import type { MediaSummary } from '../types';
import { readValidatedJson, writeJson } from './storage';

/** A play is only counted once the listener has clearly committed to the track. */
export const PLAY_COUNT_THRESHOLD_MS = 20_000;
const RECENTLY_PLAYED_LIMIT = 50;

interface PlayRecord {
  count: number;
  lastPlayedAt: number;
}

interface LibraryFile {
  version: 1;
  favourites: string[];
  plays: Record<string, PlayRecord>;
  /** Most recent first, catalogue ids, deduplicated. */
  recent: string[];
}

const EMPTY: LibraryFile = { version: 1, favourites: [], plays: {}, recent: [] };

function validFile(value: unknown): value is LibraryFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LibraryFile>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.favourites) &&
    candidate.favourites.every((id) => typeof id === 'string') &&
    typeof candidate.plays === 'object' &&
    candidate.plays !== null &&
    Array.isArray(candidate.recent)
  );
}

/** What a screen may do with the listening state. Mirrors the store's own reads. */
export interface MusicLibraryView {
  favourites(): string[];
  isFavourite(itemId: string): boolean;
  toggleFavourite(itemId: string): boolean;
  playCount(itemId: string): number;
  recentIds(): string[];
  mostPlayedIds(limit?: number): string[];
}

/**
 * Per-device listening state: favourites, play counts and recently played.
 *
 * Macha models none of this and deliberately holds no per-viewer state, so it
 * lives here alongside Continue Watching. It is never uploaded. Everything is
 * keyed by catalogue id, so it survives the catalogue being unreachable.
 */
export class MusicLibraryStore {
  private readonly key: string;
  private readonly listeners = new Set<() => void>();
  private cached: MusicLibraryView | undefined;

  constructor(clientId: string) {
    this.key = `macha.musicLibrary.v1.${clientId}`;
  }

  /**
   * A handle onto this store whose identity changes whenever the state does.
   *
   * The store itself cannot be that handle: it is a singleton, so anything
   * derived from it during render is compiled to a memo keyed on a value that
   * never changes, and favourites and the recently-played order stay at
   * whatever they were the first time the screen drew. A counter cannot be it
   * either, because the caller reads through these methods rather than through
   * the counter. So the handle is what callers already use, rebuilt on change.
   */
  getSnapshot = (): MusicLibraryView => {
    this.cached ??= {
      favourites: () => this.favourites(),
      isFavourite: (itemId) => this.isFavourite(itemId),
      toggleFavourite: (itemId) => this.toggleFavourite(itemId),
      playCount: (itemId) => this.playCount(itemId),
      recentIds: () => this.recentIds(),
      mostPlayedIds: (limit) => this.mostPlayedIds(limit),
    };
    return this.cached;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private read(): LibraryFile {
    return readValidatedJson(this.key, validFile) ?? EMPTY;
  }

  private write(file: LibraryFile): LibraryFile {
    const written = writeJson(this.key, file);
    this.cached = undefined;
    for (const listener of this.listeners) listener();
    return written;
  }

  favourites(): string[] {
    return this.read().favourites;
  }

  isFavourite(itemId: string): boolean {
    return this.read().favourites.includes(itemId);
  }

  toggleFavourite(itemId: string): boolean {
    const file = this.read();
    const has = file.favourites.includes(itemId);
    this.write({
      ...file,
      favourites: has ? file.favourites.filter((id) => id !== itemId) : [itemId, ...file.favourites],
    });
    return !has;
  }

  playCount(itemId: string): number {
    return this.read().plays[itemId]?.count ?? 0;
  }

  /** Records one completed-enough play. Callers apply `PLAY_COUNT_THRESHOLD_MS` themselves. */
  recordPlay(itemId: string): void {
    const file = this.read();
    const previous = file.plays[itemId];
    this.write({
      ...file,
      plays: { ...file.plays, [itemId]: { count: (previous?.count ?? 0) + 1, lastPlayedAt: Date.now() } },
      recent: [itemId, ...file.recent.filter((id) => id !== itemId)].slice(0, RECENTLY_PLAYED_LIMIT),
    });
  }

  recentIds(): string[] {
    return this.read().recent;
  }

  /** Catalogue ids ordered by play count, most played first. Ties keep insertion order. */
  mostPlayedIds(limit = 50): string[] {
    const plays = this.read().plays;
    return Object.entries(plays)
      .filter(([, record]) => record.count > 0)
      .sort((a, b) => b[1].count - a[1].count || b[1].lastPlayedAt - a[1].lastPlayedAt)
      .slice(0, limit)
      .map(([id]) => id);
  }

  clearAll(): void {
    this.write(EMPTY);
  }
}

/** Orders a set of items by a list of ids, dropping anything the catalogue no longer has. */
export function orderByIds(items: readonly MediaSummary[], ids: readonly string[]): MediaSummary[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
