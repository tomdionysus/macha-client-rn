import { describe, expect, it } from 'vitest';
import { MAX_PROGRESS_GAP_MS, throughputSample } from './throughputSample';

const transfer = (overrides: Partial<Parameters<typeof throughputSample>[0]> = {}) => ({
  firstAt: 1_000,
  firstBytes: 0,
  lastAt: 5_000,
  lastBytes: 40_000_000,
  longestGapMs: 400,
  ...overrides,
});

describe('throughputSample', () => {
  it('measures the body transfer, not the time since the download was asked for', () => {
    // 40MB across the four seconds bytes were actually moving. Whatever the
    // session POST and cluster walk cost before that is not this link's fault
    // and must not be folded into a number describing the pipe.
    expect(throughputSample(transfer())).toEqual({ bytes: 40_000_000, durationMs: 4_000 });
  });

  it('discards a transfer that went quiet, because the app was probably backgrounded', () => {
    // Downloads run on a BACKGROUND session: the bytes keep arriving with the
    // app away but the progress callbacks stop, so wall clock would measure the
    // user's attention. A node that served this perfectly would be recorded as
    // slow and then demoted for it.
    expect(throughputSample(transfer({ longestGapMs: MAX_PROGRESS_GAP_MS + 1 }))).toBeUndefined();
  });

  it('keeps a transfer that paused for less than the limit', () => {
    expect(throughputSample(transfer({ longestGapMs: MAX_PROGRESS_GAP_MS }))).toBeDefined();
  });

  it('refuses a transfer with no measurable duration', () => {
    // Everything arriving inside one callback tick says nothing about rate.
    expect(throughputSample(transfer({ lastAt: 1_000 }))).toBeUndefined();
  });

  it('refuses a transfer that moved no bytes between the two observations', () => {
    expect(throughputSample(transfer({ lastBytes: 0 }))).toBeUndefined();
  });

  it('subtracts what had already arrived by the first callback', () => {
    // The first callback is not guaranteed to land at zero. Counting from zero
    // while timing from the first callback would overstate the rate.
    expect(throughputSample(transfer({ firstBytes: 10_000_000 }))).toEqual({
      bytes: 30_000_000,
      durationMs: 4_000,
    });
  });
});
