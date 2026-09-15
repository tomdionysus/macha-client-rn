/**
 * What a finished download is willing to say about the link it came down.
 *
 * Core's `EndpointBandwidth` measures bytes per second of *body transfer*, and
 * is explicit that the duration must cover reading the body rather than the
 * round trip that preceded it. A download here is preceded by a playback
 * session POST and a cluster walk, so timing from the call site would fold node
 * admission into a number that is supposed to describe a pipe. Timing between
 * the first and last progress callback measures the transfer and nothing else.
 *
 * This is separated from `DownloadManager` because the decision is the part
 * worth testing and the manager needs `expo-file-system` to exist. Same reason
 * `playback/policy.ts` left the provider.
 */

/** Progress callbacks as they arrived, reduced to the four facts that matter. */
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
 * A silence longer than this means the transfer was not actually running.
 *
 * Downloads use a `BACKGROUND` session, so the bytes keep arriving when the app
 * leaves the foreground but the progress callbacks stop until it returns. Wall
 * clock across that window would describe the user's attention rather than the
 * link, and a node that served a download perfectly would be recorded as slow.
 * The same silence covers a stalled or throttled transfer, which is equally not
 * a measurement of throughput.
 *
 * Generous on purpose: on a LAN these callbacks fire constantly, so ten seconds
 * of nothing is already far outside normal. A slow link that genuinely reports
 * this sparsely loses its sample, which is the right way to be wrong — core
 * ranks on no evidence rather than on a wrong number.
 */
export const MAX_PROGRESS_GAP_MS = 10_000;

/**
 * The sample to hand core, or undefined when this transfer proves nothing.
 *
 * The byte floor is deliberately *not* applied here. Core's `record()` already
 * discards anything under 32KB as round-trip noise, and a second copy of that
 * threshold here is a mirror that would drift.
 */
export function throughputSample(observation: TransferObservation): { bytes: number; durationMs: number } | undefined {
  const { firstAt, firstBytes, lastAt, lastBytes, longestGapMs } = observation;
  if (longestGapMs > MAX_PROGRESS_GAP_MS) return undefined;

  const durationMs = lastAt - firstAt;
  const bytes = lastBytes - firstBytes;
  if (!Number.isFinite(durationMs) || !Number.isFinite(bytes)) return undefined;
  if (durationMs <= 0 || bytes <= 0) return undefined;

  return { bytes, durationMs };
}
