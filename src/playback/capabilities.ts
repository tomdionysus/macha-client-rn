import { Platform } from 'react-native';
import type { PlaybackCapabilities } from '../types';

/**
 * What this device can decode without the node transforming anything.
 *
 * These are the platform's own guaranteed decoders, not a probe: iOS uses
 * AVPlayer and Android uses ExoPlayer, and both publish a baseline that is
 * safe to advertise on any shipping phone. Anything outside it — MKV, DTS,
 * TrueHD, VC-1 — is left out so the node remuxes or transcodes rather than
 * handing over a file that plays as a black screen.
 *
 * No decoder resolution limit is advertised. Screen size is not a decoder
 * limit: a modern phone decodes 4K perfectly well and simply scales it down,
 * and claiming otherwise would force a pointless transcode.
 */
export function deviceCapabilities(): PlaybackCapabilities {
  const shared = {
    hls: true,
    containers: ['mp4', 'm4v', 'mov'],
  };

  if (Platform.OS === 'ios') {
    return {
      ...shared,
      platform: 'ios',
      // VP9 and AV1 decode only on some recent hardware and never through
      // AVPlayer's HLS path, so neither is advertised.
      videoCodecs: ['h264', 'hevc'],
      audioCodecs: ['aac', 'ac3', 'eac3', 'alac', 'mp3', 'flac'],
    };
  }

  if (Platform.OS === 'android') {
    return {
      ...shared,
      // ExoPlayer additionally handles Matroska and WebM directly.
      containers: [...shared.containers, 'mkv', 'webm'],
      platform: 'android',
      videoCodecs: ['h264', 'hevc', 'vp9'],
      audioCodecs: ['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac'],
    };
  }

  return {
    ...shared,
    platform: 'web',
    videoCodecs: ['h264'],
    audioCodecs: ['aac', 'mp3'],
  };
}
