import { describe, expect, it } from 'vitest';
import { Dimensions as NativeDimensions, Platform } from 'react-native';
import { deviceCapabilities } from './capabilities';

/** The stub's panel, which a test sets as it sets `Platform.OS`; see `src/test/react-native.ts`. */
const Dimensions = NativeDimensions as unknown as {
  screen: { width: number; height: number; scale: number; fontScale: number };
};

const onPlatform = <T,>(os: 'ios' | 'android', run: () => T): T => {
  const previous = Platform.OS;
  Platform.OS = os;
  try {
    return run();
  } finally {
    Platform.OS = previous;
  }
};

describe('deviceCapabilities', () => {
  it.each(['ios', 'android'] as const)('never claims HDR on %s', (os) => {
    // With no native module to ask, nothing is claimed: under-claiming costs a
    // transcode, over-claiming a black or washed-out picture.
    expect(onPlatform(os, deviceCapabilities).hdr).toEqual([]);
  });

  it.each(['ios', 'android'] as const)('keeps HLS codec claims no wider than direct ones on %s', (os) => {
    // Core's rule: a codec list valid for direct play can be invalid for HLS
    // delivery, because a device's HLS decoder is often not its media
    // element's. These may only ever be narrower, never wider.
    const caps = onPlatform(os, deviceCapabilities);
    for (const codec of caps.hlsVideoCodecs ?? []) expect(caps.videoCodecs).toContain(codec);
    for (const codec of caps.hlsAudioCodecs ?? []) expect(caps.audioCodecs).toContain(codec);
  });

  /**
   * The screen is never the device's limit: a panel smaller than 1080p would
   * refuse Direct Play of files its decoders manage. The limit is the
   * decoders' own (`decoderSizeLimit`), and with no probe there is none.
   */
  it.each(['ios', 'android'] as const)('states no size limit from the screen on %s', (os) => {
    const saved = Dimensions.screen;
    Dimensions.screen = { width: 360, height: 806, scale: 2, fontScale: 1 };
    try {
      const caps = onPlatform(os, deviceCapabilities);
      expect(caps.maxWidth).toBeUndefined();
      expect(caps.maxHeight).toBeUndefined();
    } finally {
      Dimensions.screen = saved;
    }
  });

  it('claims fragmented-MP4 HLS on both platforms, which is what remux depends on', () => {
    expect(onPlatform('ios', deviceCapabilities).hlsFmp4).toBe(true);
    expect(onPlatform('android', deviceCapabilities).hlsFmp4).toBe(true);
  });
});

/**
 * An audio codec claimed without a decoder makes the node Direct Play, and
 * media3 then selects no audio track: picture fine, silence, nothing logged.
 */
describe('deviceCapabilities audio claims', () => {
  it('does not claim ac3 or eac3 on android when the device cannot be asked', () => {
    // The native module is aliased away under vitest, so this is the unprobed
    // path: an unanswerable probe refuses them. `codecProbe.test.ts` covers a
    // device that answers.
    const { audioCodecs } = onPlatform('android', deviceCapabilities);
    expect(audioCodecs).not.toContain('ac3');
    expect(audioCodecs).not.toContain('eac3');
  });

  it('still claims the android codecs that were measured working', () => {
    // Refusing ac3 and eac3 must not narrow the rest into needless transcodes.
    const { audioCodecs } = onPlatform('android', deviceCapabilities);
    expect(audioCodecs).toContain('aac');
    expect(audioCodecs).toContain('mp3');
    expect(audioCodecs).toContain('flac');
    expect(audioCodecs).toContain('opus');
  });

  it('keeps ac3 and eac3 on ios, which AVFoundation decodes', () => {
    // Deliberate asymmetry with Android: iOS has no probe, and AVFoundation
    // decodes both.
    const { audioCodecs } = onPlatform('ios', deviceCapabilities);
    expect(audioCodecs).toContain('ac3');
    expect(audioCodecs).toContain('eac3');
  });
});
