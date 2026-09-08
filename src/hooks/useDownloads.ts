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
 * Live view of the download registry.
 *
 * The manager owns the state and pushes change notifications; this only
 * re-reads. Progress arrives while the app is in the foreground, and the
 * record itself is authoritative for anything that happened while it was not.
 *
 * Everything below is derived from the snapshot `useSyncExternalStore` hands
 * back, and nothing is read off the store directly. That is deliberate: a
 * direct read is keyed on the store singleton, whose identity never changes, so
 * the React Compiler caches it against a dependency that can never invalidate.
 * Subscribing is not enough — the subscribed value has to be the one the
 * records are built from, or the screen keeps showing what it drew first.
 */
export function useDownloads(): DownloadsSnapshot {
  const { downloadManager } = useMacha();
  const snapshot = useSyncExternalStore(
    downloadManager.subscribe,
    downloadManager.getSnapshot,
    downloadManager.getSnapshot,
  );

  // Merge in-flight byte counts over the persisted record, so progress reads
  // live without the manager having to write every tick to storage.
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

/**
 * The stored, playable copy of a catalogue item.
 *
 * `DownloadStore.localFor` answers the same question, but off the store, which
 * makes it invisible to React. This reads the live snapshot instead, so a
 * screen that shows or hides something based on what is downloaded actually
 * changes when a download finishes or is removed.
 */
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
