import { describe, expect, it } from 'vitest';
import {
  DECODER_MIME_TYPES,
  decodableCodecs,
  probedDolbyVisionProfiles,
  probedHdrTransfers,
  probedVideoBitDepth,
  withProbedAdditions,
} from './codecProbe';

/**
 * The probe that replaced an assertion, measured on the A85 2026-09-21.
 *
 * The client claimed `ac3` and `eac3` on every Android device; that phone has
 * neither decoder, so the node Direct Played those titles, media3 selected no
 * audio track, and two films played in silence with a healthy picture and
 * nothing logged. Deleting the claims fixed this device and wronged any device
 * that does have the decoder. This asks instead.
 */

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
    // The whole point of asking rather than deleting: this device should get
    // Direct Play rather than a transform it does not need.
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
    // A gap in the table is not evidence about the device. Narrowing on it
    // would be the same over-confidence pointed the other way.
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
    // Asymmetric on purpose. Over-claiming these produces a silent film with
    // no error anywhere; under-claiming costs a transform somebody notices.
    // So if this module is ever dropped from a build, the client falls back to
    // the safe behaviour rather than regressing to silence.
    expect(decodableCodecs(DECLARED, undefined)).toEqual(['aac', 'opus', 'vorbis', 'mp3', 'flac']);
  });
});

/**
 * The strings themselves, pinned against Android's own constants.
 *
 * A misspelling here is invisible on the hardware this project has: the A85
 * decodes no AC-3, so `audio/ac-3` and `audio/ac3` would both simply fail to
 * match and both produce the correct answer on this phone, while the first
 * would silently deny Direct Play to every device that does have the decoder.
 * Verified with `javap -constants` on `android-37/android.jar` — the values of
 * `MediaFormat.MIMETYPE_AUDIO_AC3`, `_EAC3`, `_EAC3_JOC` and the rest.
 */
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

/**
 * The widening half, measured on the A85 2026-09-21.
 *
 * The device reports `c2.unisoc.av1.decoder`; the declared list never
 * mentioned AV1; and the library's one AV1 title — *The Cannonball Run*,
 * Matroska, AV1 1072p, Opus 5.1 — was planned `{video: transcode, audio:
 * transcode}`, a full 1080p re-encode of a file the phone decodes natively.
 * That is the probe's best use and narrowing alone switched it off.
 */
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
    // Same rule as narrowing: absence of a fact is not a fact, and an
    // unanswerable probe must leave the declaration exactly as written.
    expect(withProbedAdditions(['h264', 'hevc'], undefined)).toEqual(['h264', 'hevc']);
    expect(withProbedAdditions(['h264', 'hevc'], [])).toEqual(['h264', 'hevc']);
  });

  it('does not duplicate a codec that was already declared', () => {
    expect(withProbedAdditions(['h264', 'av1'], withAv1)).toEqual(['h264', 'av1']);
  });

  it('adds only what it is asked to consider', () => {
    // VP8 has a decoder on this device and is deliberately not a candidate:
    // there is no VP8 content in the library and nothing has been measured,
    // so claiming it would be the same unevidenced assertion in a new place.
    expect(withProbedAdditions(['h264'], [...withAv1, 'video/x-vnd.on2.vp8'])).toEqual(['h264', 'av1']);
  });
});

