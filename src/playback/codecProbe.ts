/**
 * What the device says it can decode, mapped onto Macha's codec names.
 *
 * The probe only narrows a declared list, widening it solely by
 * `PROBED_VIDEO_ADDITIONS`: the declared lists also encode container and
 * delivery constraints `MediaCodecList` cannot see. With no probe (iOS, web, or
 * a build without the native module) the declared list stands, except for
 * `PROBE_REQUIRED`.
 */

/**
 * Android decoder MIME types per Macha codec name; any spelling counts
 * (`audio/eac3-joc` is E-AC-3 with Atmos). Each must match an
 * `android.media.MediaFormat` constant exactly: a typo looks like an absent decoder.
 */
export const DECODER_MIME_TYPES: Readonly<Record<string, readonly string[]>> = {
  aac: ['audio/mp4a-latm'],
  ac3: ['audio/ac3'],
  eac3: ['audio/eac3', 'audio/eac3-joc'],
  opus: ['audio/opus'],
  vorbis: ['audio/vorbis'],
  mp3: ['audio/mpeg'],
  flac: ['audio/flac'],
  alac: ['audio/alac'],
  h264: ['video/avc'],
  hevc: ['video/hevc'],
  vp9: ['video/x-vnd.on2.vp9'],
  vp8: ['video/x-vnd.on2.vp8'],
  av1: ['video/av01'],
  mpeg2video: ['video/mpeg2'],
};

/**
 * Codecs claimed because the device reports a decoder, not because a list
 * declares them; otherwise every AV1 title is re-encoded on an AV1-capable
 * device. Applied to `videoCodecs`, whose containers already cover mp4/mkv/webm.
 */
export const PROBED_VIDEO_ADDITIONS: readonly string[] = ['av1'];

/** A declared list plus any candidate this device decodes, order preserved, no duplicates. */
export function withProbedAdditions(
  declared: readonly string[],
  mimeTypes: readonly string[] | undefined,
  candidates: readonly string[] = PROBED_VIDEO_ADDITIONS,
): string[] {
  if (!mimeTypes || mimeTypes.length === 0) return [...declared];
  const present = new Set(mimeTypes.map((type) => type.toLowerCase()));
  const already = new Set(declared.map((codec) => codec.toLowerCase()));
  const added = candidates.filter((codec) => {
    if (already.has(codec.toLowerCase())) return false;
    return (DECODER_MIME_TYPES[codec.toLowerCase()] ?? []).some((mime) => present.has(mime));
  });
  return [...declared, ...added];
}

/**
 * `MediaCodecInfo.CodecProfileLevel` ids that mean more than eight bits.
 * Keyed by MIME because the numbers collide across codecs (`2` is both AV1 and
 * HEVC Main10; `16` is AVC High10).
 */
const TEN_BIT_PROFILES: Readonly<Record<string, readonly number[]>> = {
  // AV1ProfileMain10, Main10HDR10, Main10HDR10Plus
  'video/av01': [2, 4096, 8192],
  // HEVCProfileMain10, Main10HDR10, Main10HDR10Plus
  'video/hevc': [2, 4096, 8192],
  // AVCProfileHigh10
  'video/avc': [16],
  // VP9Profile2, Profile2HDR, Profile2HDR10Plus
  'video/x-vnd.on2.vp9': [4, 4096, 16384],
};

/**
 * The deepest video this device decodes, across the claimed codecs.
 *
 * The minimum, because core's `videoBitDepth` is one number checked against
 * every stream: taking the maximum would send ten-bit HEVC to an eight-bit
 * decoder. `undefined` when the probe said nothing.
 */
export function probedVideoBitDepth(
  declared: readonly string[],
  profiles: Readonly<Record<string, readonly number[]>> | undefined,
): number | undefined {
  if (!profiles || Object.keys(profiles).length === 0) return undefined;
  const depths: number[] = [];
  for (const codec of declared) {
    for (const mime of DECODER_MIME_TYPES[codec.toLowerCase()] ?? []) {
      const advertised = profiles[mime];
      if (!advertised) continue;
      const deep = TEN_BIT_PROFILES[mime] ?? [];
      depths.push(advertised.some((profile) => deep.includes(profile)) ? 10 : 8);
    }
  }
  return depths.length === 0 ? undefined : Math.min(...depths);
}

/** Profile ids that mean HDR10 or HDR10+ (both PQ, core's `smpte2084`), keyed by MIME as the ids collide. */
const HDR10_PROFILES: Readonly<Record<string, readonly number[]>> = {
  'video/av01': [4096, 8192],
  'video/hevc': [4096, 8192],
  'video/x-vnd.on2.vp9': [4096, 16384],
};

/** `Display.HdrCapabilities` PQ types. Dolby Vision (1) has its own field; HLG (3) is never advertised by a profile. */
const DISPLAY_HDR10 = 2;
const DISPLAY_HDR10_PLUS = 4;

