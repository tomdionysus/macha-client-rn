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

  // On the A85, 2026-09-28: a cancelled film kept arriving at 2.4 MB/s,
  // because cancel only set a flag the transfer read when it finished.
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
