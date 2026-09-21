/**
 * What the device says it can decode, mapped onto the names Macha uses.
 *
 * **This narrows a declared list; it never widens one.** A decoder existing is
 * not sufficient grounds to claim a codec — the declared lists also encode
 * container and delivery constraints (fMP4 HLS carries far less than the
 * progressive extractors do), and none of that is visible to `MediaCodecList`.
 * So the probe can only ever remove a claim this client was making without
 * evidence, which is exactly the class of fault it was built for.
 *
 * **Absent probe means no change.** iOS and web have no `MediaCodecList`, and
 * a build without the native module returns nothing; in both cases the
 * declared list stands. Absence of a fact is not a fact.
 */

/**
 * Android decoder MIME types per Macha codec name.
 *
 * Several codecs have more than one spelling in the wild and any of them
 * counts: `audio/eac3-joc` is E-AC-3 with Atmos metadata and a device that
 * decodes it decodes E-AC-3. `audio/mpeg` is MP3 on Android, which is why it
 * is not listed under anything else.
 *
 * **Every string here was checked against `android.media.MediaFormat`'s own
 * constants** (`javap -constants` on `android-37/android.jar`, 2026-09-21) and
 * not transcribed from memory. That matters most for the three this project
 * cannot confirm on its own hardware: the A85 has no Dolby decoder, so a typo
 * in `audio/ac3` would look exactly like an absent decoder here and only
 * misbehave on a device that has one. `MIMETYPE_AUDIO_AC3 = "audio/ac3"`,
 * `MIMETYPE_AUDIO_EAC3 = "audio/eac3"`, `MIMETYPE_AUDIO_EAC3_JOC =
 * "audio/eac3-joc"`.
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
 * Codecs to claim **because the device was asked**, not because the list said so.
 *
 * The narrowing rule below is right and stays: a decoder existing is not
 * grounds to claim a codec, because the declared lists also carry container
 * and delivery constraints `MediaCodecList` cannot see. **But applied to
 * everything it switches off the probe's best use**, which is telling us
 * something the hardcoded list never knew.
 *
 * Measured on the A85, 2026-09-21: the device reports
 * `c2.unisoc.av1.decoder`, the declared list has never mentioned AV1, and the
 * one AV1 title in the library — *The Cannonball Run*, Matroska, AV1 1072p,
 * Opus 5.1 — was planned as `{video: transcode, audio: transcode}`. A full
 * 1080p re-encode of a file the phone decodes natively.
 *
 * **Additions are per-dimension and this one is direct-play only.** It is
 * applied to `videoCodecs`, where the container list already covers
 * `mp4`/`mkv`/`webm`, and deliberately **not** to `hlsVideoCodecs`: whether
 * fMP4 HLS carries AV1 through this node and this player is a delivery
 * question, and a decoder says nothing about it. The rule the narrowing
 * protects is intact — nothing here claims a *delivery* the device has not
 * been shown to manage.
 */
export const PROBED_VIDEO_ADDITIONS: readonly string[] = ['av1'];

/**
 * A declared list plus any candidate this device turned out to decode.
 *
 * Order is preserved and duplicates cannot arise: a candidate already declared
 * is left where it was.
 */
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
 * Profile ids that mean more than eight bits, per MIME type.
 *
 * **Keyed by MIME because the numbers collide.** `2` is `AV1ProfileMain10`
 * and also `HEVCProfileMain10`; `4096` is `AV1ProfileMain10HDR10`,
 * `HEVCProfileMain10HDR10` and `VP9Profile2HDR`; `16` is `AVCProfileHigh10`.
 * A single flat set would silently call an H.264 `Main` stream ten-bit.
 *
 * Values read from `android.media.MediaCodecInfo$CodecProfileLevel` with
 * `javap -constants` on `android-37/android.jar`, 2026-09-21, not recalled.
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
 * The deepest video this device will decode, across the codecs claimed.
 *
 * **The minimum, not the maximum, and that is forced by core's model.**
 * `PlaybackCapabilities.videoBitDepth` is one number and
 * `videoStreamObjection` compares every source stream against it, so claiming
 * the deepest any codec manages would direct-play a ten-bit HEVC file to a
 * decoder that only does eight. The safe global claim is the shallowest
 * among the codecs being offered.
 *
 * **Measured on the A85, which is why this is not academic:** AV1 advertises
 * `Main10HDR10` and `Main10HDRPlus`, HEVC advertises only `Main` and
 * `MainStill`, and H.264 has no `High10`. So the truth is ten-bit for one
 * codec and eight for the others, and the model cannot say it. Eight is the
 * right global answer here — the point is that it is now *derived* from the
 * device rather than asserted, and a phone whose HEVC does `Main10` will
 * start direct-playing a library that is 1,094 HEVC files deep instead of
 * transcoding it.
 *
 * `undefined` when the probe said nothing, leaving the declaration alone.
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

