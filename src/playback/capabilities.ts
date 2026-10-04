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
 * What this device can play without the node transforming anything.
 *
 * Each platform starts from its player's guaranteed baseline (AVPlayer,
 * ExoPlayer); Android then narrows and widens it by probing. The node does what
 * it is told, so an over-claim plays as a black screen or silence.
 *
 * On Android `maxWidth`/`maxHeight` come from the decoders (`decoderSizeLimit`),
 * never the screen, so a small panel can still Direct Play what its decoders
 * manage; the screen only sets the automatic quality default (`qualityCeiling`).
 */
export function deviceCapabilities(): PlaybackCapabilities {
  return platformCapabilities();
}

/**
 * The panel in physical pixels, landscape. `screen` rather than `window`,
 * which excludes the system bars.
 */
export function displayPixels(): { width: number; height: number } | undefined {
  const { width, height, scale } = Dimensions.get('screen');
  const long = Math.round(Math.max(width, height) * scale);
  const short = Math.round(Math.min(width, height) * scale);
  return long > 0 && short > 0 ? { width: long, height: short } : undefined;
}

/** Memoised decoder frame sizes; undefined (no limit) when they could not be asked. */
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
    // See `codecProbe`. With no probe the declared lists stand, less the
    // codecs that must be probed to be claimed.
    const profiles = probedProfiles();
    const decoders = profiles ? Object.keys(profiles) : undefined;
    const narrow = (declared: string[]) => decodableCodecs(declared, decoders);
    const claimedVideo = withProbedAdditions(narrow(['h264', 'hevc', 'vp9']), decoders);
    const claimedAudio = narrow(['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac']);
    return {
      platform: 'android',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'mkv', 'matroska', 'webm', 'ogg', 'oga', 'opus'],
      // Narrowed by the probe, plus AV1 where decodable (`PROBED_VIDEO_ADDITIONS`).
      videoCodecs: claimedVideo,
      // Formats, not hardware: the probe removes `ac3`/`eac3` where there is no
      // decoder, since a false claim plays silent with nothing logged.
      audioCodecs: claimedAudio,
      hlsFmp4: true,
      hlsTs: true,
      // Delivery lists equal the decode lists. Narrower would re-encode audio and
      // rule out AV1; if media3's HLS path cannot demux a codec, it fails visibly.
      hlsVideoCodecs: claimedVideo,
      hlsAudioCodecs: claimedAudio,
      // Core does not read `capabilities.dash`.
      dash: true,
      // Whether the stream can be presented at all, not a judgement of the panel.
      hdr: probedHdrTransfers(claimedVideo, profiles, probedDisplayHdr()) ?? [],
      dolbyVision: probedDolbyVisionProfiles(profiles),
      // Minimum across claimed codecs (see `probedVideoBitDepth`); 8 when unknown.
      videoBitDepth: probedVideoBitDepth(claimedVideo, profiles) ?? 8,
      // Absent where the device could not be asked; see `decoderSizeLimit`.
      ...decoderSizeLimit(probedDecoderSizes(), claimedVideo),
    };
  }

  if (Platform.OS === 'ios') {
    return {
      // The executor, not the OS: AVPlayer and a browser differ on HLS packaging and ALAC.
      platform: 'ios',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'aiff'],
      videoCodecs: ['h264', 'hevc'],
      // Unconditional: AVFoundation decodes both on every Apple device, and iOS has no probe.
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

/** Memoised display HDR types; `null` means the platform could not be asked, not "no HDR". */
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
 * Memoised decoder profiles, or `undefined` when unknown (no native module, a
 * throw, or an empty map). Never narrow on a failure to ask: that would force
 * transforms for every codec.
 */
let probed: { profiles: Record<string, number[]> | undefined } | undefined;

function probedProfiles(): Record<string, number[]> | undefined {
  // Memoised: enumerating `MediaCodecList` is costly and asked on every create and failover.
  if (probed) return probed.profiles;
  let profiles: Record<string, number[]> | undefined;
  try {
    const reported = MachaCodecs?.decodableProfiles();
    profiles = reported && Object.keys(reported).length > 0 ? reported : undefined;
  } catch {
    profiles = undefined;
  }
  probed = { profiles };
  // Logged once so "asked and told no" is distinguishable from "never asked".
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

/** Host facts no probe can discover, for correcting a device that mis-reports a decoder. Currently none. */
export function devicePlaybackOverrides(): PlaybackPolicyOverrides {
  return {};
}
