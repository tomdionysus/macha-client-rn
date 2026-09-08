import { describe, expect, it } from 'vitest';
import { Platform } from 'react-native';
import { deviceCapabilities } from './capabilities';

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
    // Over-claiming HDR is a washed-out or black picture on a phone that is not
    // a reference display. Under-claiming costs a transcode nobody needed,
    // which is the failure worth having.
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

  it.each(['ios', 'android'] as const)('advertises no decoder resolution limit on %s', (os) => {
    // Screen size is not a decoder limit: a modern phone decodes 4K and scales
    // it down. Declaring one would force a transcode for no reason.
    const caps = onPlatform(os, deviceCapabilities) as { maxHeight?: number };
    expect(caps.maxHeight).toBeUndefined();
  });

  it('claims fragmented-MP4 HLS on both platforms, which is what remux depends on', () => {
    expect(onPlatform('ios', deviceCapabilities).hlsFmp4).toBe(true);
    expect(onPlatform('android', deviceCapabilities).hlsFmp4).toBe(true);
  });
});
