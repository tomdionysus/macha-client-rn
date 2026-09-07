import { useSyncExternalStore } from 'react';
import { useMacha } from '../providers/MachaProvider';
import type { DownloadRecord } from '../state/downloads';

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
 * `useSyncExternalStore` is the correct way to read a mutable store from
 * React, and it is the only one that survives the React Compiler. Subscribing
 * and bumping a discarded counter is not: the counter is never read, so the
 * render has no reactive input the compiler can see, and it cached the result
 * — which is why a queued download never appeared, a finished one never turned
 * green, and "Clear" emptied the store without emptying the screen.
 *
 * The revision is the snapshot because it is a primitive. The records
 * themselves are rebuilt on every call and would look permanently changed.
 */
export function useDownloads(): DownloadsSnapshot {
  const { downloads, downloadManager } = useMacha();
  useSyncExternalStore(downloadManager.subscribe, downloadManager.getRevision, downloadManager.getRevision);

  const snapshot = downloadManager.snapshot();
  // Merge in-flight byte counts over the persisted record, so progress reads
  // live without the manager having to write every tick to storage.
  const records = downloads.all().map((record) => {
    const live = snapshot.live.get(record.mediaId);
    return live ? { ...record, bytesWritten: live.bytesWritten, bytesTotal: live.bytesTotal ?? record.bytesTotal } : record;
  });
  return {
    records,
    complete: records.filter((record) => record.state === 'complete'),
    pending: records.filter((record) => record.state === 'queued' || record.state === 'downloading'),
    failed: records.filter((record) => record.state === 'failed'),
    active: snapshot.active,
    byMediaId: new Map(records.map((record) => [record.mediaId, record])),
    storedBytes: downloads.storedBytes(),
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