/** Android's MIME for a Dolby Vision decoder. */
const DOLBY_VISION_MIME = 'video/dolby-vision';

/**
 * The HDR transfers this device's decoders advertise, intersected with what the
 * panel presents. Only HDR10/HDR10+, which profiles name; HLG is never inferred.
 * A display that does not answer gives `undefined`: unknown, not consent.
 */
export function probedHdrTransfers(
  declared: readonly string[],
  profiles: Readonly<Record<string, readonly number[]>> | undefined,
  displayHdrTypes: readonly number[] | null | undefined,
): string[] | undefined {
  if (!profiles || Object.keys(profiles).length === 0) return undefined;
  if (!displayHdrTypes) return undefined;
  const panelShowsHdr10 = displayHdrTypes.includes(DISPLAY_HDR10) || displayHdrTypes.includes(DISPLAY_HDR10_PLUS);
  if (!panelShowsHdr10) return [];
  for (const codec of declared) {
    for (const mime of DECODER_MIME_TYPES[codec.toLowerCase()] ?? []) {
      const advertised = profiles[mime] ?? [];
      const hdr10 = HDR10_PROFILES[mime] ?? [];
      if (advertised.some((profile) => hdr10.includes(profile))) return ['smpte2084'];
    }
  }
  return [];
}

/**
 * The Dolby Vision bitstream profiles this device decodes; core treats an
 * empty and an absent answer alike as no Dolby Vision.
 *
 * Android reports profiles as power-of-two flags in profile order, so the
 * profile number is the bit position.
 */
export function probedDolbyVisionProfiles(
  profiles: Readonly<Record<string, readonly number[]>> | undefined,
): number[] | undefined {
  if (!profiles || Object.keys(profiles).length === 0) return undefined;
  const advertised = profiles[DOLBY_VISION_MIME];
  if (!advertised) return [];
  return advertised
    .filter((flag) => flag > 0 && (flag & (flag - 1)) === 0)
    .map((flag) => Math.log2(flag))
    .sort((a, b) => a - b);
}

/**
 * Codecs claimed only when the probe positively confirms them. A wrong claim
 * here means Direct Play with no audio track selected: silent playback and no
 * error anywhere, which is worse than a needless transform.
 */
const PROBE_REQUIRED = new Set(['ac3', 'eac3']);

/**
 * The declared codecs this device has a decoder for. A codec missing from
 * `DECODER_MIME_TYPES` is kept: a gap in the table is not evidence.
 */
export function decodableCodecs(
  declared: readonly string[],
  mimeTypes: readonly string[] | undefined,
): string[] {
  const probed = mimeTypes && mimeTypes.length > 0;
  const present = new Set((mimeTypes ?? []).map((type) => type.toLowerCase()));
  return declared.filter((codec) => {
    const name = codec.toLowerCase();
    const candidates = DECODER_MIME_TYPES[name];
    if (!probed) return !PROBE_REQUIRED.has(name);
    if (!candidates) return true;
    return candidates.some((mime) => present.has(mime));
  });
}

/**
 * The largest picture this device decodes (`maxWidth`/`maxHeight`), plus each
 * claimed codec whose decoder stops short of it (`videoCodecMaxSize`).
 *
 * From the decoders (landscape, 24 fps), not the screen. The overall limit is
 * the largest any claimed codec reaches, so one weak decoder neither caps the
 * device nor loses its claim. A codec with no reported size sets no limit.
 */
export function decoderSizeLimit(
  sizes: Readonly<Record<string, { width: number; height: number }>> | undefined,
  claimedVideo: readonly string[],
): { maxWidth: number; maxHeight: number; videoCodecMaxSize?: Record<string, { width: number; height: number }> } | undefined {
  if (!sizes) return undefined;
  const area = (frame: { width: number; height: number }) => frame.width * frame.height;
  const largestOf = (codec: string) => {
    const frames = (DECODER_MIME_TYPES[codec] ?? []).map((mime) => sizes[mime]).filter((frame) => frame !== undefined);
    return frames.length === 0 ? undefined : frames.reduce((a, b) => (area(b) > area(a) ? b : a));
  };
  let top: { width: number; height: number } | undefined;
  for (const codec of claimedVideo) {
    const frame = largestOf(codec);
    if (frame && (!top || area(frame) > area(top))) top = frame;
  }
  if (!top) return undefined;
  const reach = top;
  const perCodec: Record<string, { width: number; height: number }> = {};
  for (const codec of claimedVideo) {
    const frame = largestOf(codec);
    if (frame && area(frame) < area(reach)) perCodec[codec] = { width: frame.width, height: frame.height };
  }
  return {
    maxWidth: reach.width,
    maxHeight: reach.height,
    ...(Object.keys(perCodec).length > 0 ? { videoCodecMaxSize: perCodec } : {}),
  };
}
