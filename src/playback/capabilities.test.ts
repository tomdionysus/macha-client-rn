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

/**
 * The codec claim that made two films silent, measured on the A85 2026-09-21.
 *
 * `dumpsys media.player` on that device lists no `audio/ac3` and no
 * `audio/eac3`, yet this module claimed both. The node took the claim at face
 * value, Direct Played *2010* (AC3 5.1) and *Avatar: Fire and Ash* (EAC3 5.1),
 * and media3 selected no audio track at all — picture fine, audio output in
 * standby for over a minute, nothing logged anywhere. Every AAC title in the
 * same run had sound.
 */
describe('deviceCapabilities audio claims', () => {
  it('does not claim ac3 or eac3 on android when the device cannot be asked', () => {
    // These are declared in the module and removed again by the probe, which
    // is aliased away under vitest — so this is the unprobed path, and the
    // assertion is that an unanswerable probe refuses them rather than
    // letting the declaration through. `codecProbe.test.ts` covers the case
    // where a device answers, in both directions.
    const { audioCodecs } = onPlatform('android', deviceCapabilities);
    expect(audioCodecs).not.toContain('ac3');
    expect(audioCodecs).not.toContain('eac3');
  });

  it('still claims the android codecs that were measured working', () => {
    // Removing the false claims must not quietly narrow the rest into
    // transcodes nobody needed.
    const { audioCodecs } = onPlatform('android', deviceCapabilities);
    expect(audioCodecs).toContain('aac');
    expect(audioCodecs).toContain('mp3');
    expect(audioCodecs).toContain('flac');
    expect(audioCodecs).toContain('opus');
  });

  it('keeps ac3 and eac3 on ios, which AVFoundation decodes', () => {
    // Deliberate asymmetry, and this test exists so it stays chosen rather
    // than drifted into: the silence was an Android decoder absence, and
    // dropping these on iOS on the strength of an Android reading would be the
    // same over-reach in the other direction.
    const { audioCodecs } = onPlatform('ios', deviceCapabilities);
    expect(audioCodecs).toContain('ac3');
    expect(audioCodecs).toContain('eac3');
  });
});
