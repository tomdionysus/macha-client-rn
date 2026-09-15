import * as FileSystem from 'expo-file-system/legacy';
import { describeError } from '../api/errors';
import type { ClusterPlaybackApi, PlaybackSession } from '../api/playback';
import type { MediaApi } from '../api/media';
import type { EndpointRegistry, PlaybackInstruction } from '@machafoundation/core';
import { type TransferObservation, throughputSample } from './throughputSample';
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

/**
 * Progress is reported far faster than it is worth reacting to. On a LAN the
 * node serves direct streams at tens of MB/s, so the callback fires constantly;
 * persisting and re-rendering on every one starves the very transfer being
 * measured. These bound that work without hiding real progress.
 */
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
  /** In-flight byte counts, held in memory rather than written to storage. */
  private readonly live = new Map<string, LiveProgress>();
  private lastNotifyAt = 0;
  private lastPersistAt = 0;

  constructor(
    private readonly store: DownloadStore,
    private readonly playbackApi: ClusterPlaybackApi,
    private readonly mediaApi: MediaApi,
    /**
     * Where finished transfers are reported, so ranking can use measured
     * throughput rather than latency alone.
     *
     * A download is the only transfer on this client that JS can time. Playback
     * and artwork are both owned by native modules that never expose the bytes,
     * and core's own recorder only sees its JSON reads — which are catalogue
     * listings, so a viewer who opens the app and resumes a download without
     * browsing produces no other evidence at all. Optional because nothing here
     * should fail to download for want of a measurement.
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
   * The whole state as one object whose identity changes only when something
   * actually changed.
   *
   * Caching is not an optimisation here, it is the contract twice over.
   * `useSyncExternalStore` requires a snapshot that is stable between
   * notifications — a fresh object per call is an endless render loop. And the
   * value has to be the state itself rather than a revision counter, because a
   * counter is only reactive if the reader keeps it: a hook that subscribes and
   * discards the result has no input the React Compiler can see, so it caches
   * the derived records against the store singletons and never recomputes them.
   * That is what left the download button, "Clear" and removing a single item
   * all showing whatever was true when the screen was first drawn.
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
   * Queues items that are not already stored or in flight, then starts the
   * pump. Returns how many were actually added, so a caller can tell the
   * viewer whether anything happened — asking for an album that is already
   * downloaded is a legitimate thing to do and deserves a different answer
   * than one that started twelve transfers.
   */
  enqueue(items: readonly MediaSummary[]): number {
    let queued = 0;
    for (const media of items) {
      const mediaId = media.mediaIds[0];
      if (!mediaId) continue;
      const existing = this.store.get(mediaId);
      if (existing && (existing.state === 'complete' || existing.state === 'downloading' || existing.state === 'queued')) {
        continue;
      }
      queued += 1;
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
    this.lastPersistAt = Date.now();
    this.notifyThrottled(true);

    let session: PlaybackSession | undefined;
    try {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);

      // A download always wants the original bytes, whatever this device can
      // decode: it is a copy of the file, not a viewing decision. Storing a
      // transcode would mean keeping something strictly worse than the source.
      const instruction: PlaybackInstruction = {
        mode: 'direct',
        video: 'copy',
        audio: 'copy',
        reasons: [],
        // Stated outright rather than chosen, so no optional input was
        // consulted and none was defaulted behind our back.
        assumed: [],
      };
      session = await this.playbackApi.create(record.media, instruction, 0);
      const fileUri = `${MEDIA_DIR}${safeName(mediaId)}${extensionFor(session)}`;

      // Built from the progress callbacks so the measurement covers the body
      // transfer only — the session POST and cluster walk above are not this
      // link's throughput. See `throughputSample.ts`.
      let observed: TransferObservation | undefined;

      const resumable = FileSystem.createDownloadResumable(
        session.source.url,
        fileUri,
        // A native background session keeps the transfer alive when the app is
        // backgrounded. Progress callbacks stop firing until it returns to the
        // foreground, which is why the record is the source of truth, not state.
        { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const bytesTotal =
            totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : session?.source.sizeBytes;
          // Memory only. Storage sees this at most every couple of seconds, and
          // the UI at most a few times a second.
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

      const result = await resumable.downloadAsync();
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
        return;
      }
      this.store.patch(mediaId, { state: 'failed', error: describeError(error) });
    } finally {
      // The lease goes back immediately whether or not the bytes arrived — a
      // download must never hold a session slot it is no longer using.
      if (session) await this.playbackApi.stop(session).catch(() => undefined);
      this.live.delete(mediaId);
      this.active = undefined;
      this.notifyThrottled(true);
    }
  }

  /**
   * Tell the registry what this download measured, when it measured anything.
   *
   * Attribution is by URL because that is the seam core `0.12.0` exposes:
   * `recordTransferByUrl` matches the URL against the registry's endpoints and
   * files the sample against whichever one served it. A sample filed against
   * the wrong node would be worse than none, since ranking would act on it, so
   * a URL core cannot match is silently dropped rather than guessed at.
   *
   * `session.endpoint?.id` is the more direct attribution and this used to use
   * it. It is not available through the public surface any more, and the URL
   * match is equivalent while media is served from the node's own base URL.
   *
   * Every sample here comes from whichever node the registry already preferred,
   * because that is the node the session resolver picked. Throughput therefore
   * accumulates on the incumbent and rarely on a challenger, so it will mostly
   * confirm a ranking rather than overturn one. That is a known limit of
   * sampling from downloads and is recorded in `TODO/ACTIVE.md`; it is not a
   * reason to record nothing.
   */
  private recordThroughput(session: PlaybackSession, observed: TransferObservation | undefined): void {
    if (!this.registry || !observed) return;
    const sample = throughputSample(observed);
    if (!sample) return;
    this.registry.recordTransferByUrl(session.source.url, sample.bytes, sample.durationMs);
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
      // This downloader sends no Authorization header, so only a
      // self-authenticating source can be stored. Artwork failing is not a
      // download failure, so an item with no signed URL simply keeps no cover.
      const source = this.mediaApi.artworkUrls(ref).find((candidate) => !candidate.requiresAuthorization);
      if (!source) return undefined;
      const result = await FileSystem.downloadAsync(source.url, target);
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
