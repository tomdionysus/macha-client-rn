import {
  progressFor,
  type MediaSummary,
  type PlaybackMode,
  type PlaybackInstructionReport,
  type PlaybackProgress,
  type PlaybackSession,
  type QualityClass,
} from '@machafoundation/core';

/** What this client knows about who chose how the title plays. */
export interface PlaybackChoice {
  /** The viewer picked the mode or a quality; if not, a resume chooses again. */
  chosenByViewer: boolean;
  /** The quality playing, where it is one of the item's steps. */
  quality?: QualityClass;
  /**
   * The mode the viewer picked, if any. Not the session's: a Remux with
   * undecodable audio runs as transcode, and resuming that would re-encode video.
   */
  mode?: PlaybackMode;
}

/** Whether a title belongs in Continue Watching: films and episodes only; music resumes from its queue. */
export function belongsInContinueWatching(media: Pick<MediaSummary, 'kind'> | undefined): boolean {
  return media?.kind === 'movie' || media?.kind === 'episode';
}

/**
 * A Continue Watching entry through core's `progressFor`: the item, plus its file
 * and resume state when a session is playing (none off the disk). Core reads the
 * mode, quality and who chose them from an instruction report; this client has
 * no coordinator to make one, so it supplies those fields and nothing else.
 */
export function progressOf(
  media: MediaSummary,
  positionMs: number,
  durationMs: number,
  session: PlaybackSession | undefined,
  choice: PlaybackChoice,
): PlaybackProgress {
  if (!session) return progressFor(media, positionMs, durationMs);
  const instruction: PlaybackInstructionReport = {
    mode: (choice.chosenByViewer ? choice.mode : undefined) ?? session.mode,
    chosenByViewer: choice.chosenByViewer,
    ...(choice.quality !== undefined ? { quality: choice.quality } : {}),
    reasons: [],
    assumed: [],
    withoutFacts: false,
  };
  return progressFor(media, positionMs, durationMs, { session, instruction });
}
