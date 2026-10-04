import { describe, expect, it } from 'vitest';
import type { PlaybackCapabilities, PlaybackSession, PlaybackStreamInfo } from '@machafoundation/core';
import { directUnavailableReason, remuxUnavailableReason } from './policy';

/**
 * Remux copies the video, so it needs a decoder for it; otherwise the copy is
 * refused (`NO_EXCEEDS_CAPABILITIES`) and the screen stays black. Modelled on
 * ten-bit HEVC Main 10 in Matroska on a device with `videoBitDepth` 8. The
 * judgement is core's `videoStreamObjection`, applied to the presented stream.
 */

const A85: PlaybackCapabilities = {
  containers: ['mp4', 'mkv', 'matroska'],
  videoCodecs: ['h264', 'hevc', 'vp9', 'av1'],
  hlsVideoCodecs: ['h264', 'hevc', 'vp9', 'av1'],
  audioCodecs: ['aac', 'opus', 'mp3', 'flac'],
  videoBitDepth: 8,
  hdr: [],
  dolbyVision: [],
} as unknown as PlaybackCapabilities;

const video = (over: Partial<PlaybackStreamInfo> = {}): PlaybackStreamInfo => ({
  index: 0,
  type: 'video',
  codec: 'hevc',
  profile: 'Main 10',
  language: 'und',
  default: true,
  forced: false,
  width: 1920,
  height: 960,
  bitDepth: 10,
  ...over,
});

const session = (streams: PlaybackStreamInfo[], selectedVideo = 0, format = 'matroska,webm', container = 'matroska') =>
  ({
    mediaId: 'macha:dark-s01e01',
    mode: 'transcode',
    mimeType: 'application/vnd.apple.mpegurl',
    durationMs: 3_092_334,
    output: {},
    sourceInfo: { format, container, bitrate: 5_021_861, size: 0, streams },
    selected: { videoStream: selectedVideo, audioStream: 1, subtitleStream: -1 },
  }) as unknown as PlaybackSession;

describe('remuxUnavailableReason', () => {
  it('refuses the A85 case, and says why in words a viewer can use', () => {
    const reason = remuxUnavailableReason(session([video()]), A85);
    expect(reason).toBe('Unavailable: this video is 10-bit and this device can only decode 8-bit. Transcode will play it.');
  });

  it('offers Remux when the device can decode the video', () => {
    expect(remuxUnavailableReason(session([video({ profile: 'Main', bitDepth: 8 })]), A85)).toBeUndefined();
  });

  it('refuses a codec the device cannot decode over HLS', () => {
    // Remux arrives over HLS, so the HLS list counts (core's `deliveryVideoCodecs`).
    const caps = { ...A85, hlsVideoCodecs: ['h264'] } as PlaybackCapabilities;
    expect(remuxUnavailableReason(session([video({ bitDepth: 8 })]), caps)).toBe(
      'Unavailable: this device cannot decode this video’s format. Transcode will play it.',
    );
  });

  it('refuses HDR the device cannot present', () => {
    const reason = remuxUnavailableReason(session([video({ bitDepth: 8, colorTransfer: 'smpte2084' })]), A85);
    expect(reason).toBe('Unavailable: this video is HDR and this device cannot display it. Transcode will play it.');
  });

  it('judges the video stream the session is presenting, not the first one', () => {
    const streams = [video({ index: 0, bitDepth: 8, profile: 'Main' }), video({ index: 2 })];
    expect(remuxUnavailableReason(session(streams, 2), A85)).toMatch(/10-bit/);
    expect(remuxUnavailableReason(session(streams, 0), A85)).toBeUndefined();
  });

  it('says nothing when the server did not report the bit depth', () => {
    // Core's rule: an unreported fact is not a reason to refuse.
    expect(remuxUnavailableReason(session([video({ bitDepth: undefined })]), A85)).toBeUndefined();
  });

  it('says nothing when there is no video at all', () => {
    expect(remuxUnavailableReason(session([]), A85)).toBeUndefined();
  });
});

/**
 * Direct play is greyed out on the same terms, judged against the direct-play
 * decoders (not the HLS list) and against the container, which Direct cannot replace.
 */
describe('directUnavailableReason', () => {
  it('refuses the A85 case, and points at the one mode that works', () => {
    // Ten-bit video rules out Remux too, so only Transcode works.
    expect(directUnavailableReason(session([video()]), A85)).toBe(
      'Unavailable: this video is 10-bit and this device can only decode 8-bit. Transcode will play it.',
    );
  });

  it('offers Direct when the device can decode the video and open the file', () => {
    expect(directUnavailableReason(session([video({ profile: 'Main', bitDepth: 8 })]), A85)).toBeUndefined();
  });

  it('judges the video against the direct-play decoders, not the HLS list', () => {
    // Decodable from a file but not over HLS is fine for Direct.
    const caps = { ...A85, hlsVideoCodecs: ['h264'] } as PlaybackCapabilities;
    expect(directUnavailableReason(session([video({ bitDepth: 8 })]), caps)).toBeUndefined();
  });

  it('refuses a container this device cannot open, and says Remux will play it', () => {
    // Remux rewraps the streams, so only the container is in the way.
    const avi = session([video({ codec: 'h264', profile: 'High', bitDepth: 8 })], 0, 'avi', 'avi');
    expect(directUnavailableReason(avi, A85)).toBe(
      'Unavailable: this device cannot open this file as it is. Remux will play it.',
    );
  });

  it('says nothing when there is no video and the container is fine', () => {
    expect(directUnavailableReason(session([]), A85)).toBeUndefined();
  });
});
