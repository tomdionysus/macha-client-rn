import { describe, expect, it } from 'vitest';
import type { CatalogueMediaProfile, CatalogueMediaStreamProfile } from '@machafoundation/core';
import { fileLines, mediaProfileSummary, wrapBetweenFields } from './mediaLines';

/**
 * The web client's rules, copied for the phone (Tom, 2026-09-27: "Copy the
 * web style"). These pin the same outputs the web pins, so the two read alike.
 */
function stream(partial: Partial<CatalogueMediaStreamProfile>): CatalogueMediaStreamProfile {
  return {
    index: 0, type: 'video', codec: '', profile: '', language: '', width: 0, height: 0, channels: 0,
    sample_rate: 0, bit_depth: 0, default: false, forced: false, bitrate: 0, attached_picture: false, ...partial,
  };
}

function profile(durationMs: number, bitrate: number, streams: CatalogueMediaStreamProfile[]): CatalogueMediaProfile {
  return { schema_version: 3, media_id: 'm', format: 'matroska,webm', duration_ms: durationMs, bitrate, streams };
}

// The Martian's two files as the A85 read them, 2026-09-27.
const martian4k = profile(9_060_000, 47_400_000, [
  stream({ index: 0, codec: 'hevc', width: 3840, height: 2160 }),
  stream({ index: 1, type: 'audio', codec: 'truehd', channels: 8, default: true }),
  stream({ index: 2, type: 'audio', codec: 'dts', channels: 8 }),
]);
const martian1080 = profile(9_060_000, 3_100_000, [
  stream({ index: 0, codec: 'hevc', width: 1920, height: 1080 }),
  stream({ index: 1, type: 'audio', codec: 'eac3', channels: 6, default: true }),
]);

describe('mediaProfileSummary', () => {
  it('reads a film as the web does', () => {
    expect(mediaProfileSummary(martian4k)).toBe('2h 31m · 3840×2160 · HEVC · TRUEHD · 47.4 Mbps');
    expect(mediaProfileSummary(martian1080)).toBe('2h 31m · 1920×1080 · HEVC · E-AC-3 · 3.1 Mbps');
  });

  it('names the default audio track, not the first', () => {
    const second = profile(2_220_000, 5_000_000, [
      stream({ codec: 'h264', width: 1280, height: 720 }),
      stream({ index: 1, type: 'audio', codec: 'ac3' }),
      stream({ index: 2, type: 'audio', codec: 'aac', default: true }),
    ]);
    expect(mediaProfileSummary(second)).toBe('37m · 1280×720 · H.264 · AAC · 5.0 Mbps');
  });

  it('reads a track as a track, and ignores its cover art', () => {
    const track = profile(225_000, 2_304_000, [
      stream({ codec: 'mjpeg', width: 600, height: 600, attached_picture: true }),
      stream({ index: 1, type: 'audio', codec: 'flac', bit_depth: 24, sample_rate: 96_000, channels: 2, default: true }),
    ]);
    expect(mediaProfileSummary(track)).toBe('3:45 · FLAC · 24-bit · 96 kHz · Stereo · 2,304 kbps');
    const cd = profile(3_723_000, 320_000, [stream({ type: 'audio', codec: 'mp3', sample_rate: 44_100, channels: 1 })]);
    expect(mediaProfileSummary(cd)).toBe('1:02:03 · MP3 · 44.1 kHz · Mono · 320 kbps');
  });
});

describe('fileLines', () => {
  it('gives each file its line, and one line to files that read the same', () => {
    expect(fileLines([martian4k, martian1080])).toHaveLength(2);
    expect(fileLines([martian1080, { ...martian1080, media_id: 'other' }])).toEqual(['2h 31m · 1920×1080 · HEVC · E-AC-3 · 3.1 Mbps']);
  });
});

describe('wrapBetweenFields', () => {
  /** The A85's music player broke "926 kbps" across two lines. */
  it('leaves a break only between fields', () => {
    const wrapped = wrapBetweenFields('6:43 · FLAC · 16-bit · 44.1 kHz · Stereo · 926 kbps');
    expect(wrapped).toBe('6:43 · FLAC · 16-bit · 44.1\u00A0kHz · Stereo · 926\u00A0kbps');
    expect(wrapped.split(' ').filter((part) => part !== '·')).toHaveLength(6);
  });
});
