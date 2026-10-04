import { describe, expect, it } from 'vitest';
import {
  decoderSizeLimit,
  DECODER_MIME_TYPES,
  decodableCodecs,
  probedDolbyVisionProfiles,
  probedHdrTransfers,
  probedVideoBitDepth,
  withProbedAdditions,
} from './codecProbe';

const DECLARED = ['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac'];

/** What the A85 reports: no ac3, no eac3. */
const A85 = [
  'audio/mp4a-latm',
  'audio/mpeg',
  'audio/flac',
  'audio/vorbis',
  'audio/opus',
  'audio/3gpp',
  'audio/amr-wb',
];

/** A device that does have the Dolby decoders. */
const WITH_DOLBY = [...A85, 'audio/ac3', 'audio/eac3'];

describe('decodableCodecs', () => {
  it('drops the two codecs the A85 has no decoder for', () => {
    expect(decodableCodecs(DECLARED, A85)).toEqual(['aac', 'opus', 'vorbis', 'mp3', 'flac']);
  });

  it('keeps them on a device that reports them', () => {
    // Such a device gets Direct Play rather than an unneeded transform.
    expect(decodableCodecs(DECLARED, WITH_DOLBY)).toEqual(DECLARED);
  });

  it('accepts eac3-joc as E-AC-3, because a device decoding it decodes E-AC-3', () => {
    expect(decodableCodecs(['eac3'], [...A85, 'audio/eac3-joc'])).toEqual(['eac3']);
  });

  it('is case-insensitive about what the platform hands back', () => {
    expect(decodableCodecs(['ac3'], ['AUDIO/AC3'])).toEqual(['ac3']);
  });

  it('narrows video the same way', () => {
    const declared = ['h264', 'hevc', 'vp9'];
    expect(decodableCodecs(declared, ['video/avc', 'video/hevc'])).toEqual(['h264', 'hevc']);
  });

  it('keeps a codec the table has no mapping for, rather than guessing', () => {
    // A gap in the table is not evidence about the device.
    expect(decodableCodecs(['aac', 'something-new'], A85)).toEqual(['aac', 'something-new']);
  });
});

describe('decodableCodecs when the device cannot be asked', () => {
  // iOS, web, a build without the native module, or a throw from the platform.

  it('leaves ordinary declarations alone', () => {
    expect(decodableCodecs(['aac', 'opus', 'mp3'], undefined)).toEqual(['aac', 'opus', 'mp3']);
    expect(decodableCodecs(['aac', 'opus', 'mp3'], [])).toEqual(['aac', 'opus', 'mp3']);
  });

  it('still refuses ac3 and eac3, which have to be earned', () => {
    // Asymmetric on purpose: over-claiming gives a silent film with no error;
    // under-claiming costs a visible transform.
    expect(decodableCodecs(DECLARED, undefined)).toEqual(['aac', 'opus', 'vorbis', 'mp3', 'flac']);
  });
});

/** The strings pinned against `MediaFormat.MIMETYPE_*`: a misspelling silently denies Direct Play to every device with the decoder. */
describe('DECODER_MIME_TYPES matches android.media.MediaFormat', () => {
  it.each([
    ['ac3', 'audio/ac3'],
    ['eac3', 'audio/eac3'],
    ['aac', 'audio/mp4a-latm'],
    ['mp3', 'audio/mpeg'],
    ['flac', 'audio/flac'],
    ['opus', 'audio/opus'],
    ['vorbis', 'audio/vorbis'],
    ['h264', 'video/avc'],
    ['hevc', 'video/hevc'],
    ['vp9', 'video/x-vnd.on2.vp9'],
    ['av1', 'video/av01'],
  ])('maps %s to the documented %s', (codec, mime) => {
    expect(DECODER_MIME_TYPES[codec]).toContain(mime);
  });

  it('accepts the Atmos spelling of E-AC-3 as well', () => {
    expect(DECODER_MIME_TYPES.eac3).toContain('audio/eac3-joc');
  });
});

