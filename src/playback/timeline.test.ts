import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { generationLocalMs, generationOriginMs, titlePositionMs } from './policy';

/**
 * A transformed generation's positions are relative to the node's `seekMs`:
 * a transcode scrubbed to 1:44:35 starts at `seekMs 6275725` and then reports
 * about 13 s, which read as a title position would put the bar at 0:13.
 */

const transformed = (seekMs: number) =>
  ({ source: { isManifest: true }, seekMs }) as unknown as PlaybackSession;
const direct = (seekMs = 0) =>
  ({ source: { isManifest: false }, seekMs }) as unknown as PlaybackSession;

/** A downloaded original played from disk: no node, no generation. */
const noSession = undefined;

describe('generationOriginMs', () => {
  it('is where the node said the generation begins', () => {
    expect(generationOriginMs(transformed(6_275_725))).toBe(6_275_725);
  });

  it('is zero for direct play, which is the whole file', () => {
    // The timelines coincide for direct; an origin would move a correct position.
    expect(generationOriginMs(direct(2_673_964))).toBe(0);
  });

  it('is zero with no session at all', () => {
    expect(generationOriginMs(noSession)).toBe(0);
  });

  it('treats a generation built from the start as origin zero', () => {
    expect(generationOriginMs(transformed(0))).toBe(0);
  });
});

describe('titlePositionMs', () => {
  it('puts the measured Avatar reading back on the title timeline', () => {
    // 0:13 into a generation starting at 1:44:35.7 is 1:44:48.7 of the film.
    expect(titlePositionMs(transformed(6_275_725), 13_000)).toBe(6_288_725);
  });

  it('reports the generation origin at the moment it starts', () => {
    // What the bar reads the instant a rebuilding seek lands.
    expect(titlePositionMs(transformed(6_275_725), 0)).toBe(6_275_725);
  });

  it('leaves direct play untouched', () => {
    expect(titlePositionMs(direct(), 2_673_964)).toBe(2_673_964);
  });

  it('leaves a downloaded original untouched', () => {
    expect(titlePositionMs(noSession, 61_000)).toBe(61_000);
  });

  it('never reports a negative position', () => {
    expect(titlePositionMs(transformed(0), -40)).toBe(0);
  });
});

describe('generationLocalMs', () => {
  it('converts a title position back for writing into the player', () => {
    // seekTo writes currentTime directly for a buffered target; a title position
    // would land far past anything produced.
    expect(generationLocalMs(transformed(6_275_725), 6_288_725)).toBe(13_000);
  });

  it('round-trips with titlePositionMs', () => {
    const session = transformed(3_161_659);
    expect(generationLocalMs(session, titlePositionMs(session, 8_500))).toBe(8_500);
  });

  it('clamps a target below the generation origin to its start', () => {
    // The reposition path handles a seek before the origin; this must not go negative.
    expect(generationLocalMs(transformed(6_275_725), 60_000)).toBe(0);
  });

  it('is the identity for direct play', () => {
    expect(generationLocalMs(direct(), 2_673_964)).toBe(2_673_964);
  });
});
