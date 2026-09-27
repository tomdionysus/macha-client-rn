import {
  progressFor,
  type MediaSummary,
  type PlaybackProgress,
  type PlaybackResumeState,
  type PlaybackSession,
  type QualityClass,
} from '@machafoundation/core';

/**
 * Continue Watching that resumes "as if you'd never left" (Tom, 2026-09-27,
 * via the television): the title, the file, and how it was playing. Core
 * builds this from its coordinator's snapshot; this client drives the
 * resolver directly and has no snapshot, so it builds the same
 * `PlaybackResumeState` from its own session and what it knows the viewer
 * chose. Core's `resumePreferences` reads it back.
 */

/** What this client knows about who chose how the title plays. */
export interface PlaybackChoice {
  /** The viewer picked the mode or a quality; if not, a resume chooses again. */
  chosenByViewer: boolean;
  /** The quality playing, where it is one of the item's steps. */
  quality?: QualityClass;
}

/**
 * How the session is playing, as the node confirmed it: the streams it
 * selected rather than what was asked, since those are what the viewer saw
 * and heard.
 */
export function resumeStateOf(session: PlaybackSession, choice: PlaybackChoice): PlaybackResumeState {
  const preferences = session.preferences;
  // The segment container the node is serving, which for HLS is the one a
  // resume should ask for again; a direct session serves the file's own.
  const served = session.output.container;
  const container = served === 'fmp4' || served === 'mpegts' ? served : undefined;
  return {
    chosenByViewer: choice.chosenByViewer,
    mode: session.mode,
    ...(container ? { container } : {}),
    ...(choice.quality !== undefined ? { quality: choice.quality } : {}),
    maxHeight: preferences.maxHeight,
    audioStream: session.selected.audioStream,
    subtitleStream: session.selected.subtitleStream,
    ...(preferences.audioLanguage ? { audioLanguage: preferences.audioLanguage } : {}),
    ...(preferences.subtitleLanguage ? { subtitleLanguage: preferences.subtitleLanguage } : {}),
  };
}

/**
 * A Continue Watching entry: the item, and where a session is playing, its
 * file and how. Off the disk there is no session, and the entry is the
 * position alone.
 */
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