/** The widening half: a reported decoder adds a codec no list declares. */
describe('withProbedAdditions', () => {
  const withAv1 = ['video/avc', 'video/hevc', 'video/x-vnd.on2.vp9', 'video/av01'];
  const withoutAv1 = ['video/avc', 'video/hevc'];

  it('adds AV1 when the device reports a decoder for it', () => {
    expect(withProbedAdditions(['h264', 'hevc', 'vp9'], withAv1)).toEqual(['h264', 'hevc', 'vp9', 'av1']);
  });

  it('adds nothing when the device has no such decoder', () => {
    expect(withProbedAdditions(['h264', 'hevc'], withoutAv1)).toEqual(['h264', 'hevc']);
  });

  it('adds nothing when the device could not be asked', () => {
    // An unanswerable probe leaves the declaration as written.
    expect(withProbedAdditions(['h264', 'hevc'], undefined)).toEqual(['h264', 'hevc']);
    expect(withProbedAdditions(['h264', 'hevc'], [])).toEqual(['h264', 'hevc']);
  });

  it('does not duplicate a codec that was already declared', () => {
    expect(withProbedAdditions(['h264', 'av1'], withAv1)).toEqual(['h264', 'av1']);
  });

  it('adds only what it is asked to consider', () => {
    // VP8 is deliberately not a candidate even where a decoder exists.
    expect(withProbedAdditions(['h264'], [...withAv1, 'video/x-vnd.on2.vp8'])).toEqual(['h264', 'av1']);
  });
});

/**
 * Bit depth from decoder profiles: one number for every codec, though a device
 * may be ten-bit for one and eight for others. Profile ids collide across
 * codecs, hence keying by MIME.
 */
describe('probedVideoBitDepth', () => {
  /** What the A85 actually reports. */
  const A85_PROFILES = {
    'video/avc': [1, 2, 8, 65536, 524288],
    'video/hevc': [1, 4],
    'video/av01': [1, 4096, 8192],
    'video/x-vnd.on2.vp9': [1],
  };

  it('answers eight on the A85, because HEVC there is Main only', () => {
    expect(probedVideoBitDepth(['h264', 'hevc', 'vp9', 'av1'], A85_PROFILES)).toBe(8);
  });

  it('takes the minimum, not the maximum, across claimed codecs', () => {
    // Core checks every stream against this one number; the maximum would send
    // ten-bit HEVC to an eight-bit decoder.
    expect(probedVideoBitDepth(['av1'], A85_PROFILES)).toBe(10);
    expect(probedVideoBitDepth(['hevc', 'av1'], A85_PROFILES)).toBe(8);
  });

  it('answers ten when every claimed codec manages ten', () => {
    const capable = { 'video/hevc': [2], 'video/av01': [2] };
    expect(probedVideoBitDepth(['hevc', 'av1'], capable)).toBe(10);
  });

  it('does not read one codec’s profile number as another’s', () => {
    // AVCProfileHigh10 is 16; an H.264 decoder advertising 2 (Main) is not ten-bit.
    expect(probedVideoBitDepth(['h264'], { 'video/avc': [2] })).toBe(8);
    expect(probedVideoBitDepth(['h264'], { 'video/avc': [16] })).toBe(10);
  });

  it('is undefined when the device could not be asked', () => {
    // The declaration then stands.
    expect(probedVideoBitDepth(['h264'], undefined)).toBeUndefined();
    expect(probedVideoBitDepth(['h264'], {})).toBeUndefined();
  });

  it('is undefined when nothing claimed was described', () => {
    expect(probedVideoBitDepth(['vp8'], A85_PROFILES)).toBeUndefined();
  });
});

/**
 * HDR is claimed only when both decoder and display support it.
 * `Display.HdrCapabilities`: 1 DV, 2 HDR10, 3 HLG, 4 HDR10+.
 */
