import { describe, expect, it } from 'vitest';
import { resumePreferences, type MediaSummary, type PlaybackSession } from '@machafoundation/core';
import { belongsInContinueWatching, progressOf } from './resume';

/**
 * Tom, 2026-09-27: Continue Watching stores "both the item id AND the media
 * ID", and the mode, resolution, subtitle settings "and all other data
 * needed to resume as if you'd never left". This client drives the resolver
 * directly, so it builds what core's coordinator would; these check that
 * core's `resumePreferences` reads it back as the viewer left it.
 */
const film = { id: 'tmdb:movie:1', kind: 'movie', title: '2010', mediaIds: ['macha:a', 'macha:b'] } as unknown as MediaSummary;

function session(mode: 'direct' | 'remux' | 'transcode', extra: { maxHeight?: number | null; audio?: number; subtitle?: number; container?: string } = {}): PlaybackSession {
  return {
    sessionId: 's',
    mode,
    mediaId: 'macha:b',
    preferences: { mode, maxHeight: extra.maxHeight ?? null, maxBitrate: null, audioStream: null, subtitleStream: null, audioLanguage: '', subtitleLanguage: '' },
    selected: { videoStream: 0, audioStream: extra.audio ?? 1, subtitleStream: extra.subtitle ?? -1 },
    output: { container: extra.container },
  } as unknown as PlaybackSession;
}

describe('progressOf', () => {
  it('names the title and the file separately', () => {
    const entry = progressOf(film, 60_000, 6_000_000, session('direct'), { chosenByViewer: false });
    expect(entry.itemId).toBe('tmdb:movie:1');
    expect(entry.fileMediaId).toBe('macha:b');
  });

  it('resumes a viewer’s choices as they left them', () => {
    const entry = progressOf(film, 60_000, 6_000_000, session('remux', { audio: 2, subtitle: 4, container: 'fmp4' }), { chosenByViewer: true });
    expect(resumePreferences(entry)).toEqual({ mediaId: 'macha:b', mode: 'remux', container: 'fmp4', audioStream: 2, subtitleStream: 4 });
  });

  /**
   * On the A85 (2026-09-27) Remux on *2010* is carried as transcode with the
   * video copied, because the device cannot decode its AC-3. The entry saved
   * the session's `transcode`, and the resume re-encoded the picture.
   */
  it('resumes the mode the viewer picked, not the one the node was asked for', () => {
    const entry = progressOf(film, 60_000, 6_000_000, session('transcode', { audio: 2 }), { chosenByViewer: true, mode: 'remux' });
    expect(resumePreferences(entry).mode).toBe('remux');
  });

  it('keeps the file and the streams, but lets automatic play choose how again', () => {
    const entry = progressOf(film, 60_000, 6_000_000, session('transcode', { maxHeight: 720, audio: 2 }), { chosenByViewer: false, quality: 720 });
    const preferences = resumePreferences(entry);
    expect(preferences.mediaId).toBe('macha:b');
    expect(preferences.mode).toBeUndefined();
    expect(preferences.audioStream).toBe(2);
  });

  it('is the position alone off the disk, where there is no session', () => {
    const entry = progressOf(film, 60_000, 6_000_000, undefined, { chosenByViewer: false });
    expect(entry.fileMediaId).toBeUndefined();
    expect(resumePreferences(entry)).toEqual({});
  });
});

/**
 * Tom, 2026-09-28: Continue Watching is films and episodes only. A music
 * track appeared there on the A85 beside the films.
 */
describe('belongsInContinueWatching', () => {
  it('keeps films and episodes', () => {
    expect(belongsInContinueWatching({ kind: 'movie' })).toBe(true);
    expect(belongsInContinueWatching({ kind: 'episode' })).toBe(true);
  });

  it('keeps music out', () => {
    expect(belongsInContinueWatching({ kind: 'track' })).toBe(false);
  });

  it('keeps out an entry saved without its media', () => {
    expect(belongsInContinueWatching(undefined)).toBe(false);
  });
});
