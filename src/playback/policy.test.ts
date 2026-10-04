import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audioCopyable, buildOrder, positionedUpdate, sessionAudioCodec, statedUpdate, transformFor } from './policy';
import type { PlaybackSession } from '@machafoundation/core';
import { Platform } from 'react-native';

/** Only the fields the policy reads. */
const sessionWith = (maxHeight: number | null, maxBitrate: number | null = null) =>
  ({ preferences: { maxHeight, maxBitrate } } as unknown as PlaybackSession);

describe('transformFor', () => {
  it('copies both streams for direct and remux, and re-encodes both for transcode', () => {
    expect(transformFor('direct')).toEqual({ mode: 'direct', video: 'copy', audio: 'copy' });
    expect(transformFor('remux')).toEqual({ mode: 'remux', video: 'copy', audio: 'copy' });
    expect(transformFor('transcode')).toEqual({ mode: 'transcode', video: 'transcode', audio: 'transcode' });
  });
});

describe('statedUpdate', () => {
  it('leaves an update that names no mode completely alone', () => {
    const update = { preferences: { maxHeight: 720 } };
    expect(statedUpdate(update, sessionWith(null))).toBe(update);
  });

  it('states the whole transform whenever a mode is named', () => {
    // A bare `mode` would let the node pick `video`/`audio` without knowing
    // what this device can decode.
    const stated = statedUpdate({ preferences: { mode: 'direct' } }, sessionWith(null));
    expect(stated.preferences).toMatchObject({ mode: 'direct', video: 'copy', audio: 'copy' });
  });

  it('keeps a quality cap when the viewer switches to transcode', () => {
    // A PATCH naming mode clears max_height server-side; without restating it,
    // touching Mode gives a full-height transcode.
    const stated = statedUpdate({ preferences: { mode: 'transcode' } }, sessionWith(720, 3_000_000));
    expect(stated.preferences?.maxHeight).toBe(720);
    expect(stated.preferences?.maxBitrate).toBe(3_000_000);
  });

  it('does not restate a cap into direct or remux, where nothing could apply it', () => {
    // Copying passes the encoded stream through, so a height cap cannot apply.
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

/**
 * A change that makes a new generation must say where it starts, or the node
 * starts at `seekMs: 0`. Core's rule: every representation update carries
 * `seekMs`, except subtitle-only ones and unseekable sessions.
 */
describe('positionedUpdate', () => {
  const seekable = (canSeek = true) => ({ options: { canSeek } }) as unknown as PlaybackSession;

  it('tells the node where the viewer is when the mode changes', () => {
    const update = { preferences: { mode: 'remux' as const } };
    expect(positionedUpdate(update, seekable(), 4_090_000).seekMs).toBe(4_090_000);
  });

  it('carries the position on a quality change too, which also regenerates', () => {
    expect(positionedUpdate({ preferences: { maxHeight: 720 } }, seekable(), 60_000).seekMs).toBe(60_000);
  });

  it('leaves a subtitle-only change alone, which does not regenerate', () => {
    const update = { preferences: { subtitleStream: 2 } };
    expect(positionedUpdate(update, seekable(), 60_000)).toBe(update);
  });

  it('does not ask a session that cannot seek to seek', () => {
    const update = { preferences: { mode: 'transcode' as const } };
    expect(positionedUpdate(update, seekable(false), 60_000)).toBe(update);
  });

  it('survives statedUpdate, which rebuilds the request through core', () => {
    // The order `applyUpdate` uses; the restatement must keep `seekMs`.
    const session = { options: { canSeek: true }, preferences: { maxHeight: null, maxBitrate: null } } as unknown as PlaybackSession;
    const sent = statedUpdate(positionedUpdate({ preferences: { mode: 'remux' } }, session, 4_090_000), session);
    expect(sent.seekMs).toBe(4_090_000);
    expect(sent.preferences).toMatchObject({ mode: 'remux', video: 'copy', audio: 'copy' });
  });

  it('keeps a position the caller already stated', () => {
    const update = { seekMs: 5_000, preferences: { maxHeight: 480 } };
    expect(positionedUpdate(update, seekable(), 60_000).seekMs).toBe(5_000);
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

/** Remux must not copy audio this device cannot decode: it would play silent, and the server cannot fMP4-copy (E-)AC-3. */
describe('transformFor when the device cannot decode the source audio', () => {
  it('renames the mode, because the server refuses a remux that re-encodes', () => {
    // The server 400s a remux that re-encodes, and a transcode that re-encodes nothing.
    expect(transformFor('remux', false)).toEqual({
      mode: 'transcode',
      video: 'copy',
      audio: 'transcode',
    });
  });

  it('still copies the video, which this says nothing about', () => {
    // A missing audio decoder is no reason to re-encode the picture.
    expect(transformFor('remux', false).video).toBe('copy');
  });

  it('leaves direct play as the viewer asked for it', () => {
    // Direct serves the original file; there is no transform to adjust.
    expect(transformFor('direct', false)).toEqual({ mode: 'direct', video: 'copy', audio: 'copy' });
  });

  it('changes nothing for transcode, which re-encodes anyway', () => {
    expect(transformFor('transcode', false)).toEqual({
      mode: 'transcode',
      video: 'transcode',
      audio: 'transcode',
    });
  });

  it('copies when the device can decode it', () => {
    expect(transformFor('remux', true)).toEqual({ mode: 'remux', video: 'copy', audio: 'copy' });
  });
});

describe('audioCopyable', () => {
  const decodable = ['aac', 'opus', 'vorbis', 'mp3', 'flac'];

  it('refuses the two codecs the A85 was measured unable to decode', () => {
    expect(audioCopyable('ac3', decodable)).toBe(false);
    expect(audioCopyable('eac3', decodable)).toBe(false);
  });

  it('accepts the codec that was measured working', () => {
    expect(audioCopyable('aac', decodable)).toBe(true);
  });

  it('is case-insensitive, because the wire is not this client’s to spell', () => {
    expect(audioCopyable('AC3', decodable)).toBe(false);
    expect(audioCopyable('AAC', decodable)).toBe(true);
  });

  it('says yes when nothing is known, leaving the node in charge', () => {
    // Unknown is not a refusal; the node's own choice stands.
    expect(audioCopyable(undefined, decodable)).toBe(true);
  });
});

describe('sessionAudioCodec', () => {
  const withStreams = (streams: unknown[], audioStream: number | null = null) =>
    ({ options: { audioStreams: streams }, preferences: { audioStream } }) as unknown as PlaybackSession;

  it('reads the stream the viewer selected', () => {
    const session = withStreams(
      [
        { index: 1, codec: 'ac3', default: true },
        { index: 2, codec: 'aac', default: false },
      ],
      2,
    );
    expect(sessionAudioCodec(session)).toBe('aac');
  });

  it('falls back to the default stream when none is selected', () => {
    const session = withStreams([
      { index: 1, codec: 'aac', default: false },
      { index: 2, codec: 'eac3', default: true },
    ]);
    expect(sessionAudioCodec(session)).toBe('eac3');
  });

  it('is undefined when the node lists no audio streams', () => {
    expect(sessionAudioCodec(withStreams([]))).toBeUndefined();
    expect(sessionAudioCodec(undefined)).toBeUndefined();
  });
});

describe('statedUpdate does not let the pressed mode override the corrected one', () => {
  // The stub's Platform.OS defaults to ios, which claims ac3; android does not.
  const previous = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = previous;
  });

  const ac3Session = () =>
    ({
      preferences: { maxHeight: null, maxBitrate: null, audioStream: null },
      options: { audioStreams: [{ index: 1, codec: 'ac3', default: true }] },
    }) as unknown as PlaybackSession;

  it('sends mode=transcode when Remux is pressed on audio this device cannot decode', () => {
    // Spreading `update.preferences` last would put `remux` back over the
    // corrected `transcode` and get a 400.
    const result = statedUpdate({ preferences: { mode: 'remux' } }, ac3Session());
    expect(result.preferences).toMatchObject({ mode: 'transcode', video: 'copy', audio: 'transcode' });
  });
});
