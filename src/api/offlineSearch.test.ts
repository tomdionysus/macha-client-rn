import { describe, expect, it } from 'vitest';
import type { MediaSummary } from '../types';
import { searchOffline } from './offlineLibrary';

/**
 * Search over what is downloaded, held to the same rules as the live search.
 *
 * Tom's rulings, relayed by core and confirmed here 2026-09-24: "the", "a" and
 * "an" never trigger a search and are never matched on, at least two
 * characters must be left, and the Movies / TV Shows / Music toggles narrow
 * the results — none on means nothing. Core applies all of it inside
 * `MachaMediaApi.search`; the offline library is this client's own code and
 * applied none of it, so the same query answered differently in airplane mode.
 */

const item = (title: string, kind: MediaSummary['kind'], extra: Partial<MediaSummary> = {}) =>
  ({ id: `${kind}:${title}`, title, kind, ...extra }) as MediaSummary;

const library: MediaSummary[] = [
  item('The Matrix', 'movie'),
  item('Dark', 'show'),
  item('Secrets', 'episode', { playbackContext: { series: { id: 's', title: 'Dark' }, season: { id: 'se', title: 'Season 1', seasonNumber: 1 } } }),
  item('Homogenic', 'album'),
  item('Jóga', 'track', { musicContext: { album: { id: 'a', title: 'Homogenic' }, artist: { id: 'b', title: 'Björk' } } }),
];

const titles = (items: readonly MediaSummary[]) => items.map((entry) => entry.title);

describe('searchOffline', () => {
  it('does not match on the words titles are not ordered by', () => {
    // "the" alone would match "The Matrix" by substring; it must match nothing.
    expect(searchOffline(library, 'the')).toEqual([]);
    expect(searchOffline(library, 'a')).toEqual([]);
  });

  it('drops the ignored words and searches on what is left', () => {
    expect(titles(searchOffline(library, 'the matrix'))).toEqual(['The Matrix']);
  });

  it('needs two characters left over', () => {
    expect(searchOffline(library, 'x')).toEqual([]);
  });

  it('still finds a track by its album or artist, and an episode by its series', () => {
    expect(titles(searchOffline(library, 'homogenic'))).toEqual(['Homogenic', 'Jóga']);
    expect(titles(searchOffline(library, 'dark'))).toEqual(['Dark', 'Secrets']);
  });

  it('narrows to the categories switched on', () => {
    expect(titles(searchOffline(library, 'dark', ['movies']))).toEqual([]);
    expect(titles(searchOffline(library, 'homogenic', ['music']))).toEqual(['Homogenic', 'Jóga']);
    expect(titles(searchOffline(library, 'dark', ['shows']))).toEqual(['Dark', 'Secrets']);
  });

  it('returns nothing with every category off', () => {
    expect(searchOffline(library, 'dark', [])).toEqual([]);
  });
});
