import * as FileSystem from 'expo-file-system/legacy';
import { describeError } from '../api/errors';
import type { ClusterPlaybackApi, PlaybackSession } from '../api/playback';
import type { MediaApi } from '../api/media';
import { deviceCapabilities } from '../playback/capabilities';
import type { DownloadRecord, DownloadStore } from '../state/downloads';
import type { MediaSummary } from '../types';

const MEDIA_DIR = `${FileSystem.documentDirectory}macha/media/`;
const ARTWORK_DIR = `${FileSystem.documentDirectory}macha/artwork/`;

/**
 * One at a time, deliberately.
 *
 * A node advertises `max_sessions` (8 on the tested cluster) and every download
 * holds a real playback session while it runs. Fanning out an album would eat
 * the whole budget and compete with someone actually watching something.
 */
const CONCURRENCY = 1;

export interface DownloadProgressSnapshot {
  records: DownloadRecord[];
  active: string | undefined;
}

/**
 * Downloads original media for offline playback.
 *
 * Macha has no durable download endpoint: the only route serving bytes is the
 * playback stream URL, which is scoped to a session and whose pipeline is
 * reclaimed after about a minute idle. So a download is a short-lived
 * `direct`-mode session, streamed straight to disk, and torn down immediately
 * afterwards. The transfer itself runs in a native background session, so
 * leaving the app does not kill an in-flight file.
 */
export class DownloadManager {
  private readonly listeners = new Set<() => void>();
  private running = false;
  private active: string | undefined;
  private cancelled = new Set<string>();

  constructor(
    private readonly store: DownloadStore,
    private readonly playbackApi: ClusterPlaybackApi,
    private readonly mediaApi: MediaApi,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  snapshot(): DownloadProgressSnapshot {
    return { records: this.store.all(), active: this.active };
  }

  /** Queues items that are not already stored or in flight, then starts the pump. */
  enqueue(items: readonly MediaSummary[]): void {
    for (const media of items) {
      const mediaId = media.mediaIds[0];
      if (!mediaId) continue;
      const existing = this.store.get(mediaId);
      if (existing && (existing.state === 'complete' || existing.state === 'downloading' || existing.state === 'queued')) {
        continue;
      }
      this.store.put({
        mediaId,
        itemId: media.id,
        state: 'queued',
        updatedAt: Date.now(),
        media,
      });
    }
    this.notify();
    void this.pump();
  }

  /** Called at startup: anything interrupted mid-flight goes back on the queue. */
  resumeInterrupted(): void {
    for (const record of this.store.all()) {
      if (record.state === 'downloading') this.store.patch(record.mediaId, { state: 'queued', error: undefined });
    }
    this.notify();
    void this.pump();
  }

  retry(mediaId: string): void {
    const record = this.store.get(mediaId);
    if (!record || record.state === 'complete') return;
    this.cancelled.delete(mediaId);
    this.store.patch(mediaId, { state: 'queued', error: undefined, bytesWritten: 0 });
    this.notify();
    void this.pump();
  }

  cancel(mediaId: string): void {
    this.cancelled.add(mediaId);
    const record = this.store.get(mediaId);
    if (record && record.state !== 'complete') this.store.remove(mediaId);
    this.notify();
  }

  /** Removes the record and the bytes. The catalogue item is untouched. */
  async remove(mediaId: string): Promise<void> {
    const record = this.store.get(mediaId);
    this.cancelled.add(mediaId);
    if (record?.localUri) await FileSystem.deleteAsync(record.localUri, { idempotent: true }).catch(() => undefined);
    if (record?.artworkUri) await FileSystem.deleteAsync(record.artworkUri, { idempotent: true }).catch(() => undefined);
    this.store.remove(mediaId);
    this.notify();
  }

  async removeAll(): Promise<void> {
    for (const record of this.store.all()) await this.remove(record.mediaId);
    this.store.clearAll();
    this.notify();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Strictly sequential: `CONCURRENCY` documents the intent, and the loop
      // enforces it without a worker pool to get wrong.
      void CONCURRENCY;
      for (;;) {
        const next = this.store.pending().find((record) => record.state === 'queued');
        if (!next) break;
        await this.download(next);
      }
    } finally {
      this.running = false;
      this.active = undefined;
      this.notify();
    }
  }

