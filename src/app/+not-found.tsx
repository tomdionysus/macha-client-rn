import { Redirect } from 'expo-router';
import React from 'react';
import { usePlayback } from '../providers/PlaybackProvider';

/**
 * Where unmatched links land.
 *
 * The notification's tap target is not a plain launcher intent: the media
 * library sets its data to `trackplayer://notification.click` with
 * ACTION_VIEW, so the router receives it as a deep link, matches nothing, and
 * would otherwise show a "page not found" screen — from tapping your own
 * now-playing notification.
 *
 * Tapping a now-playing notification means "show me what is playing", so that
 * is where it goes. Anything else unmatched falls back to Home, which is the
 * right answer for a phone app with no addressable web surface.
 */
export default function NotFound() {
  const { status } = usePlayback();
  return <Redirect href={status === 'idle' ? '/' : '/play'} />;
}
