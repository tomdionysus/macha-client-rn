import {
  progressFor,
  type MediaSummary,
  type PlaybackMode,
  type PlaybackProgress,
  type PlaybackResumeState,
  type PlaybackSession,
  type QualityClass,
} from '@machafoundation/core';

/**
 * Continue Watching that resumes the title, file and way it was playing. Core
 * builds this from its coordinator; this client has none, so it builds the same
 * `PlaybackResumeState` itself. Core's `resumePreferences` reads it back.
 */

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

/** How the session is playing, using the streams the node selected rather than those requested. */
export function resumeStateOf(session: PlaybackSession, choice: PlaybackChoice): PlaybackResumeState {
  const preferences = session.preferences;
  // The HLS segment container to ask for again; direct serves the file's own.
  const served = session.output.container;
  const container = served === 'fmp4' || served === 'mpegts' ? served : undefined;
  return {
    chosenByViewer: choice.chosenByViewer,
    mode: (choice.chosenByViewer ? choice.mode : undefined) ?? session.mode,
    ...(container ? { container } : {}),
    ...(choice.quality !== undefined ? { quality: choice.quality } : {}),
    maxHeight: preferences.maxHeight,
    audioStream: session.selected.audioStream,
    subtitleStream: session.selected.subtitleStream,
    ...(preferences.audioLanguage ? { audioLanguage: preferences.audioLanguage } : {}),
    ...(preferences.subtitleLanguage ? { subtitleLanguage: preferences.subtitleLanguage } : {}),
  };
}

/** Whether a title belongs in Continue Watching: films and episodes only; music resumes from its queue. */
export function belongsInContinueWatching(media: Pick<MediaSummary, 'kind'> | undefined): boolean {
  return media?.kind === 'movie' || media?.kind === 'episode';
}

/** A Continue Watching entry: the item, plus its file and resume state when a session is playing (none off the disk). */
export function progressOf(
  media: MediaSummary,
  positionMs: number,
  durationMs: number,
  session: PlaybackSession | undefined,
  choice: PlaybackChoice,
): PlaybackProgress {
  const progress = progressFor(media, positionMs, durationMs);
  if (!session) return progress;
  return {
    ...progress,
    ...(session.mediaId ? { fileMediaId: session.mediaId } : {}),
    resume: resumeStateOf(session, choice),
  };
}
