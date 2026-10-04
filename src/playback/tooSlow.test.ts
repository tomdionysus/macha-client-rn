import { describe, expect, it } from 'vitest';
import type { PlaybackSession, VersionStep } from '@machafoundation/core';
import type { PlaybackChoice } from './resume';
import { qualitySteppedDownText, tooSlowToPlay, tooSlowToPlayText, type EarlyStalls } from './tooSlow';

const transcoding = { mode: 'transcode', mediaId: 'uhd', preferences: { maxHeight: null } } as unknown as PlaybackSession;
const step = (quality: VersionStep['quality'], mediaId: string) => ({ quality, mediaId, source: 'file' }) as VersionStep;
const steps = [step(2160, 'uhd'), step(1080, 'fhd'), step(720, 'hd')];
const automatic: PlaybackChoice = { chosenByViewer: false, quality: 2160 };
const picked: PlaybackChoice = { chosenByViewer: true, quality: 2160 };

/** Two failures in a row, each before the generation played 15 s. */
function twice(choice: PlaybackChoice, played = [2_000, 2_000]) {
  const first = tooSlowToPlay({ count: 0 }, transcoding, played[0], choice, steps);
  return { first, second: tooSlowToPlay(first.stalls, transcoding, played[1], choice, steps) };
}

describe('a quality no node produces at real speed (The Martian at 0:02)', () => {
  it('fails over the first early failure as before', () => {
    expect(twice(automatic).first.verdict).toEqual({ kind: 'keeps-up' });
  });

  it('steps Play down to the next lower quality when the replacement fails the same way', () => {
    expect(twice(automatic).second.verdict).toEqual({ kind: 'step-down', step: steps[1] });
  });

  it("stops a quality the viewer chose, rather than choosing for them", () => {
    expect(twice(picked).second.verdict).toEqual({ kind: 'stop' });
  });

  it('stops where Play has nothing lower to step down to', () => {
    const lowest: PlaybackChoice = { chosenByViewer: false, quality: 720 };
    expect(twice(lowest).second.verdict).toEqual({ kind: 'stop' });
  });

  it('counts afresh once a generation has played 15 s: that node kept up', () => {
    expect(twice(automatic, [2_000, 15_000]).second.verdict).toEqual({ kind: 'keeps-up' });
    const { second } = twice(automatic, [15_000, 2_000]);
    expect(second.verdict).toEqual({ kind: 'keeps-up' });
  });

  it('never counts Direct, where a failure is the network, or a source that never started', () => {
    const direct = { ...transcoding, mode: 'direct' } as PlaybackSession;
    const stalls: EarlyStalls = { key: 'uhd|direct|', count: 1 };
    expect(tooSlowToPlay(stalls, direct, 1_000, automatic, steps).verdict).toEqual({ kind: 'keeps-up' });
    expect(tooSlowToPlay({ key: 'uhd|transcode|', count: 1 }, transcoding, undefined, automatic, steps).verdict).toEqual({ kind: 'keeps-up' });
  });

  it('counts a different file, mode or cap afresh', () => {
    const first = tooSlowToPlay({ count: 0 }, transcoding, 2_000, automatic, steps);
    const capped = { ...transcoding, preferences: { maxHeight: 1080 } } as unknown as PlaybackSession;
    expect(tooSlowToPlay(first.stalls, capped, 2_000, automatic, steps).verdict).toEqual({ kind: 'keeps-up' });
  });
});

// Worded as the web client's.
describe('saying so', () => {
  it('names the quality and the streams being converted', () => {
    expect(tooSlowToPlayText(2160, { video: 'transcode', audio: 'transcode' }))
      .toBe("Macha can't play 4K because the server can't convert its video and audio fast enough to keep up.");
    expect(tooSlowToPlayText(2160, { video: 'transcode', audio: 'copy' }))
      .toBe("Macha can't play 4K because the server can't convert its video fast enough to keep up.");
    expect(tooSlowToPlayText()).toBe("Macha can't play this quality because the server can't convert it fast enough to keep up.");
  });

  it('says where Play stepped down to', () => {
    expect(qualitySteppedDownText(1080)).toBe("Switched to 1080p: the server can't convert a higher quality fast enough.");
    expect(qualitySteppedDownText()).toBe("Switched to a lower quality: the server can't convert a higher quality fast enough.");
  });
});