  private async download(record: DownloadRecord): Promise<void> {
    const { mediaId } = record;
    if (this.cancelled.has(mediaId)) {
      this.cancelled.delete(mediaId);
      return;
    }
    this.active = mediaId;
    this.store.patch(mediaId, { state: 'downloading', error: undefined });
    this.notify();

    let session: PlaybackSession | undefined;
    try {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);

      // `direct` is the server's explicit byte-stream override, so this stores
      // the original container untouched rather than a transcode.
      session = await this.playbackApi.create(record.media, deviceCapabilities(), 0, { mode: 'direct' });
      const fileUri = `${MEDIA_DIR}${safeName(mediaId)}${extensionFor(session)}`;

      const resumable = FileSystem.createDownloadResumable(
        session.source.url,
        fileUri,
        // A native background session keeps the transfer alive when the app is
        // backgrounded. Progress callbacks stop firing until it returns to the
        // foreground, which is why the record is the source of truth, not state.
        { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          this.store.patch(mediaId, {
            bytesWritten: totalBytesWritten,
            bytesTotal: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : session?.source.sizeBytes,
          });
          this.notify();
        },
      );

      const result = await resumable.downloadAsync();
      if (this.cancelled.has(mediaId)) {
        this.cancelled.delete(mediaId);
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
        return;
      }
      if (!result?.uri) throw new Error('The download produced no file.');

      const artworkUri = await this.storeArtwork(record.media, mediaId);
      const info = await FileSystem.getInfoAsync(result.uri);
      this.store.patch(mediaId, {
        state: 'complete',
        localUri: result.uri,
        artworkUri,
        bytesTotal: info.exists && !info.isDirectory ? info.size : session.source.sizeBytes,
        error: undefined,
      });
    } catch (error) {
      if (this.cancelled.has(mediaId)) {
        this.cancelled.delete(mediaId);
        return;
      }
      this.store.patch(mediaId, { state: 'failed', error: describeError(error) });
    } finally {
      // The lease goes back immediately whether or not the bytes arrived — a
      // download must never hold a session slot it is no longer using.
      if (session) await this.playbackApi.stop(session).catch(() => undefined);
      this.active = undefined;
      this.notify();
    }
  }

  /**
   * Stores the cover next to the media. Artwork failing is not a download
   * failure: a track with no picture is still perfectly playable offline.
   */
  private async storeArtwork(media: MediaSummary, mediaId: string): Promise<string | undefined> {
    const ref =
      media.artwork?.poster ?? media.artwork?.thumbnail ?? media.musicContext?.artwork ?? media.artwork?.backdrop;
    if (!ref) return undefined;
    try {
      await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true }).catch(() => undefined);
      const target = `${ARTWORK_DIR}${safeName(mediaId)}.img`;
      const url = this.mediaApi.artworkUrls(ref)[0];
      if (!url) return undefined;
      const result = await FileSystem.downloadAsync(url, target);
      return result.status === 200 ? result.uri : undefined;
    } catch {
      return undefined;
    }
  }
}

/** `macha:<sha256>` is not a legal filename on every platform; the identity is preserved, not the punctuation. */
function safeName(mediaId: string): string {
  return mediaId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * The stored file keeps the original's extension where the server reveals one.
 * Players sniff content anyway, but a correct extension makes the file
 * recognisable if it is ever inspected outside the app.
 */
function extensionFor(session: PlaybackSession): string {
  const path = session.sourceInfo.path ?? '';
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(path);
  if (match) return `.${match[1].toLowerCase()}`;
  const format = (session.sourceInfo.format ?? '').split(',')[0]?.trim().toLowerCase();
  return format ? `.${format}` : '.bin';
}
