import * as FileSystem from 'expo-file-system/legacy';
import { downloadFailureMessage } from '../api/failureMessages';
import type { ClusterPlaybackApi, PlaybackSession } from '../api/playback';
import type { MediaApi } from '../api/media';
import type { EndpointRegistry, PlaybackInstruction } from '@machafoundation/core';
import { deviceCapabilities, devicePlaybackOverrides } from '../playback/capabilities';
import { fileToPlay } from '../playback/policy';
import { NOT_AVAILABLE_HERE, downloadTarget, playableHere } from './choice';
import { type TransferObservation, throughputSample } from './throughputSample';
import type { DownloadRecord, DownloadStore } from '../state/downloads';
import type { MediaSummary } from '../types';

const MEDIA_DIR = `${FileSystem.documentDirectory}macha/media/`;
const ARTWORK_DIR = `${FileSystem.documentDirectory}macha/artwork/`;

/**
 * One at a time: each download holds a playback session against the node's
 * `max_sessions`, and fanning out would starve real viewers.
 */
const CONCURRENCY = 1;

/** Progress callbacks fire constantly on a fast link; these throttle re-renders and storage writes. */
const NOTIFY_INTERVAL_MS = 400;
const PERSIST_INTERVAL_MS = 2_000;

export interface LiveProgress {
  bytesWritten: number;
  bytesTotal?: number;
}

export interface DownloadProgressSnapshot {
  records: DownloadRecord[];
  active: string | undefined;
  live: Map<string, LiveProgress>;
}

/**
 * Downloads original media for offline playback.
 *
 * Macha has no download endpoint, only session-scoped stream URLs, so each
 * download is a short-lived `direct` session streamed to disk and stopped
 * afterwards. The transfer runs in a native background session, so it
 * survives the app being backgrounded.
 */
export class DownloadManager {
  private readonly listeners = new Set<() => void>();
  private running = false;
  private active: string | undefined;
  private cancelled = new Set<string>();
  /** The transfer in flight, so a cancel can stop it immediately rather than at completion. */
  private transfer: { mediaId: string; task: FileSystem.DownloadResumable } | undefined;
  /** In-flight byte counts, held in memory rather than written to storage. */
  private readonly live = new Map<string, LiveProgress>();
  private lastNotifyAt = 0;
  private lastPersistAt = 0;

  constructor(
    private readonly store: DownloadStore,
    private readonly playbackApi: ClusterPlaybackApi,
    private readonly mediaApi: MediaApi,
    /**
     * Receives measured throughput so endpoint ranking can use it. Downloads are
     * the only bulk transfer JS can time; playback and artwork are native.
     */
    private readonly registry?: EndpointRegistry,
  ) {}

