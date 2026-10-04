/**
 * Turns a finished download into a throughput sample for core's
 * `EndpointBandwidth`, which wants body-transfer time only: timed from first to
 * last progress callback, excluding session setup. Kept apart from
 * `DownloadManager` so it is testable without `expo-file-system`.
 */

/** Progress callbacks, reduced to what the sample needs. */
export interface TransferObservation {
  /** When bytes first moved, not when the download was requested. */
  firstAt: number;
  firstBytes: number;
  lastAt: number;
  lastBytes: number;
  /** The longest silence between two consecutive progress callbacks. */
  longestGapMs: number;
}

/**
 * A callback silence longer than this voids the sample: callbacks pause while
 * the app is backgrounded (bytes still arrive), and stalls are not throughput
 * either. Generous, since no sample is better than a wrong one.
 */
export const MAX_PROGRESS_GAP_MS = 10_000;

/** The sample to hand core, or undefined. No byte floor here: core's `record()` applies its own. */
export function throughputSample(observation: TransferObservation): { bytes: number; durationMs: number } | undefined {
  const { firstAt, firstBytes, lastAt, lastBytes, longestGapMs } = observation;
  if (longestGapMs > MAX_PROGRESS_GAP_MS) return undefined;

  const durationMs = lastAt - firstAt;
  const bytes = lastBytes - firstBytes;
  if (!Number.isFinite(durationMs) || !Number.isFinite(bytes)) return undefined;
  if (durationMs <= 0 || bytes <= 0) return undefined;

  return { bytes, durationMs };
}
