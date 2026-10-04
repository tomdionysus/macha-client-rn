import { useSyncExternalStore } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { DownloadRecord } from '../state/downloads';
import type { MediaSummary } from '../types';

export interface DownloadsSnapshot {
  records: DownloadRecord[];
  complete: DownloadRecord[];
  pending: DownloadRecord[];
  failed: DownloadRecord[];
  active: string | undefined;
  byMediaId: Map<string, DownloadRecord>;
  storedBytes: number;
}

/**
 * Live view of the download registry. Derive everything from the snapshot,
 * never from the store directly: the React Compiler caches reads keyed on the
 * store singleton forever.
 */
export function useDownloads(): DownloadsSnapshot {
  const { downloadManager } = useMacha();
  const snapshot = useSyncExternalStore(
    downloadManager.subscribe,
    downloadManager.getSnapshot,
    downloadManager.getSnapshot,
  );

  // In-flight byte counts are kept in memory, not persisted on every tick.
  const records = snapshot.records.map((record) => {
    const live = snapshot.live.get(record.mediaId);
    return live ? { ...record, bytesWritten: live.bytesWritten, bytesTotal: live.bytesTotal ?? record.bytesTotal } : record;
  });
  const complete = records.filter((record) => record.state === 'complete');
  return {
    records,
    complete,
    pending: records.filter((record) => record.state === 'queued' || record.state === 'downloading'),
    failed: records.filter((record) => record.state === 'failed'),
    active: snapshot.active,
    byMediaId: new Map(records.map((record) => [record.mediaId, record])),
    // Only bytes that are really on disk count towards the storage line.
    storedBytes: complete.reduce((total, record) => total + (record.localUri ? (record.bytesTotal ?? 0) : 0), 0),
  };
}

/** The download state of one catalogue item, by its primary media identity. */
export function downloadStateOf(
  snapshot: DownloadsSnapshot,
  mediaIds: readonly string[],
): DownloadRecord | undefined {
  for (const mediaId of mediaIds) {
    const record = snapshot.byMediaId.get(mediaId);
    if (record) return record;
  }
  return undefined;
}

/** The stored, playable copy of an item; the reactive counterpart of `DownloadStore.localFor`. */
export function localCopyOf(
  snapshot: DownloadsSnapshot,
  item: Pick<MediaSummary, 'id' | 'mediaIds'>,
): DownloadRecord | undefined {
  for (const mediaId of item.mediaIds) {
    const record = snapshot.byMediaId.get(mediaId);
    if (record?.state === 'complete' && record.localUri) return record;
  }
  return snapshot.complete.find((record) => record.itemId === item.id && record.localUri);
}
