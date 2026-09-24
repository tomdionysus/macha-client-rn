import { describe, expect, it } from 'vitest';
import type { MediaSummary } from '../types';
import {
  albumLabel,
  CATEGORY_LABELS,
  episodeCode,
  episodeLabel,
  playlistName,
  sortChoiceLabel,
  trackNumberLabel,
} from './labels';

/**
 * Every word a viewer reads is this client's — Tom's ruling, 2026-09-24, given
 * to core directly: core composes no viewer text and hands over structured
 * data only. Core cut its label helpers and `MediaSummary.subtitle` the same
 * day, so these are the client's own, worded as the other clients word them.
 */

const episode = (over: Partial<MediaSummary> = {}) =>
  ({ id: 'e', title: 'Truths', kind: 'episode', episodeNumber: 5, ...over }) as MediaSummary;

describe('episodeLabel', () => {
  it('names the season and episode, from the context the item carries', () => {
    const item = episode({ playbackContext: { series: { id: 's', title: 'Dark' }, season: { id: 'se', title: 'Season 1', seasonNumber: 1 } } });
    expect(episodeLabel(item)).toBe('Season 1 Episode 5');
  });

  it('falls back to the item’s own season number, then to the episode alone', () => {
    expect(episodeLabel(episode({ seasonNumber: 2 }))).toBe('Season 2 Episode 5');
    expect(episodeLabel(episode())).toBe('Episode 5');
  });

  it('says nothing for an episode with no number, or for anything else', () => {
    expect(episodeLabel(episode({ episodeNumber: undefined }))).toBeUndefined();
    expect(episodeLabel({ id: 'm', title: 'Dark City', kind: 'movie' } as MediaSummary)).toBeUndefined();
  });
});

describe('episodeCode', () => {
  it('is the compact form a season page lists, zero-padded', () => {
    expect(episodeCode(episode({ seasonNumber: 1 }))).toBe('S01E05');
    expect(episodeCode(episode({ seasonNumber: 1, episodeNumber: 12 }))).toBe('S01E12');
    expect(episodeCode(episode())).toBe('E05');
  });
});

describe('albumLabel', () => {
  it('adds the year in brackets when there is one, and no brackets when not', () => {
    expect(albumLabel({ title: 'Homogenic', year: 1997 })).toBe('Homogenic (1997)');
    expect(albumLabel({ title: 'Homogenic' })).toBe('Homogenic');
  });
});

describe('trackNumberLabel', () => {
  it('names the disc only when there is more than one', () => {
    expect(trackNumberLabel({ trackNumber: 9 })).toBe('Track 9');
    expect(trackNumberLabel({ trackNumber: 9, discNumber: 1 })).toBe('Track 9');
    expect(trackNumberLabel({ trackNumber: 1, discNumber: 4 })).toBe('Disc 4 · Track 1');
    expect(trackNumberLabel({})).toBeUndefined();
  });
});

describe('sort and category wording', () => {
  it('reads each sort choice as a whole, with no heading above it', () => {
    expect(sortChoiceLabel('relevance')).toBe('Sort By Relevance');
    expect(sortChoiceLabel('title')).toBe('Sort By Title');
    expect(sortChoiceLabel('year')).toBe('Sort By Year');
    expect(sortChoiceLabel('recent')).toBe('Sort By Recently added');
  });

  it('names the search categories as every client does', () => {
    expect(CATEGORY_LABELS).toEqual({ movies: 'Movies', shows: 'TV Shows', music: 'Music' });
  });

  // Core stores an unnamed playlist as '' — the list it adopts from the old
  // store, and any name that trims to nothing. A row reading blank looked like
  // a rendering fault.
  it('gives an unnamed playlist a placeholder', () => {
    expect(playlistName({ name: '' })).toBe('Untitled playlist');
    expect(playlistName({ name: 'Road trip' })).toBe('Road trip');
  });
});
