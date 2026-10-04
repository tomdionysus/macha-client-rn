import { describe, expect, it } from 'vitest';
import type { MediaSummary, MediaTechnicalProfile, PlaybackCapabilities, PlaybackMediaFacts } from '@machafoundation/core';
import { NOT_AVAILABLE_HERE, downloadChoices, downloadTarget, playableHere } from './choice';

const phone: PlaybackCapabilities = {
  platform: 'android',
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac'],
  containers: ['mp4', 'matroska', 'mkv'],
  hlsFmp4: true,
  dash: false,
  hdr: [],
  videoBitDepth: 8,
  maxWidth: 1920,
  maxHeight: 1080,
};

const everything = {
  direct: true,
  copyIntoFmp4: { video: true, audio: true },
  copyIntoMpegts: { video: true, audio: true },
  transcodeVideo: true,
  transcodeAudio: true,
};

function file(
  mediaId: string,
  width: number,
  height: number,
  bitrate: number,
  audio = 'aac',
  sizeBytes?: number,
): PlaybackMediaFacts {
  const video = { index: 0, type: 'video' as const, codec: 'h264', profile: 'High', language: 'eng', default: true, forced: false, width, height, bitDepth: 8 };
  const sound = { index: 1, type: 'audio' as const, codec: audio, profile: '', language: 'eng', default: true, forced: false, channels: 6 };
  const profile: MediaTechnicalProfile = { mediaId, format: 'matroska', container: 'matroska', durationMs: 2 * 3600_000, bitrate, streams: [video, sound] };
  return { mediaId, profile, operations: everything, ...(sizeBytes ? { sizeBytes } : {}) };
}

const film = { id: 'tmdb:movie:1', kind: 'movie', title: '2010', mediaIds: ['macha:hd', 'macha:uhd'] } as unknown as MediaSummary;

describe('playableHere', () => {
  it('is true for a file this device plays as it is', () => {
    expect(playableHere(file('macha:hd', 1920, 1080, 8_000_000), phone)).toBe(true);
  });

  it('is false for audio this device cannot decode', () => {
    // AC-3 with no decoder for it: copied, it would play silent.
    expect(playableHere(file('macha:hd', 1920, 1080, 8_000_000, 'ac3'), phone)).toBe(false);
  });

  it('is false for a picture larger than this device plays', () => {
    expect(playableHere(file('macha:uhd', 3840, 2160, 40_000_000), phone)).toBe(false);
  });
});

describe('downloadChoices', () => {
  it('offers each file by its quality, largest first, and marks what this device cannot play', () => {
    const choices = downloadChoices([file('macha:hd', 1920, 1080, 8_000_000), file('macha:uhd', 3840, 2160, 40_000_000)], phone);
    expect(choices.map((choice) => [choice.mediaId, choice.label, choice.available])).toEqual([
      ['macha:uhd', '4K', false],
      ['macha:hd', '1080p', true],
    ]);
    expect(choices[0]?.detail).toContain(NOT_AVAILABLE_HERE);
    expect(choices[1]?.detail).not.toContain(NOT_AVAILABLE_HERE);
  });

  it('gives the size the node reports, and estimates only without one', () => {
    const [reported] = downloadChoices([file('macha:hd', 1920, 1080, 8_000_000, 'aac', 3 * 1024 ** 3)], phone);
    expect(reported?.detail).toContain('3.0 GB');
    expect(reported?.detail).not.toContain('about');
    // 8 Mbps for two hours is 7.2 GB, or 6.7 GiB.
    const [estimated] = downloadChoices([file('macha:hd', 1920, 1080, 8_000_000)], phone);
    expect(estimated?.detail).toContain('about 6.7 GB');
  });

  it('offers files that read the same once', () => {
    const choices = downloadChoices([file('macha:a', 1920, 1080, 8_000_000), file('macha:b', 1920, 1080, 8_000_000)], phone);
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