describe('probedHdrTransfers', () => {
  const av1Hdr = { 'video/av01': [1, 4096, 8192] };
  const sdrOnly = { 'video/av01': [1] };

  it('claims PQ when the decoder reads HDR10 and the panel can show it', () => {
    expect(probedHdrTransfers(['av1'], av1Hdr, [2])).toEqual(['smpte2084']);
    expect(probedHdrTransfers(['av1'], av1Hdr, [4])).toEqual(['smpte2084']);
  });

  it('claims nothing when the panel is SDR, however capable the decoder', () => {
    expect(probedHdrTransfers(['av1'], av1Hdr, [])).toEqual([]);
  });

  it('claims nothing when the decoder cannot read HDR, however good the panel', () => {
    expect(probedHdrTransfers(['av1'], sdrOnly, [2])).toEqual([]);
  });

  it('treats a panel that did not answer as unknown, not as consent', () => {
    expect(probedHdrTransfers(['av1'], av1Hdr, null)).toBeUndefined();
    expect(probedHdrTransfers(['av1'], av1Hdr, undefined)).toBeUndefined();
  });

  it('does not read Dolby Vision or HLG panel support as PQ', () => {
    // Dolby Vision has its own field; no decoder profile advertises HLG.
    expect(probedHdrTransfers(['av1'], av1Hdr, [1, 3])).toEqual([]);
  });
});

describe('probedDolbyVisionProfiles', () => {
  it('is an empty measurement when the device lists no DV decoder', () => {
    expect(probedDolbyVisionProfiles({ 'video/avc': [1] })).toEqual([]);
  });

  it('converts Android profile flags to bitstream profile numbers', () => {
    // DvheDtr 16 -> 4, DvheStn 32 -> 5, DvheSt 256 -> 8, DvavSe 512 -> 9.
    expect(probedDolbyVisionProfiles({ 'video/dolby-vision': [16, 32, 256, 512] })).toEqual([4, 5, 8, 9]);
  });

  it('ignores a flag that is not a single bit', () => {
    // A multi-profile mask cannot be resolved to one number, so it is not guessed.
    expect(probedDolbyVisionProfiles({ 'video/dolby-vision': [48, 32] })).toEqual([5]);
  });

  it('is undefined when the device could not be asked', () => {
    expect(probedDolbyVisionProfiles(undefined)).toBeUndefined();
    expect(probedDolbyVisionProfiles({})).toBeUndefined();
  });
});

/** The decoders are the device's size limit; the screen is not. */
describe('decoderSizeLimit', () => {
  // A real device's `decoder-sizes` report.
  const a85 = {
    'video/av01': { width: 1280, height: 720 },
    'video/avc': { width: 1920, height: 1080 },
    'video/hevc': { width: 1920, height: 1080 },
    'video/mp4v-es': { width: 854, height: 480 },
    'video/x-vnd.on2.vp8': { width: 1920, height: 1080 },
    'video/x-vnd.on2.vp9': { width: 1920, height: 1080 },
  };

  /** The smallest frame would cap 1080p H.264 at AV1's 720p; dropping AV1 would lose its Direct Play at 720p and below. */
  it('states the largest frame, and holds a codec that falls short to its own', () => {
    expect(decoderSizeLimit(a85, ['h264', 'hevc', 'vp9', 'av1'])).toEqual({
      maxWidth: 1920,
      maxHeight: 1080,
      videoCodecMaxSize: { av1: { width: 1280, height: 720 } },
    });
  });

  it('names no codec when all reach the limit', () => {
    expect(decoderSizeLimit(a85, ['h264', 'hevc'])).toEqual({ maxWidth: 1920, maxHeight: 1080 });
  });

  it('takes the larger of a codec’s spellings', () => {
    expect(decoderSizeLimit({ 'audio/eac3': { width: 1, height: 1 }, 'video/av01': { width: 1280, height: 720 } }, ['av1'])).toEqual({
      maxWidth: 1280,
      maxHeight: 720,
    });
  });

  it('states nothing where the decoders were not asked or gave no size', () => {
    expect(decoderSizeLimit(undefined, ['h264'])).toBeUndefined();
    expect(decoderSizeLimit({}, ['h264'])).toBeUndefined();
    // A claimed codec with no size sets no limit rather than being read as zero.
    expect(decoderSizeLimit({ 'video/avc': { width: 1920, height: 1080 } }, ['h264', 'hevc'])).toEqual({ maxWidth: 1920, maxHeight: 1080 });
  });
});