/**
 * Bit depth, derived instead of asserted.
 *
 * `videoBitDepth: 8` was hardcoded in the 0.2.0 commit of 2026-09-07 with no
 * comment defending it, and it gates every playback decision through core's
 * `videoStreamObjection`. The A85 shows why one number cannot be right:
 * AV1 advertises Main10HDR10 and Main10HDRPlus, HEVC advertises only Main and
 * MainStill, H.264 has no High10. Ten-bit for one codec, eight for the others.
 *
 * Profile ids are from `MediaCodecInfo$CodecProfileLevel` via javap on
 * android-37/android.jar, and they collide across codecs — 2 is both
 * AV1ProfileMain10 and HEVCProfileMain10 — which is why the table is keyed by
 * MIME type.
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
    // The same number the constant asserted — now derived from the device.
    expect(probedVideoBitDepth(['h264', 'hevc', 'vp9', 'av1'], A85_PROFILES)).toBe(8);
  });

  it('takes the minimum, not the maximum, across claimed codecs', () => {
    // Core compares every source stream against this one number, so claiming
    // the deepest any codec manages would direct-play a ten-bit HEVC file to
    // a decoder that only does eight.
    expect(probedVideoBitDepth(['av1'], A85_PROFILES)).toBe(10);
    expect(probedVideoBitDepth(['hevc', 'av1'], A85_PROFILES)).toBe(8);
  });

  it('answers ten when every claimed codec manages ten', () => {
    const capable = { 'video/hevc': [2], 'video/av01': [2] };
    expect(probedVideoBitDepth(['hevc', 'av1'], capable)).toBe(10);
  });

  it('does not read one codec’s profile number as another’s', () => {
    // AVCProfileHigh10 is 16; HEVCProfileMain10 is 2. An H.264 decoder
    // advertising profile 2 (Main) must not be read as ten-bit.
    expect(probedVideoBitDepth(['h264'], { 'video/avc': [2] })).toBe(8);
    expect(probedVideoBitDepth(['h264'], { 'video/avc': [16] })).toBe(10);
  });

  it('is undefined when the device could not be asked', () => {
    // The declaration then stands, rather than this inventing a number.
    expect(probedVideoBitDepth(['h264'], undefined)).toBeUndefined();
    expect(probedVideoBitDepth(['h264'], {})).toBeUndefined();
  });

  it('is undefined when nothing claimed was described', () => {
    expect(probedVideoBitDepth(['vp8'], A85_PROFILES)).toBeUndefined();
  });
});

/**
 * HDR, and Dolby Vision, which were a non-claim and a missing line.
 *
 * `hdr: []` was asserted with "a mid-range phone, not a reference display" —
 * an argument about the panel applied to a field about decoding, so every HDR
 * title transcoded. `dolbyVision` was never declared at all, and core reads
 * that as `?? []`, so every DV stream objected because nobody wrote a line.
 *
 * The intersection is the television client's design: decode says what can be
 * read, the display says what can be shown, and only both together is a claim.
 * Display constants are `Display.HdrCapabilities`: 1 DV, 2 HDR10, 3 HLG,
 * 4 HDR10+.
 */
describe('probedHdrTransfers', () => {
  const av1Hdr = { 'video/av01': [1, 4096, 8192] };
  const sdrOnly = { 'video/av01': [1] };

  it('claims PQ when the decoder reads HDR10 and the panel can show it', () => {
    expect(probedHdrTransfers(['av1'], av1Hdr, [2])).toEqual(['smpte2084']);
    expect(probedHdrTransfers(['av1'], av1Hdr, [4])).toEqual(['smpte2084']);
  });

  it('claims nothing when the panel is SDR, however capable the decoder', () => {
    // The original worry, now enforced by asking rather than by refusing
    // every HDR title outright.
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
    // 1 is Dolby Vision, which has its own field; 3 is HLG, which no decoder
    // profile advertises and which is therefore not claimed from here.
    expect(probedHdrTransfers(['av1'], av1Hdr, [1, 3])).toEqual([]);
  });
});

describe('probedDolbyVisionProfiles', () => {
  it('is an empty measurement when the device lists no DV decoder', () => {
    // The A85. Same outcome as the missing declaration it replaces, but now
    // it is an answer rather than an oversight.
    expect(probedDolbyVisionProfiles({ 'video/avc': [1] })).toEqual([]);
  });

  it('converts Android profile flags to bitstream profile numbers', () => {
    // DvheDtr is 16 -> profile 4, DvheStn 32 -> 5, DvheSt 256 -> 8,
    // DvavSe 512 -> 9. Consecutive powers of two in profile order.
    expect(probedDolbyVisionProfiles({ 'video/dolby-vision': [16, 32, 256, 512] })).toEqual([4, 5, 8, 9]);
  });

  it('ignores a flag that is not a single bit', () => {
    // A vendor answering with a mask of several profiles cannot be resolved
    // to one number, and guessing which it meant is how a wrong claim starts.
    expect(probedDolbyVisionProfiles({ 'video/dolby-vision': [48, 32] })).toEqual([5]);
  });

  it('is undefined when the device could not be asked', () => {
    expect(probedDolbyVisionProfiles(undefined)).toBeUndefined();
    expect(probedDolbyVisionProfiles({})).toBeUndefined();
  });
});
