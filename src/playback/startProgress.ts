import type { PlaybackStartProgress } from '@machafoundation/core';

/**
 * Viewer text for a start or change the node is preparing (`start=async`),
 * worded as the web client's so every client agrees.
 */

/** How long a start may take before the viewer is told about it. */
export const START_WAIT_NOTICE_MS = 5_000;

/** A whole percentage of `done` over `total`, when the node measured both. */
function measuredPercent(done: number | undefined, total: number | undefined): number | undefined {
  if (done === undefined || total === undefined || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.floor(done / total * 100)));
}

/**
 * The stage, and how far through it when the node measured that; never an
 * estimate. `node` is named throughout a change (one stream plays while
 * another builds) but only while planning on a start. `standalone` adds an
 * ellipsis for a line with nothing after it.
 */
export function startProgressText(progress: PlaybackStartProgress, node?: string, standalone = false): string | undefined {
  const on = node ? ` on ${node}` : '';
  const change = progress.kind === 'change';
  const words = progress.stage === 'planning' ? `${change ? 'Preparing new stream' : 'Preparing the stream'}${on}`
    : progress.stage === 'preroll' ? `Finding the start point${change ? on : ''}`
      : progress.stage === 'encoding' ? (change ? `Starting the new stream${on}` : 'Starting the stream')
        : undefined;
  if (!words) return undefined;
  const percent = progress.stage === 'preroll' ? measuredPercent(progress.prerollDecodedMs, progress.prerollTotalMs)
    : progress.stage === 'encoding' ? measuredPercent(progress.outputMediaMs, progress.firstFragmentMs)
      : undefined;
  if (percent !== undefined) return `${words}: ${percent}%`;
  return standalone ? `${words}…` : words;
}

/**
 * The note under the spinner once a start takes longer than
 * `START_WAIT_NOTICE_MS`; `stage` replaces the generic sentence when the node
 * reports progress. Starts only: a mid-film rebuffer has the picture behind it.
 */
export function startWaitNotice(starting: boolean, elapsedMs: number, stage?: string): string | undefined {
  if (!starting || elapsedMs < START_WAIT_NOTICE_MS) return undefined;
  return `${stage ?? 'Waiting for the node to start the stream'} (${Math.floor(elapsedMs / 1_000)}s)`;
}

/**
 * The line while a new stream is prepared behind the one playing. A change is
 * built on the serving node, so it is named; a failover or regenerate arrives
 * as a start on a node this cannot name, so it is worded without one.
 */
export function preparingStreamText(progress: PlaybackStartProgress | undefined, node: string | undefined): string {
  const stage = progress && startProgressText({ ...progress, kind: 'change' }, progress.kind === 'change' ? node : undefined, true);
  if (stage) return stage;
  return node ? `Preparing new stream on ${node}…` : 'Preparing new stream…';
}
