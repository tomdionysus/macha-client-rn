import { describe, expect, it } from 'vitest';
import type { MediaTechnicalProfile, PlaybackCapabilities, PlaybackMediaFacts } from '@machafoundation/core';
import { chooseFile, fileToPlay } from './policy';

const phone: PlaybackCapabilities = {
  platform: 'android',
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac'],
  containers: ['mp4'],
  hlsFmp4: true,
  dash: false,
  hdr: [],
  videoBitDepth: 8,
};

const h264 = { index: 0, type: 'video' as const, codec: 'h264', profile: 'High', language: 'eng', default: true, forced: false };
const aac = { index: 1, type: 'audio' as const, codec: 'aac', profile: 'LC', language: 'eng', default: true, forced: false };
const everything = {
  direct: true,
  copyIntoFmp4: { video: true, audio: true },
  copyIntoMpegts: { video: true, audio: true },
  transcodeVideo: true,
  transcodeAudio: true,
};

function file(mediaId: string, format: string, durationMs: number): PlaybackMediaFacts {
  const profile: MediaTechnicalProfile = { mediaId, format, durationMs, bitrate: 1_000, streams: [h264, aac] };
  return { mediaId, profile, operations: everything };
}

/**
 * The client chooses among an item's files and names the one it will play
 * (Tom, 2026-09-24; the shared laws text). This client used to judge the
 * first file and name none, so on a multi-file item the server played its
 * own first choice, whatever the chooser had decided about a different file.
 */
describe('chooseFile', () => {
  it('plays the file that plays best, and names it', () => {
    const choice = chooseFile([file('mkv', 'matroska,webm', 1_000), file('mp4', 'mov,mp4,m4a,3gp,3g2,mj2', 2_000)], ['mkv', 'mp4'], phone);
    expect(choice?.mediaId).toBe('mp4');
    expect(choice?.instruction.mode).toBe('direct');
    // The runtime of the file chosen, not of the first one.
    expect(choice?.durationMs).toBe(2_000);
  });

  it('keeps stored order between files that play equally well', () => {
    const choice = chooseFile([file('a', 'matroska,webm', 1_000), file('b', 'matroska,webm', 1_000)], ['a', 'b'], phone);
    expect(choice?.mediaId).toBe('a');
  });

  it('has nothing to choose from an empty list', () => {
    expect(chooseFile([], [], phone)).toBeUndefined();
  });
});

/**
 * Which file, when something other than the chooser decided the mode: the
 * viewer named one, or a download wants the original. Something still has to
 * pick the file (Tom, 2026-09-25), and the server is to refuse a create on a
 * multi-file item that names none.
 */
describe('fileToPlay', () => {
  it('names the file the chooser would play, on an item with several', () => {
    const files = [file('mkv', 'matroska,webm', 1_000), file('mp4', 'mov,mp4,m4a,3gp,3g2,mj2', 2_000)];
    expect(fileToPlay(files, ['mkv', 'mp4'], phone)).toBe('mp4');
  });

  it('names an only file without needing facts', () => {
    expect(fileToPlay(undefined, ['only'], phone)).toBe('only');
  });

  it('names nothing when it has several files and no facts to choose by', () => {
    expect(fileToPlay(undefined, ['a', 'b'], phone)).toBeUndefined();
  });
});
