import { useEffect, useState } from 'react';
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
 */
export function useDownloads(): DownloadsSnapshot {
  const { downloads, downloadManager } = useMacha();
  const [, setTick] = useState(0);

  useEffect(() => downloadManager.subscribe(() => setTick((value) => value + 1)), [downloadManager]);

  const records = downloads.all();
  return {
    records,
    complete: records.filter((record) => record.state === 'complete'),
    pending: records.filter((record) => record.state === 'queued' || record.state === 'downloading'),
    failed: records.filter((record) => record.state === 'failed'),
    active: downloadManager.snapshot().active,
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
