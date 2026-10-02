import { describe, expect, it } from 'vitest';
import type { PlaybackSession } from '@machafoundation/core';
import { observeSeek, seekBase, seekPlan, type SeekIntent } from './seekIntent';

// A transcode generation the node began at 30:00.
const transformed = { source: { isManifest: true }, seekMs: 1_800_000, mode: 'transcode' } as unknown as PlaybackSession;
const direct = { source: { isManifest: false }, seekMs: 0, mode: 'direct' } as unknown as PlaybackSession;

describe('where a seek is served from', () => {
  it('asks the node for a seek back past where the generation began, never clamping to its start', () => {
    // At 30:20, back ten seconds twice: 30:00 is the origin, 29:59 is not in it.
    expect(seekPlan(transformed, 1_799_000, 1_850_000)).toEqual({ kind: 'reposition' });
  });

  it('seeks the player within the generation, on its own timeline', () => {
    expect(seekPlan(transformed, 1_810_000, 1_850_000)).toEqual({ kind: 'local', localMs: 10_000 });
    expect(seekPlan(transformed, 1_800_000, 1_850_000)).toEqual({ kind: 'local', localMs: 0 });
  });

  it('asks the node for a seek past what the player has buffered', () => {
    expect(seekPlan(transformed, 1_860_000, 1_850_000)).toEqual({ kind: 'reposition' });
  });

  it('serves Direct and a downloaded file from the player, anywhere', () => {
    expect(seekPlan(direct, 5_000_000, 0)).toEqual({ kind: 'local', localMs: 5_000_000 });
    expect(seekPlan(undefined, 42, 0)).toEqual({ kind: 'local', localMs: 42 });
  });
});

describe('a pinned seek target', () => {
  const pinned = (presented: boolean): SeekIntent => ({ targetMs: 600_000, presented });

  it('builds the next seek on the target, so presses add up in the direction pressed', () => {
    expect(seekBase(pinned(false), 1_200_000) - 10_000).toBe(590_000);
    expect(seekBase(undefined, 1_200_000) - 10_000).toBe(1_190_000);
  });

  it('ignores the outgoing stream, however it moves, until the new one is presented', () => {
    let intent: SeekIntent | undefined = pinned(false);
    for (const reported of [1_200_000, 1_201_000, 1_202_000]) intent = intent && observeSeek(intent, reported);
    expect(intent).toEqual(pinned(false));
  });

  it('releases when the player reaches the target', () => {
    expect(observeSeek(pinned(false), 601_400)).toBeUndefined();
    expect(observeSeek(pinned(true), 598_600)).toBeUndefined();
  });

  it('releases once the presented stream is seen tracking somewhere near, not on, the target', () => {
    const first = observeSeek(pinned(true), 596_000);
    expect(first).toEqual({ targetMs: 600_000, presented: true, lastReportedMs: 596_000 });
    expect(observeSeek(first!, 596_000)).toEqual(first);
    expect(observeSeek(first!, 596_500)).toBeUndefined();
  });
});
