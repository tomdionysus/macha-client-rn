import { Platform } from 'react-native';
import MachaCodecs from '../../modules/macha-codecs/src/MachaCodecsModule';
import {
  decodableCodecs,
  probedDolbyVisionProfiles,
  probedHdrTransfers,
  probedVideoBitDepth,
  withProbedAdditions,
} from './codecProbe';
import type { PlaybackCapabilities } from '@machafoundation/core';
import type { PlaybackPolicyOverrides } from '@machafoundation/core';

/**
 * What this device can decode without the node transforming anything.
 *
 * These are the platform's own guaranteed decoders, not a probe: iOS uses
 * AVPlayer and Android uses ExoPlayer, and both publish a baseline safe to
 * claim on any shipping phone. Anything outside it is left out so the node
 * remuxes or transcodes rather than handing over a file that plays as a black
 * screen — and under the instruction-based API that matters more than it used
 * to, because the server performs what it is told and never second-guesses it.
 *
 * No decoder resolution limit is advertised. Screen size is not a decoder
 * limit: a modern phone decodes 4K perfectly well and scales it down.
 */
export function deviceCapabilities(): PlaybackCapabilities {
  const audioContainers = ['mp3', 'm4a', 'aac', 'wav', 'flac'];

  if (Platform.OS === 'android') {
    // Asked once per call, and only narrowing: see `codecProbe`. A build
    // without the native module, or a device that reports nothing, leaves
    // every declared list exactly as written.
    const profiles = probedProfiles();
    const decoders = profiles ? Object.keys(profiles) : undefined;
    const narrow = (declared: string[]) => decodableCodecs(declared, decoders);
    const claimedVideo = withProbedAdditions(narrow(['h264', 'hevc', 'vp9']), decoders);
    const claimedAudio = narrow(['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac']);
    return {
      platform: 'android',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'mkv', 'matroska', 'webm', 'ogg', 'oga', 'opus'],
      // Narrowed *and* widened: the probe removes what this device cannot
      // decode and adds AV1 where it can. Direct play only — see
      // `PROBED_VIDEO_ADDITIONS`; `hlsVideoCodecs` below is untouched.
      videoCodecs: claimedVideo,
      // **`ac3` and `eac3` are declared here again, and the probe removes them
      // where they are not real.** They were claimed unconditionally until
      // 2026-09-21, when the A85 turned out to have neither decoder: the node
      // Direct Played those titles, media3 selected no audio track, and two
      // films played in silence with a healthy picture and nothing logged —
      // 2010 (AC3 5.1) and Avatar: Fire and Ash (EAC3 5.1).
      //
      // The first fix was to delete them, which is safe but wrong the other
      // way: a device that *does* have an AC-3 decoder then pays for a
      // transform it never needed. `decodableCodecs` asks `MediaCodecList`
      // instead, so a device with the decoder keeps the claim and one without
      // it loses it. **Listing them here is now a statement about the format,
      // not about the hardware** — the hardware is asked below.
      audioCodecs: claimedAudio,
      hlsFmp4: true,
      hlsTs: true,
      // ~~ExoPlayer's HLS path is narrower than its progressive extractors:
      // fragmented MP4 carries H.264/HEVC and AAC dependably, and little
      // else.~~ **Nobody measured that, and the delivery lists are the decode
      // lists now.** The cost of the old assertion is not hypothetical: it
      // re-encodes the audio of every transformed Opus title — observed on
      // *The Cannonball Run* (Opus 5.1) on 2026-09-21 — and it makes an AV1
      // delivery impossible however capable the device is.
      //
      // **A delivery claim narrower than the device warrants cannot work; a
      // wider one can fail visibly.** Tom's call, 2026-09-21. If media3's HLS
      // path turns out not to demux Opus or AV1 in fMP4, that surfaces as a
      // failure somebody can report, and the list comes back on evidence
      // rather than on a sentence nobody checked.
      hlsVideoCodecs: claimedVideo,
      hlsAudioCodecs: claimedAudio,
      // Declared but dead: core reads `capabilities.dash` nowhere. Left as it
      // was rather than quietly changed, since nothing consumes it either way.
      dash: true,
      // ~~Claimed conservatively: over-claiming HDR is a washed-out or black
      // picture, and this is a mid-range phone, not a reference display.~~
      // That argument is about the *panel*; this field is about whether the
      // stream can be presented at all, and conflating them transcoded every
      // HDR title. Both of these are asked of the device now — see
      // `probedHdrTransfers` and `probedDolbyVisionProfiles`, and note that
      // `dolbyVision` was previously not declared at all, which core reads as
      // an empty list, so a silent denial nobody had decided.
      hdr: probedHdrTransfers(claimedVideo, profiles, probedDisplayHdr()) ?? [],
      dolbyVision: probedDolbyVisionProfiles(profiles),
      // **Derived, not declared.** Hardcoded `8` from the 0.2.0 commit of
      // 2026-09-07 with no comment defending it — the same unevidenced
      // assertion as the `ac3`/`eac3` claim, and it has gated every playback
      // decision since. On this device it happens to be right, because HEVC
      // advertises only `Main` and H.264 has no `High10`; it is wrong about
      // AV1, which does `Main10HDR10`. See `probedVideoBitDepth` for why the
      // global answer has to be the minimum. Falls back to the old constant
      // when the device cannot be asked.
      videoBitDepth: probedVideoBitDepth(claimedVideo, profiles) ?? 8,
    };
  }

  if (Platform.OS === 'ios') {
    return {
      // Names the executor, not the operating system: AVPlayer and a browser
      // engine differ on HLS packaging and on ALAC, so claiming 'web' here
      // would be a lie nothing on the wire could catch — capabilities are no
      // longer sent to the server, so this field is only ever read locally.
      platform: 'ios',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'aiff'],
      videoCodecs: ['h264', 'hevc'],
      // **Left claiming `ac3`/`eac3`, unlike android, and that is a decision
      // rather than an oversight.** AVFoundation decodes both across Apple's
      // shipping devices, and nothing here has been measured on iOS — the
      // silence above was an Android decoder absence, not a protocol fault.
      // Removing these on the strength of an Android measurement would be the
      // inherited-claim mistake in the other direction.
      audioCodecs: ['aac', 'ac3', 'eac3', 'alac', 'mp3', 'flac'],
      hlsFmp4: true,
      hlsTs: true,
      hlsVideoCodecs: ['h264', 'hevc'],
      hlsAudioCodecs: ['aac'],
      dash: false,
      hdr: [],
      videoBitDepth: 8,
    };
  }

  return {
    platform: 'web',
    containers: ['mp4', 'm4v', 'mov'],
    videoCodecs: ['h264'],
    audioCodecs: ['aac', 'mp3'],
    hlsFmp4: true,
    dash: false,
    hdr: [],
  };
}