  /** Rebuilt on the next read after a mutation, and not before. */
  private cached: DownloadProgressSnapshot | undefined;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.cached = undefined;
    for (const listener of this.listeners) listener();
  }

  /**
   * The whole state as one object whose identity changes only on a change.
   * `useSyncExternalStore` needs that stability, and returning the state itself
   * (not a revision counter) gives the React Compiler an input to recompute on.
   */
  getSnapshot = (): DownloadProgressSnapshot => {
    this.cached ??= { records: this.store.all(), active: this.active, live: new Map(this.live) };
    return this.cached;
  };

  /** Live bytes for an in-flight transfer, if there is one. */
  progressFor(mediaId: string): LiveProgress | undefined {
    return this.live.get(mediaId);
  }

  /** Coalesces notifications so a fast transfer cannot flood React with renders. */
  private notifyThrottled(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastNotifyAt < NOTIFY_INTERVAL_MS) return;
    this.lastNotifyAt = now;
    this.notify();
  }

  /**
   * Queues items not already stored or in flight, then starts the pump.
   * Returns how many were added, so the caller can say whether anything happened.
   */
  enqueue(items: readonly MediaSummary[], options: { mediaId?: string } = {}): number {
    let queued = 0;
    for (const media of items) {
      const target = downloadTarget(media, options.mediaId);
      if (!target) continue;
      // A title is downloaded once, whichever of its files it was.
      const busy = media.mediaIds.some((mediaId) => {
        const existing = this.store.get(mediaId);
        return existing && (existing.state === 'complete' || existing.state === 'downloading' || existing.state === 'queued');
      });
      if (busy) continue;
      queued += 1;
      this.store.put({
        mediaId: target.mediaId,
        itemId: media.id,
        ...(target.fileChosen ? { fileChosen: true } : {}),
        state: 'queued',
        updatedAt: Date.now(),
        media,
      });
    }
    this.notify();
    void this.pump();
    return queued;
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
    this.stopTransfer(mediaId);
    const record = this.store.get(mediaId);
    if (record && record.state !== 'complete') this.store.remove(mediaId);
    this.notify();
  }

  private stopTransfer(mediaId: string): void {
    if (this.transfer?.mediaId !== mediaId) return;
    void this.transfer.task.cancelAsync().catch(() => undefined);
  }

  /** Removes the record and the bytes. The catalogue item is untouched. */
  async remove(mediaId: string): Promise<void> {
    const record = this.store.get(mediaId);
    this.cancelled.add(mediaId);
    this.stopTransfer(mediaId);
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
      // Strictly sequential; `CONCURRENCY` documents the intent.
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
    this.lastPersistAt = Date.now();
    this.notifyThrottled(true);

    let session: PlaybackSession | undefined;
    let fileUri: string | undefined;
    try {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);

      // Always the original bytes: a download is a copy, not a viewing decision.
      const instruction: PlaybackInstruction = {
        mode: 'direct',
        video: 'copy',
        audio: 'copy',
        reasons: [],
        assumed: [],
      };
      // The server requires a file on multi-file items: the viewer's choice,
      // else the one playback would pick.
      const files = await this.playbackApi.facts({ itemId: record.media.id }).catch(() => undefined);
      const capabilities = deviceCapabilities();
      const overrides = devicePlaybackOverrides();
      const fileId = record.fileChosen ? mediaId : fileToPlay(files, record.media.mediaIds, capabilities, overrides);
      // A copy plays as it is, so skip a file this device cannot play (e.g. one
      // queued via an album). Without facts, go ahead.
      const named = files?.find((file) => file.mediaId === (fileId ?? record.media.mediaIds[0]));
      if (named && !playableHere(named, capabilities, overrides)) {
        this.store.patch(mediaId, { state: 'failed', error: `${NOT_AVAILABLE_HERE}.` });
        return;
      }
      session = await this.playbackApi.create(record.media, instruction, 0, fileId ? { mediaId: fileId } : undefined);
      fileUri = `${MEDIA_DIR}${safeName(mediaId)}${extensionFor(session)}`;

      // From progress callbacks, so it times the body only, not session setup.
      let observed: TransferObservation | undefined;

      const resumable = FileSystem.createDownloadResumable(
        session.source.url,
        fileUri,
        // Callbacks pause while backgrounded, so the record, not memory, is the truth.
        { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const bytesTotal =
            totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : session?.source.sizeBytes;
          this.live.set(mediaId, { bytesWritten: totalBytesWritten, bytesTotal });
          const now = Date.now();
          observed = observed
            ? {
                ...observed,
                longestGapMs: Math.max(observed.longestGapMs, now - observed.lastAt),
                lastAt: now,
                lastBytes: totalBytesWritten,
              }
            : { firstAt: now, firstBytes: totalBytesWritten, lastAt: now, lastBytes: totalBytesWritten, longestGapMs: 0 };
          if (now - this.lastPersistAt >= PERSIST_INTERVAL_MS) {
            this.lastPersistAt = now;
            this.store.patch(mediaId, { bytesWritten: totalBytesWritten, bytesTotal });
          }
          this.notifyThrottled();
        },
      );

      this.transfer = { mediaId, task: resumable };
      // Cancelled while the session was being created: start nothing.
      const result = this.cancelled.has(mediaId) ? undefined : await resumable.downloadAsync();
      if (this.cancelled.has(mediaId)) {
        this.cancelled.delete(mediaId);
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
        return;
      }
      if (!result?.uri) throw new Error('The download produced no file.');

      this.recordThroughput(session, observed);

      this.live.delete(mediaId);
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
        if (fileUri) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
        return;
      }
      this.store.patch(mediaId, { state: 'failed', error: downloadFailureMessage(error) });
    } finally {
      if (this.transfer?.mediaId === mediaId) this.transfer = undefined;
      // Always release the session slot.
      if (session) await this.playbackApi.stop(session).catch(() => undefined);
      this.live.delete(mediaId);
      this.active = undefined;
      this.notifyThrottled(true);
    }
  }

  /**
   * Reports measured throughput to the registry, which attributes it by URL and
   * drops a URL it cannot match. Samples mostly come from the already-preferred
   * node, so they confirm a ranking more often than overturn one.
   */
  private recordThroughput(session: PlaybackSession, observed: TransferObservation | undefined): void {
    if (!this.registry || !observed) return;
    const sample = throughputSample(observed);
    if (!sample) return;
    this.registry.recordTransferByUrl(session.source.url, sample.bytes, sample.durationMs);
  }

  /** Stores the cover next to the media; failure here does not fail the download. */
  private async storeArtwork(media: MediaSummary, mediaId: string): Promise<string | undefined> {
    const ref =
      media.artwork?.poster ?? media.artwork?.thumbnail ?? media.musicContext?.artwork ?? media.artwork?.backdrop;
    if (!ref) return undefined;
    try {
      await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true }).catch(() => undefined);
      const target = `${ARTWORK_DIR}${safeName(mediaId)}.img`;
      // No Authorization header here, so only a signed URL will do.
      const source = this.mediaApi.artworkUrls(ref).find((candidate) => !candidate.requiresAuthorization);
      if (!source) return undefined;
      const result = await FileSystem.downloadAsync(source.url, target);
      return result.status === 200 ? result.uri : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Media ids like `macha:<sha256>` are not legal filenames everywhere. */
function safeName(mediaId: string): string {
  return mediaId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** The original's extension where the server reveals one, else the format, else `.bin`. */
function extensionFor(session: PlaybackSession): string {
  const path = session.sourceInfo.path ?? '';
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(path);
  if (match) return `.${match[1].toLowerCase()}`;
  const format = (session.sourceInfo.format ?? '').split(',')[0]?.trim().toLowerCase();
  return format ? `.${format}` : '.bin';
}
