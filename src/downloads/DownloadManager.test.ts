import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSummary } from '@machafoundation/core';

/**
 * The file system is a collaborator here, not an environment fact: what is
 * under test is what the manager asks of it. A transfer resolves only when
 * it is cancelled, like a large film still arriving.
 */
const transfer = vi.hoisted(() => ({
  started: undefined as undefined | (() => void),
  cancelAsync: undefined as undefined | ReturnType<typeof vi.fn>,
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  FileSystemSessionType: { BACKGROUND: 0 },
  makeDirectoryAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  downloadAsync: vi.fn(async () => undefined),
  createDownloadResumable: vi.fn(() => {
    let finish: (value: undefined) => void = () => undefined;
    const done = new Promise<undefined>((resolve) => {
      finish = resolve;
    });
    transfer.cancelAsync = vi.fn(async () => finish(undefined));
    return {
      cancelAsync: transfer.cancelAsync,
      downloadAsync: () => {
        transfer.started?.();
        return done;
      },
    };
  }),
}));

import { DownloadManager } from './DownloadManager';
import { DownloadStore } from '../state/downloads';

const film = { id: 'tmdb:movie:1', kind: 'movie', title: '2010', mediaIds: ['macha:a'] } as unknown as MediaSummary;

function playbackApi() {
  return {
    facts: vi.fn(async () => undefined),
    create: vi.fn(async () => ({ sessionId: 's', source: { url: 'http://node/stream' }, sourceInfo: { path: 'film.mkv' } })),
    stop: vi.fn(async () => undefined),
  };
}

describe('DownloadManager.cancel', () => {
  beforeEach(() => {
    transfer.started = undefined;
    transfer.cancelAsync = undefined;
  });

  // Setting a flag the transfer reads only when it finishes is not enough: a
  // cancelled film would keep arriving.
  it('stops a transfer in flight and hands back its session', async () => {
    const api = playbackApi();
    const manager = new DownloadManager(new DownloadStore('test-cancel'), api as never, {} as never);
    const started = new Promise<void>((resolve) => {
      transfer.started = resolve;
    });
    manager.enqueue([film]);
    await started;

    manager.cancel('macha:a');

    expect(transfer.cancelAsync).toHaveBeenCalled();
    await vi.waitFor(() => expect(api.stop).toHaveBeenCalled());
  });
});

describe('DownloadManager, a file this device cannot play', () => {
  // A file that cannot be played locally cannot be downloaded. An album's
  // Download queues every track without asking, so
  // the manager refuses too, before any session or byte.
  it('fails it as not available here, with no session and no transfer', async () => {
    const api = playbackApi();
    const dts = { index: 1, type: 'audio' as const, codec: 'dts', profile: '', language: 'eng', default: true, forced: false };
    const h264 = { index: 0, type: 'video' as const, codec: 'h264', profile: 'High', language: 'eng', default: true, forced: false, width: 1280, height: 720 };
    api.facts.mockResolvedValue([
      {
        mediaId: 'macha:dts',
        profile: { mediaId: 'macha:dts', format: 'mp4', container: 'mp4', durationMs: 60_000, bitrate: 1_000_000, streams: [h264, dts] },
        operations: { direct: true },
      },
    ] as never);
    const store = new DownloadStore('test-unplayable');
    const manager = new DownloadManager(store, api as never, {} as never);
    manager.enqueue([{ ...film, id: 'tmdb:movie:2', mediaIds: ['macha:dts'] } as MediaSummary]);

    await vi.waitFor(() => expect(store.get('macha:dts')?.state).toBe('failed'));
    expect(store.get('macha:dts')?.error).toBe('Not available for this device.');
    expect(api.create).not.toHaveBeenCalled();
  });
});

