import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

const fs = vi.hoisted(() => ({
  files: {} as Record<string, string[]>,
  deleted: [] as string[],
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  FileSystemSessionType: { BACKGROUND: 0 },
  readDirectoryAsync: vi.fn(async (dir: string) => fs.files[dir] ?? []),
  deleteAsync: vi.fn(async (uri: string) => {
    fs.deleted.push(uri);
  }),
}));

import { DownloadManager } from './DownloadManager';
import { DownloadStore } from '../state/downloads';
import { clientStore } from '../state/storage';

const MEDIA = 'file:///docs/macha/media/';
const ARTWORK = 'file:///docs/macha/artwork/';

function record(mediaId: string, name: string) {
  return {
    mediaId,
    itemId: 'item',
    state: 'complete',
    localUri: `${MEDIA}${name}.mp4`,
    artworkUri: `${ARTWORK}${name}.img`,
    updatedAt: 1,
    media: { id: 'item', mediaIds: [mediaId] },
  };
}

function manager(): DownloadManager {
  const api = {} as never;
  return new DownloadManager(new DownloadStore('current'), api, api);
}

async function sweep(): Promise<void> {
  manager().resumeInterrupted();
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(async () => {
  await AsyncStorage.setItem('macha.downloads.v1.current', JSON.stringify({ version: 1, records: { 'macha:a': record('macha:a', 'a') } }));
  // A re-minted client id leaves the real records under the old one.
  await AsyncStorage.setItem('macha.downloads.v1.old', JSON.stringify({ version: 1, records: { 'macha:b': record('macha:b', 'b') } }));
  await clientStore.hydrate();
});

beforeEach(() => {
  fs.files = {
    [MEDIA]: ['a.mp4', 'b.mp4', 'partial.mkv'],
    [ARTWORK]: ['a.img', 'b.img', 'stale.img'],
  };
  fs.deleted = [];
});

describe('the startup sweep of downloaded files', () => {
  it('deletes only files no record names, under any client id', async () => {
    await sweep();
    expect(fs.deleted.sort()).toEqual([`${ARTWORK}stale.img`, `${MEDIA}partial.mkv`]);
  });

  it('deletes nothing when a record file cannot be read', async () => {
    clientStore.setItem('macha.downloads.v1.broken', 'not json');
    await sweep();
    clientStore.removeItem('macha.downloads.v1.broken');
    expect(fs.deleted).toEqual([]);
  });
});
