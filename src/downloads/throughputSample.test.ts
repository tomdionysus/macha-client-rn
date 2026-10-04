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
    expect(throughputSample(transfer())).toEqual({ bytes: 40_000_000, durationMs: 4_000 });
  });

  it('discards a transfer that went quiet, because the app was probably backgrounded', () => {
    expect(throughputSample(transfer({ longestGapMs: MAX_PROGRESS_GAP_MS + 1 }))).toBeUndefined();
  });

  it('keeps a transfer that paused for less than the limit', () => {
    expect(throughputSample(transfer({ longestGapMs: MAX_PROGRESS_GAP_MS }))).toBeDefined();
  });

  it('refuses a transfer with no measurable duration', () => {
    expect(throughputSample(transfer({ lastAt: 1_000 }))).toBeUndefined();
  });

  it('refuses a transfer that moved no bytes between the two observations', () => {
    expect(throughputSample(transfer({ lastBytes: 0 }))).toBeUndefined();
  });

  it('subtracts what had already arrived by the first callback', () => {
    // The first callback need not land at zero bytes.
    expect(throughputSample(transfer({ firstBytes: 10_000_000 }))).toEqual({
      bytes: 30_000_000,
      durationMs: 4_000,
    });
  });
});
