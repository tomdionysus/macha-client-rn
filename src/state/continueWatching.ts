import type { MediaSummary, PlaybackProgress } from '../types';
import { clientStore } from './storage';

const PREFIX = 'macha.progress.v1:';

/**
 * Continue Watching is deliberately not a server API. It is local client
 * state: no account, no identity, no progress upload. The rules match the web
 * client exactly so the two behave the same on the same library.
 */
export const CONTINUE_WATCHING_LIMIT = 3;
const FINISHED_THRESHOLD = 0.92;
const MINIMUM_PROGRESS_MS = 30_000;

export function isFinished(progress: PlaybackProgress): boolean {
  if (progress.durationMs <= 0) return false;
  return progress.positionMs / progress.durationMs >= FINISHED_THRESHOLD;
}

export class ContinueWatchingStore {
  private readonly key: string;

  constructor(clientId: string) {
    this.key = `${PREFIX}${clientId}`;
  }

  list(): PlaybackProgress[] {
    return this.read()
      .filter((entry) => !isFinished(entry))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CONTINUE_WATCHING_LIMIT);
  }

  /** The remembered position for one item, or 0 when there is nothing to resume. */
  positionFor(mediaId: string): number {
    const entry = this.read().find((candidate) => candidate.mediaId === mediaId);
    return entry && !isFinished(entry) ? entry.positionMs : 0;
  }

  update(progress: PlaybackProgress): PlaybackProgress[] {
    const entries = this.read().filter((entry) => entry.mediaId !== progress.mediaId);
    if (!isFinished(progress) && progress.positionMs >= MINIMUM_PROGRESS_MS) entries.unshift(progress);
    const limited = entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CONTINUE_WATCHING_LIMIT);
    this.write(limited);
    return limited;
  }

  clear(mediaId: string): PlaybackProgress[] {
    this.write(this.read().filter((entry) => entry.mediaId !== mediaId));
    return this.list();
  }

  clearAll(): void {
    this.write([]);
  }

  private read(): PlaybackProgress[] {
    try {
      const value = clientStore.getItem(this.key);
      if (!value) return [];
      const parsed = JSON.parse(value) as PlaybackProgress[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(entries: PlaybackProgress[]): void {
    clientStore.setItem(this.key, JSON.stringify(entries));
  }
}

export function progressFor(media: MediaSummary, positionMs: number, durationMs: number): PlaybackProgress {
  return { mediaId: media.id, positionMs, durationMs, updatedAt: Date.now(), media };
}
