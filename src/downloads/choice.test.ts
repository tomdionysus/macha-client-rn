import { describe, expect, it } from 'vitest';
import type { MediaSummary, MediaTechnicalProfile } from '@machafoundation/core';
import { downloadChoices, downloadTarget } from './choice';

/**
 * Tom, 2026-09-28: Download opens a chooser on a title with more than one
 * file, and a download is always a copy of the file named, never a
 * transcode.
 */
const aac = { index: 1, type: 'audio' as const, codec: 'aac', profile: 'LC', language: 'eng', default: true, forced: false };

function profile(mediaId: string, width: number, height: number, bitrate: number): MediaTechnicalProfile {
  const video = { index: 0, type: 'video' as const, codec: 'hevc', profile: 'Main', language: 'eng', default: true, forced: false, width, height };
  return { mediaId, format: 'matroska', durationMs: 2 * 3600_000, bitrate, streams: [video, aac] };
}

const film = { id: 'tmdb:movie:1', kind: 'movie', title: '2010', mediaIds: ['macha:hd', 'macha:uhd'] } as unknown as MediaSummary;

describe('downloadChoices', () => {
  it('offers each file by its quality, largest first, with its line and a size', () => {
    const choices = downloadChoices([profile('macha:hd', 1920, 1080, 8_000_000), profile('macha:uhd', 3840, 2160, 40_000_000)]);
    expect(choices.map((choice) => [choice.mediaId, choice.label])).toEqual([
      ['macha:uhd', '4K'],
      ['macha:hd', '1080p'],
    ]);
    // 8 Mbps for two hours is 7.2 GB, or 6.7 GiB.
    expect(choices[1]?.detail).toContain('about 6.7 GB');
    expect(choices[1]?.detail).toContain('HEVC');
  });

  it('offers files that read the same once', () => {
    const choices = downloadChoices([profile('macha:a', 1920, 1080, 8_000_000), profile('macha:b', 1920, 1080, 8_000_000)]);
    expect(choices).toHaveLength(1);
  });
});

describe('downloadTarget', () => {
  it('keys the record by the file the viewer named', () => {
    expect(downloadTarget(film, 'macha:uhd')).toEqual({ mediaId: 'macha:uhd', fileChosen: true });
  });

  it('ignores a named file that is not this title', () => {
    expect(downloadTarget(film, 'macha:other')).toEqual({ mediaId: 'macha:hd', fileChosen: false });
  });

  it('leaves the file to playback when none is named', () => {
    expect(downloadTarget(film)).toEqual({ mediaId: 'macha:hd', fileChosen: false });
  });

  it('has nothing to download without a file', () => {
    expect(downloadTarget({ ...film, mediaIds: [] })).toBeUndefined();
  });
});
