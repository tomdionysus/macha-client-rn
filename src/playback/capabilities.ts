import { Dimensions, Platform } from 'react-native';
import MachaCodecs from '../../modules/macha-codecs/src/MachaCodecsModule';
import {
  decodableCodecs,
  decoderSizeLimit,
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
 * Each platform starts from its player's guaranteed baseline (AVPlayer,
 * ExoPlayer); Android then narrows and widens it by probing. Anything not
 * claimed makes the node remux or transcode, and the server performs what it
 * is told, so an over-claim plays as a black screen or silence.
 *
 * On Android the largest picture the decoders manage is stated as `maxWidth` /
 * `maxHeight` (`decoderSizeLimit`). Core's chooser objects to a larger picture
 * (`video-size-exceeds-client`), and `playbackVersions` offers nothing above it
 * unless the viewer turned the limit off (`QualityPreference.offerAll`).
 *
 * The limit is never the screen: a panel smaller than 1080p would refuse
 * Direct Play of files its decoders manage. The screen is only a preference
 * default for automatic play (`qualityCeiling`). iOS and web have no probe and
 * state no limit.
 */
export function deviceCapabilities(): PlaybackCapabilities {
  return platformCapabilities();
}

/**
 * The panel in physical pixels. `screen` rather than `window`, because the
 * window loses the system bars and the panel does not. Stated landscape;
 * core classes a screen either way up (`displayQualityClass`).
 */
export function displayPixels(): { width: number; height: number } | undefined {
  const { width, height, scale } = Dimensions.get('screen');
  const long = Math.round(Math.max(width, height) * scale);
  const short = Math.round(Math.min(width, height) * scale);
  return long > 0 && short > 0 ? { width: long, height: short } : undefined;
}

/**
 * The decoders' frame sizes, memoised like the profiles, or undefined where
 * they could not be asked (no native module, a build predating the call, or
 * a throw), which states no limit.
 */
let probedSizes: { sizes: Record<string, { width: number; height: number }> | undefined } | undefined;

function probedDecoderSizes(): Record<string, { width: number; height: number }> | undefined {
  if (probedSizes) return probedSizes.sizes;
  let sizes: Record<string, { width: number; height: number }> | undefined;
  try {
    const reported = MachaCodecs?.videoDecoderSizes?.();
    sizes = reported && Object.keys(reported).length > 0 ? reported : undefined;
  } catch {
    sizes = undefined;
  }
  probedSizes = { sizes };
  console.log('[macha] [playback] decoder-sizes', sizes ?? 'unknown');
  return sizes;
}

function platformCapabilities(): PlaybackCapabilities {
  const audioContainers = ['mp3', 'm4a', 'aac', 'wav', 'flac'];

  if (Platform.OS === 'android') {
    // See `codecProbe`. A build without the native module, or a device that
    // reports nothing, leaves the declared lists as written, less the codecs
    // that must be probed to be claimed.
    const profiles = probedProfiles();
    const decoders = profiles ? Object.keys(profiles) : undefined;
    const narrow = (declared: string[]) => decodableCodecs(declared, decoders);
    const claimedVideo = withProbedAdditions(narrow(['h264', 'hevc', 'vp9']), decoders);
    const claimedAudio = narrow(['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac']);
    return {
      platform: 'android',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'mkv', 'matroska', 'webm', 'ogg', 'oga', 'opus'],
      // The probe removes what this device cannot decode and adds AV1 where it
      // can; see `PROBED_VIDEO_ADDITIONS`.
      videoCodecs: claimedVideo,
      // `ac3` and `eac3` are listed as formats, not as hardware: the probe
      // removes them where the device has no decoder. Claimed without one, the
      // node Direct Plays and media3 selects no audio track, so the title plays
      // in silence with nothing logged.
      audioCodecs: claimedAudio,
      hlsFmp4: true,
      hlsTs: true,
      // The delivery lists are the decode lists. A narrower HLS claim
      // re-encodes audio and rules out AV1 delivery however capable the device
      // is; a wider one, if media3's HLS path cannot demux a codec in fMP4,
      // fails visibly and can be reported.
      hlsVideoCodecs: claimedVideo,
      hlsAudioCodecs: claimedAudio,
      // Core does not read `capabilities.dash`.
      dash: true,
      // Whether the stream can be presented at all, asked of the device. Not a
      // judgement of the panel's quality. An undeclared `dolbyVision` reads in
      // core as an empty list.
      hdr: probedHdrTransfers(claimedVideo, profiles, probedDisplayHdr()) ?? [],
      dolbyVision: probedDolbyVisionProfiles(profiles),
      // Derived from the decoder profiles; see `probedVideoBitDepth` for why the
      // answer is the minimum across claimed codecs. 8 when the device cannot
      // be asked.
      videoBitDepth: probedVideoBitDepth(claimedVideo, profiles) ?? 8,
      // Absent where the device could not be asked; see `decoderSizeLimit`.
      ...decoderSizeLimit(probedDecoderSizes(), claimedVideo),
    };
  }

  if (Platform.OS === 'ios') {
    return {
      // Names the executor, not the operating system: AVPlayer and a browser
      // engine differ on HLS packaging and on ALAC. Read only locally.
      platform: 'ios',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'aiff'],
      videoCodecs: ['h264', 'hevc'],
      // Claimed unconditionally, unlike Android: AVFoundation decodes both on
      // every shipping Apple device, and iOS has no probe.
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
  // Memoised: enumerating `MediaCodecList` is not free, this is asked on every
  // create and failover, and a device's decoders do not change in-process.
  if (probed) return probed.profiles;
  let profiles: Record<string, number[]> | undefined;
  try {
    const reported = MachaCodecs?.decodableProfiles();
    profiles = reported && Object.keys(reported).length > 0 ? reported : undefined;
  } catch {
    profiles = undefined;
  }
  probed = { profiles };
  // Logged once so that "asked and told no" is distinguishable from "never
  // asked".
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
 * Nothing is excluded. The server performs exactly what it is told, so a
 * device that mis-reports a decoder is corrected here.
 */
export function devicePlaybackOverrides(): PlaybackPolicyOverrides {
  return {};
}
