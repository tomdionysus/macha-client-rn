import type { PlaybackStartProgress } from '@machafoundation/core';

/**
 * What a start or a change is doing while the node prepares it (server
 * 0.69.0 `start=async`), worded as the web words it: `startProgressText`,
 * `startWaitNotice` and `preparingStreamText`, word for word (web `e543e0e`),
 * so every client says it alike.
 */

/** How long a start may take before the viewer is told about it: a quick start is not announced. */
export const START_WAIT_NOTICE_MS = 5_000;

/** A whole percentage of `done` over `total`, when the node measured both. */
function measuredPercent(done: number | undefined, total: number | undefined): number | undefined {
  if (done === undefined || total === undefined || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.floor(done / total * 100)));
}

/**
 * The stage, and how far through it when the node measured that. Never an
 * estimate: a counter the node did not report shows no figure at all.
 *
 * `node` names where the work is happening. A change names it throughout,
 * because the viewer is watching one stream while another is built; a start
 * names it only while planning. `standalone` marks an open stage with an
 * ellipsis, for a line with nothing after it.
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
 * The note under the spinner while a title has not started yet: what is
 * being waited for, and for how long, once it has taken longer than a quick
 * start. A node that reports its progress says which stage it is in, and
 * `stage` is that sentence, replacing the general one.
 *
 * Only a start. A rebuffer mid-film has the picture behind it to say what is
 * going on, and a timer over that would turn every brief hesitation into an
 * announcement.
 */
export function startWaitNotice(starting: boolean, elapsedMs: number, stage?: string): string | undefined {
  if (!starting || elapsedMs < START_WAIT_NOTICE_MS) return undefined;
  return `${stage ?? 'Waiting for the node to start the stream'} — ${Math.floor(elapsedMs / 1_000)}s`;
}

/**
 * The line while a new stream is prepared behind the one playing.
 *
 * A change (a seek, a mode or quality switch) is built on the node already
 * serving, so that node is named. A failover, and this client's regenerate
 * of a reaped session, arrive as a *start*, on a node this line cannot name:
 * the one it holds is the one being replaced. So a start is worded as a new
 * stream with no node, and a node that reports no progress keeps the plain
 * sentence.
 */
export function preparingStreamText(progress: PlaybackStartProgress | undefined, node: string | undefined): string {
  const stage = progress && startProgressText({ ...progress, kind: 'change' }, progress.kind === 'change' ? node : undefined, true);
  if (stage) return stage;
  return node ? `Preparing new stream on ${node}…` : 'Preparing new stream…';
}
