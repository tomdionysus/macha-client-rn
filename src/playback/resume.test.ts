import { describe, expect, it } from 'vitest';
import { resumePreferences, type MediaSummary, type PlaybackSession } from '@machafoundation/core';
import { belongsInContinueWatching, progressOf } from './resume';

/**
 * Continue Watching stores the item id and the media id, the mode, the
 * resolution, the subtitle settings and everything else needed to resume as
 * if the viewer never left. This client drives the resolver
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
   * Remux on a file whose AC-3 the device cannot decode is carried as
   * transcode with the video copied. Saving the session's `transcode` would
   * make the resume re-encode the picture.
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