/**
 * What the panel can present, memoised beside the decoder answer.
 *
 * `undefined` means the platform could not be asked, which must not read as
 * "no HDR" — see `probedHdrTransfers`.
 */
let probedDisplay: { types: number[] | null } | undefined;

function probedDisplayHdr(): number[] | null {
  if (probedDisplay) return probedDisplay.types;
  let types: number[] | null;
  try {
    types = MachaCodecs?.displayHdrTypes() ?? null;
  } catch {
    types = null;
  }
  probedDisplay = { types };
  return types;
}

/**
 * The decoder profiles this device reports, or `undefined`.
 *
 * Every failure is the same answer: no native module (iOS, web, or a build
 * predating it), a throw from the platform, or an empty map all mean "not
 * known", and `codecProbe` then leaves the declared lists alone. This must
 * never narrow on a failure to ask — that would silently force transforms for
 * every codec on any device where the call went wrong.
 */
let probed: { profiles: Record<string, number[]> | undefined } | undefined;

function probedProfiles(): Record<string, number[]> | undefined {
  // Memoised: enumerating `MediaCodecList` is not free and this is asked on
  // every create and every failover. A device's decoders do not change while
  // the process lives.
  if (probed) return probed.profiles;
  let profiles: Record<string, number[]> | undefined;
  try {
    const reported = MachaCodecs?.decodableProfiles();
    profiles = reported && Object.keys(reported).length > 0 ? reported : undefined;
  } catch {
    profiles = undefined;
  }
  probed = { profiles };
  // Logged once, because otherwise the difference between "asked and told no"
  // and "never asked" is invisible from outside — which is precisely the
  // confusion that made the silent-audio fault take a day to find.
  const types = profiles ? Object.keys(profiles) : [];
  console.log('[macha] [playback] codec-probe', {
    available: MachaCodecs != null,
    decoders: types.length,
    dolby: ['audio/ac3', 'audio/eac3', 'audio/eac3-joc'].filter((mime) => types.includes(mime)),
    displayHdr: probedDisplayHdr() ?? 'unknown',
    av1: profiles?.['video/av01'] ?? 'absent',
    hevc: profiles?.['video/hevc'] ?? 'absent',
  });
  return profiles;
}

/**
 * Facts about the host that no probe can discover.
 *
 * Nothing is excluded today. This exists because the server now performs
 * exactly what it is told: if a device turns out to mis-report a decoder, the
 * correction belongs here rather than in a fallback that no longer exists.
 */
export function devicePlaybackOverrides(): PlaybackPolicyOverrides {
  return {};
}
