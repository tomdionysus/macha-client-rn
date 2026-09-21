import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { generationLocalMs, generationOriginMs, titlePositionMs } from './policy';

/**
 * The timelines this client was conflating, measured on the A85 2026-09-21.
 *
 * Every case below is a real reading from that run, not an invented one. The
 * headline: *Avatar*, transcode, scrubbed to 1:44:35 — the node built the
 * generation at `seekMs 6275725` and the player then reported ~13 s, which the
 * bar printed as `0:13`. Before the fix `positionMs` was `currentTime * 1000`
 * with no origin added, so it returned 13_000 for that case and every
 * assertion here that adds an origin fails.
 */

const transformed = (seekMs: number) =>
  ({ source: { isManifest: true }, seekMs }) as unknown as PlaybackSession;
const direct = (seekMs = 0) =>
  ({ source: { isManifest: false }, seekMs }) as unknown as PlaybackSession;

/** A downloaded original played off the disk: no node, no generation. */
const noSession = undefined;

describe('generationOriginMs', () => {
  it('is where the node said the generation begins', () => {
    expect(generationOriginMs(transformed(6_275_725))).toBe(6_275_725);
  });

  it('is zero for direct play, which is the whole file', () => {
    // Measured: a scrub on 28 Weeks Later landed at 44:33 and reported it
    // correctly, because for direct the two timelines coincide. Adding an
    // origin here would move a position that was already right.
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
    // The defect exactly: 0:13 into a generation that begins at 1:44:35.7 is
    // 1:44:48.7 of the film, not 13 seconds.
    expect(titlePositionMs(transformed(6_275_725), 13_000)).toBe(6_288_725);
  });

  it('reports the generation origin at the moment it starts', () => {
    // What the bar should read the instant a rebuilding seek lands.
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
    // seekTo writes currentTime directly when the target is already buffered.
    // Writing 1:44:48 into a generation that starts at 1:44:35 would ask for a
    // point nearly two hours past anything the node has produced.
    expect(generationLocalMs(transformed(6_275_725), 6_288_725)).toBe(13_000);
  });

  it('round-trips with titlePositionMs', () => {
    const session = transformed(3_161_659);
    expect(generationLocalMs(session, titlePositionMs(session, 8_500))).toBe(8_500);
  });

  it('clamps a target below the generation origin to its start', () => {
    // A backward seek past the origin cannot be served by this generation; the
    // reposition path is what handles it, and this must not go negative on the
    // way there.
    expect(generationLocalMs(transformed(6_275_725), 60_000)).toBe(0);
  });

  it('is the identity for direct play', () => {
    expect(generationLocalMs(direct(), 2_673_964)).toBe(2_673_964);
  });
});
