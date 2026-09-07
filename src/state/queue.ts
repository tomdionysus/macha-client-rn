import type { MediaSummary } from '../types';
import { readValidatedJson, writeJson, clientStore } from './storage';

export interface PlaybackQueueState {
  items: MediaSummary[];
  currentIndex: number;
  positionMs: number;
  updatedAt: number;
}

export function isPlayable(item: MediaSummary): boolean {
  return item.kind === 'movie' || item.kind === 'episode' || item.kind === 'track';
}

function validState(value: unknown): value is PlaybackQueueState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlaybackQueueState>;
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) return false;
  if (!candidate.items.every((item) => item && typeof item === 'object' && typeof item.id === 'string' && isPlayable(item as MediaSummary))) {
    return false;
  }
  return (
    Number.isInteger(candidate.currentIndex) &&
    Number(candidate.currentIndex) >= 0 &&
    Number(candidate.currentIndex) < candidate.items.length &&
    typeof candidate.positionMs === 'number' &&
    Number.isFinite(candidate.positionMs) &&
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt)
  );
}

/**
 * The client-local play queue. An album queues its ordered tracks, a season its
 * ordered episodes, and playback advances automatically to the next item.
 *
 * Persisting the queue does not imply owning live playback: a cold start loads
 * a resumable queue only, and does not create a server session until the viewer
 * actually presses play.
 */
export class PlaybackQueueStore {
  private readonly key: string;

  constructor(clientId: string) {
    this.key = `macha.playbackQueue.v1.${clientId}`;
  }

  load(): PlaybackQueueState | undefined {
    return readValidatedJson(this.key, validState);
  }

  replace(items: readonly MediaSummary[], currentIndex = 0): PlaybackQueueState | undefined {
    const playable = items.filter(isPlayable);
    if (playable.length === 0) return undefined;
    const boundedIndex = Math.max(0, Math.min(playable.length - 1, currentIndex));
    return writeJson<PlaybackQueueState>(this.key, {
      items: playable,
      currentIndex: boundedIndex,
      positionMs: 0,
      updatedAt: Date.now(),
    });
  }

  select(currentIndex: number): PlaybackQueueState | undefined {
    const current = this.load();
    if (!current || currentIndex < 0 || currentIndex >= current.items.length) return current;
    return writeJson<PlaybackQueueState>(this.key, { ...current, currentIndex, positionMs: 0, updatedAt: Date.now() });
  }

  updatePosition(positionMs: number): PlaybackQueueState | undefined {
    const current = this.load();
    if (!current) return undefined;
    return writeJson<PlaybackQueueState>(this.key, {
      ...current,
      positionMs: Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0,
      updatedAt: Date.now(),
    });
  }

  insertNext(items: readonly MediaSummary[]): PlaybackQueueState | undefined {
    const additions = items.filter(isPlayable);
    if (additions.length === 0) return this.load();
    const current = this.load();
    if (!current) return this.replace(additions, 0);
    const insertAt = current.currentIndex + 1;
    return writeJson<PlaybackQueueState>(this.key, {
      ...current,
      items: [...current.items.slice(0, insertAt), ...additions, ...current.items.slice(insertAt)],
      updatedAt: Date.now(),
    });
  }

  /**
   * Replaces the queue contents and current index while preserving the stored
   * resume position. `replace` deliberately resets it because it starts a new
   * listening session; reordering or removing an entry around the playing
   * track must not throw that position away.
   */
  setItems(items: readonly MediaSummary[], currentIndex: number): PlaybackQueueState | undefined {
    const playable = items.filter(isPlayable);
    if (playable.length === 0) {
      this.clear();
      return undefined;
    }
    const current = this.load();
    return writeJson<PlaybackQueueState>(this.key, {
      items: playable,
      currentIndex: Math.max(0, Math.min(playable.length - 1, currentIndex)),
      positionMs: current?.positionMs ?? 0,
      updatedAt: Date.now(),
    });
  }

  clear(): void {
    clientStore.removeItem(this.key);
  }
}