/**
 * Profile ids that mean HDR10, per MIME type.
 *
 * `HEVCProfileMain10HDR10` and `AV1ProfileMain10HDR10` are both `4096`, and
 * the `HDR10Plus` pair both `8192`, so this is keyed by MIME like the rest.
 * HDR10 and HDR10+ are both PQ, which is `smpte2084` in the transfer names
 * core compares against.
 */
const HDR10_PROFILES: Readonly<Record<string, readonly number[]>> = {
  'video/av01': [4096, 8192],
  'video/hevc': [4096, 8192],
  'video/x-vnd.on2.vp9': [4096, 16384],
};

/**
 * `Display.HdrCapabilities` constants for the two PQ types.
 *
 * 1 is Dolby Vision and 3 is HLG; neither is claimed here — Dolby Vision has
 * its own field, and HLG is not advertised by any decoder profile.
 */
const DISPLAY_HDR10 = 2;
const DISPLAY_HDR10_PLUS = 4;

/** Android's MIME for a Dolby Vision decoder. */
const DOLBY_VISION_MIME = 'video/dolby-vision';

/**
 * The HDR transfers this device's decoders advertise.
 *
 * **Replaces `hdr: []`, which was asserted with a display argument.** The
 * comment said "a mid-range phone, not a reference display" — true, and about
 * the *panel*, while the field is about whether the stream can be presented
 * at all. Conflating them means every HDR title transcodes, which is the
 * failure that cannot work rather than the one that might look wrong.
 *
 * **Only what the profiles actually state.** HDR10 and HDR10+ name themselves
 * in the profile list, so they are claimed. **HLG is deliberately not**: no
 * profile encodes it — any ten-bit decoder will take it and the signalling is
 * in the transfer characteristics alone — so claiming it would be an
 * inference, which is the habit this file exists to break. It is the obvious
 * next candidate if an HLG title ever turns up.
 *
 * **Intersected with what the panel can present**, which is the television
 * client's design and better than the decoder-only version this started as.
 * It dissolves the original objection rather than overriding it: the old
 * comment worried about PQ on a panel that cannot show it, and that worry is
 * now enforced by asking the panel instead of by refusing every HDR title.
 * A display that does not answer is `undefined` — unknown, not consent.
 */
export function probedHdrTransfers(
  declared: readonly string[],
  profiles: Readonly<Record<string, readonly number[]>> | undefined,
  displayHdrTypes: readonly number[] | null | undefined,
): string[] | undefined {
  if (!profiles || Object.keys(profiles).length === 0) return undefined;
  // A decoder that can read HDR10 says nothing about a panel that can show
  // it. Both have to agree, and the panel not answering is not consent.
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
 * The Dolby Vision bitstream profiles this device decodes.
 *
 * **Replaces a field that was never declared at all**, which core reads as
 * `capabilities.dolbyVision ?? []` — so every Dolby Vision stream objected
 * and transcoded, silently, because nobody had written a line rather than
 * because anybody decided it. An empty answer here means the same thing and
 * is a measurement.
 *
 * Android names these as flags — `DolbyVisionProfileDvavPer` is `1`,
 * `DvavPen` `2`, `DvheDer` `4`, up to `Dvav110` at `1024` — while core wants
 * the bitstream profile number the stream reports. The flags are consecutive
 * powers of two in profile order, so the profile number is the bit position.
 * Constants from `MediaCodecInfo$CodecProfileLevel`, `android-37`.
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
 * Codecs that are claimed **only** when the probe positively confirms them.
 *
 * **Not symmetrical with the rest, and deliberately so.** For most codecs an
 * unanswerable probe should leave the declaration alone, because the cost of
 * being wrong is a transform nobody needed. For these two the cost of being
 * wrong is what was measured on 2026-09-21: the node Direct Plays the title,
 * media3 selects no audio track, and the viewer watches a film in silence
 * with a healthy picture and **no error raised anywhere** — nothing in the
 * app, the log or the UI says what happened.
 *
 * A failure nobody can see is worth more caution than a transform somebody
 * pays for, so these two default to absent and have to be earned. It also
 * keeps the behaviour shipped earlier that day: if this native module is ever
 * dropped from a build, the client falls back to not claiming them rather
 * than silently regressing to silence.
 */
const PROBE_REQUIRED = new Set(['ac3', 'eac3']);

/**
 * The declared codecs this device actually has a decoder for.
 *
 * A codec with no entry in `DECODER_MIME_TYPES` is kept rather than dropped:
 * the table not knowing a name is a gap in the table, and silently narrowing
 * on that would be the same over-confidence in the opposite direction.
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
