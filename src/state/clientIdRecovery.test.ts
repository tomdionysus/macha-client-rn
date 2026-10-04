import { describe, expect, it } from 'vitest';
import { orphanedClientId } from './connection';

describe('orphanedClientId', () => {
  const old = 'a2618e45';
  const keys = [
    'macha.endpoints.v1',
    'macha.clientId.v1',
    `macha.continueWatching.v1.${old}`,
    `macha.downloads.v1.${old}`,
    `macha.playlists.v1.${old}`,
  ];

  it('adopts the only id that owns data when the current one owns none', () => {
    expect(orphanedClientId(keys, 'minted')).toBe(old);
  });

  it('adopts it when there is no current id at all', () => {
    expect(orphanedClientId(keys, null)).toBe(old);
  });

  it('keeps the current id when it owns data', () => {
    expect(orphanedClientId([...keys, 'macha.musicLibrary.v1.minted'], 'minted')).toBeUndefined();
  });

  it('adopts nothing when two other ids own data, since it cannot tell which', () => {
    expect(orphanedClientId([...keys, 'macha.downloads.v1.other'], 'minted')).toBeUndefined();
  });

  it('does not count stores written before hydration under "anonymous"', () => {
    expect(orphanedClientId(['macha.playbackQueue.v1.anonymous'], 'minted')).toBeUndefined();
  });

  it('reads the older Continue Watching keys too', () => {
    expect(orphanedClientId([`macha-client-progress:${old}`], 'minted')).toBe(old);
    expect(orphanedClientId([`macha.progress.v1:${old}`], 'minted')).toBe(old);
  });
});
