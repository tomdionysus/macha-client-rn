import type { MediaSummary } from '../types';
import { readValidatedJson, writeJson } from './storage';

export type DownloadState = 'queued' | 'downloading' | 'complete' | 'failed';

export interface DownloadRecord {
  /** Primary key: the content-addressed file id (`macha:<sha256>`), immutable unlike a catalogue id. */
  mediaId: string;
  /** Catalogue id, for linking back into the library when it is reachable. */
  itemId: string;
  /** The viewer chose this file; otherwise the download takes the file playback would pick. */
  fileChosen?: boolean;
  state: DownloadState;
  /** `file://` URI of the stored original, once complete. */
  localUri?: string;
  /** Locally stored cover, so a download renders with no node reachable. */
  artworkUri?: string;
  bytesTotal?: number;
  bytesWritten?: number;
  error?: string;
  updatedAt: number;
  /** Snapshot of the item, so the download can be browsed offline. */
  media: MediaSummary;
}

interface DownloadFile {
  version: 1;
  records: Record<string, DownloadRecord>;
}

const EMPTY: DownloadFile = { version: 1, records: {} };

function validFile(value: unknown): value is DownloadFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DownloadFile>;
  if (candidate.version !== 1 || !candidate.records || typeof candidate.records !== 'object') return false;
  return Object.values(candidate.records).every(
    (record) =>
      record &&
      typeof record === 'object' &&
      typeof (record as DownloadRecord).mediaId === 'string' &&
      typeof (record as DownloadRecord).state === 'string' &&
      typeof (record as DownloadRecord).media === 'object',
  );
}

/** The device's download registry. Purely local; Macha is never told what is stored here. */
export class DownloadStore {
  private readonly key: string;

  constructor(clientId: string) {
    this.key = `macha.downloads.v1.${clientId}`;
  }

  private read(): DownloadFile {
    return readValidatedJson(this.key, validFile) ?? EMPTY;
  }

  all(): DownloadRecord[] {
    return Object.values(this.read().records).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Only the entries that are actually playable offline. */
  complete(): DownloadRecord[] {
    return this.all().filter((record) => record.state === 'complete' && record.localUri);
  }

  pending(): DownloadRecord[] {
    return this.all()
      .filter((record) => record.state === 'queued' || record.state === 'downloading')
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }

  get(mediaId: string): DownloadRecord | undefined {
    return this.read().records[mediaId];
  }

  /** The stored copy for a catalogue item, if one is finished. */
  localFor(item: Pick<MediaSummary, 'id' | 'mediaIds'>): DownloadRecord | undefined {
    const records = this.read().records;
    for (const mediaId of item.mediaIds) {
      const record = records[mediaId];
      if (record?.state === 'complete' && record.localUri) return record;
    }
    const byItem = Object.values(records).find(
      (record) => record.itemId === item.id && record.state === 'complete' && record.localUri,
    );
    return byItem;
  }

  put(record: DownloadRecord): DownloadRecord {
    const file = this.read();
    const next = { ...record, updatedAt: Date.now() };
    writeJson<DownloadFile>(this.key, { ...file, records: { ...file.records, [record.mediaId]: next } });
    return next;
  }

  patch(mediaId: string, change: Partial<DownloadRecord>): DownloadRecord | undefined {
    const existing = this.get(mediaId);
    if (!existing) return undefined;
    return this.put({ ...existing, ...change });
  }

  remove(mediaId: string): void {
    const file = this.read();
    if (!(mediaId in file.records)) return;
    const records = { ...file.records };
    delete records[mediaId];
    writeJson<DownloadFile>(this.key, { ...file, records });
  }

  clearAll(): void {
    writeJson<DownloadFile>(this.key, EMPTY);
  }

  /** Total bytes actually on disk, for the storage line in Settings. */
  storedBytes(): number {
    return this.complete().reduce((total, record) => total + (record.bytesTotal ?? 0), 0);
  }
}

/**
 * The offline view of a downloaded item, with the stored cover in the slot a
 * signed artwork URL normally fills, so components need no offline path.
 */
export function offlineMedia(record: DownloadRecord): MediaSummary {
  if (!record.artworkUri) return record.media;
  const local = { id: `local:${record.mediaId}`, mimeType: 'image/*', url: record.artworkUri };
  return {
    ...record.media,
    artwork: {
      poster: local,
      thumbnail: local,
      backdrop: record.media.artwork?.backdrop,
    },
    musicContext: record.media.musicContext
      ? { ...record.media.musicContext, artwork: local }
      : undefined,
  };
}
