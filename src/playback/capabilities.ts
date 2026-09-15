import { Platform } from 'react-native';
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
    return {
      platform: 'android',
      containers: ['mp4', 'm4v', 'mov', ...audioContainers, 'mkv', 'matroska', 'webm', 'ogg', 'oga', 'opus'],
      videoCodecs: ['h264', 'hevc', 'vp9'],
      audioCodecs: ['aac', 'ac3', 'eac3', 'opus', 'vorbis', 'mp3', 'flac'],
      hlsFmp4: true,
      hlsTs: true,
      // ExoPlayer's HLS path is narrower than its progressive extractors:
      // fragmented MP4 carries H.264/HEVC and AAC dependably, and little else.
      hlsVideoCodecs: ['h264', 'hevc'],
      hlsAudioCodecs: ['aac'],
      dash: true,
      // Claimed conservatively: over-claiming HDR is a washed-out or black
      // picture, and this is a mid-range phone, not a reference display.
      hdr: [],
      videoBitDepth: 8,
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
 * Facts about the host that no probe can discover.
 *
 * Nothing is excluded today. This exists because the server now performs
 * exactly what it is told: if a device turns out to mis-report a decoder, the
 * correction belongs here rather than in a fallback that no longer exists.
 */
export function devicePlaybackOverrides(): PlaybackPolicyOverrides {
  return {};
}
