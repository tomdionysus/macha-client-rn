import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audioCopyable, buildOrder, positionedUpdate, sessionAudioCodec, statedUpdate, transformFor } from './policy';
import type { PlaybackSession } from '@machafoundation/core';
import { Platform } from 'react-native';

/** Only the fields the policy reads. The rest of a session is irrelevant here. */
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

/**
 * A change that makes a new generation has to say where it starts.
 *
 * **Seen on the A85 2026-09-23 23:42:** *2001* at 1:08:10, Direct, the viewer
 * picks Remux; the PATCH carried `{ mode, video, audio }` and no position, the
 * node began the remux at `seekMs: 0`, and the film restarted from the
 * overture. The same `seekMs: 0` came back from the 18:31 Remux on *Dark*.
 * `applyUpdate` restored the position only when the target was Direct.
 *
 * Core's coordinator has the rule this client, standing in for it, never
 * carried: every representation update is sent with `seekMs` at the current
 * position, except a subtitle-only one or a session that cannot seek.
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
    // The order `applyUpdate` uses. If the restatement dropped `seekMs` the
    // fix above would change nothing on the wire.
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

/**
 * The remux request that asked for audio this device cannot decode.
 *
 * Measured 2026-09-21: switching an AC-3 title to Remux sent
 * `{mode: remux, video: copy, audio: copy}`, and the A85 has no AC-3 decoder.
 * Served perfectly that is a silent film — the same defect as the `ac3`/`eac3`
 * capability claim, one layer up. Served by this cluster it hung, because
 * copying (E-)AC-3 into fMP4 never produces a first fragment. **The second is
 * the server's; the first was ours and is what these cover.**
 *
 * Before the fix `transformFor` took no second argument and always answered
 * `copy`, so every assertion below that expects `transcode` fails.
 */
describe('transformFor when the device cannot decode the source audio', () => {
  it('renames the mode, because the server refuses a remux that re-encodes', () => {
    // playback.cpp:524 rejects mode=remux with any re-encoded stream, and :529
    // rejects mode=transcode that re-encodes nothing. Correcting the transform
    // without the name buys a 400 instead of the stall — the web client
    // shipped exactly that halfway fix and had it refused.
    expect(transformFor('remux', false)).toEqual({
      mode: 'transcode',
      video: 'copy',
      audio: 'transcode',
    });
  });

  it('still copies the video, which this says nothing about', () => {
    // A missing audio decoder is no reason to re-encode the picture, and doing
    // so would turn a cheap rewrap into the most expensive operation there is.
    expect(transformFor('remux', false).video).toBe('copy');
  });

  it('leaves direct play as the viewer asked for it', () => {
    // Direct means "serve the original file": there is no transform to adjust,
    // and silence is then the honest consequence of an explicit choice. The
    // automatic path no longer picks it for these titles anyway.
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
    // Absence of a fact is not a fact. The node picks correctly on create;
    // this exists to stop the client overriding that with a worse answer.
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
  // The stub's Platform.OS defaults to ios, where ac3 is claimed deliberately
  // and correctly — so this has to say android, which is where the decoder is
  // missing. Getting that wrong made this test fail against working code.
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
    // The spread-order trap: `{...stated, ...update.preferences}` would put the
    // viewer's `remux` back over the corrected `transcode` and buy a 400.
    const result = statedUpdate({ preferences: { mode: 'remux' } }, ac3Session());
    expect(result.preferences).toMatchObject({ mode: 'transcode', video: 'copy', audio: 'transcode' });
  });
});
