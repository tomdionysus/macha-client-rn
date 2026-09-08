import { describe, expect, it } from 'vitest';
import { buildOrder, statedUpdate, transformFor } from './policy';
import type { PlaybackSession } from '@macha/core';

/** Only the fields the policy reads. The rest of a session is irrelevant here. */
const sessionWith = (maxHeight: number | null, maxBitrate: number | null = null) =>
  ({ preferences: { maxHeight, maxBitrate } } as unknown as PlaybackSession);

describe('transformFor', () => {
  it('copies both streams for direct and remux, and re-encodes both for transcode', () => {
    expect(transformFor('direct')).toEqual({ video: 'copy', audio: 'copy' });
    expect(transformFor('remux')).toEqual({ video: 'copy', audio: 'copy' });
    expect(transformFor('transcode')).toEqual({ video: 'transcode', audio: 'transcode' });
  });
});

describe('statedUpdate', () => {
  it('leaves an update that names no mode completely alone', () => {
    const update = { preferences: { maxHeight: 720 } };
    expect(statedUpdate(update, sessionWith(null))).toBe(update);
  });

  it('states the whole transform whenever a mode is named', () => {
    // A bare `mode` is legal and the node would pick `video`/`audio` itself.
    // That is the one thing this client must not allow: the node performs what
    // it is told without asking what this device can decode.
    const stated = statedUpdate({ preferences: { mode: 'direct' } }, sessionWith(null));
    expect(stated.preferences).toMatchObject({ mode: 'direct', video: 'copy', audio: 'copy' });
  });

  it('keeps a quality cap when the viewer switches to transcode', () => {
    // The regression this exists for: server 0.34.0 clears max_height when a
    // PATCH names mode, so touching Mode silently handed the viewer a
    // full-height transcode they never asked for.
    const stated = statedUpdate({ preferences: { mode: 'transcode' } }, sessionWith(720, 3_000_000));
    expect(stated.preferences?.maxHeight).toBe(720);
    expect(stated.preferences?.maxBitrate).toBe(3_000_000);
  });

  it('does not restate a cap into direct or remux, where nothing could apply it', () => {
    // Copying passes the encoded stream through untouched, so there is no stage
    // at which a height cap could act. Clearing it there is correct, not lossy.
    expect(statedUpdate({ preferences: { mode: 'direct' } }, sessionWith(720)).preferences?.maxHeight)
      .toBeUndefined();
    expect(statedUpdate({ preferences: { mode: 'remux' } }, sessionWith(720)).preferences?.maxHeight)
      .toBeUndefined();
  });

  it('lets a cap named in the same request win over the stored one', () => {
    const stated = statedUpdate({ preferences: { mode: 'transcode', maxHeight: 1080 } }, sessionWith(720));
    expect(stated.preferences?.maxHeight).toBe(1080);
  });

  it('ignores the "choose" sentinel, which this client never sends', () => {
    const update = { preferences: { mode: 'choose' as const } };
    expect(statedUpdate(update, sessionWith(720))).toBe(update);
  });
});

describe('buildOrder', () => {
  it('is sequential when shuffle is off', () => {
    expect(buildOrder(4, false, 2)).toEqual([0, 1, 2, 3]);
  });

  it('pins the current item to the front so enabling shuffle interrupts nothing', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(buildOrder(6, true, 3)[0]).toBe(3);
    }
  });

  it('includes every index exactly once, so a shuffled run cannot repeat or skip', () => {
    const order = buildOrder(8, true, 0);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
