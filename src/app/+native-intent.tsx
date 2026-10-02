/**
 * Rewrites incoming system links before the router sees them.
 *
 * react-native-track-player does not hand the app a plain launcher intent. It
 * sets ACTION_VIEW with its own URLs:
 *
 *   trackplayer://notification.click   the user tapped the now-playing notification
 *   trackplayer://service-bound        the service woke the app itself
 *
 * Neither matches a route. Left to the router, tapping the notification would
 * show "page not found" and the service waking the app would push a dead route
 * over whatever is on screen, so they are handled here, before they enter the
 * navigation state.
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }): string | null {
  if (!path) return path;

  // Tapping the notification means "show me what is playing".
  if (path.includes('notification.click')) return '/play';

  // The service binding is internal bookkeeping, not a destination. Returning
  // null leaves the current screen exactly where it was.
  if (path.includes('service-bound')) return null;

  // Anything else from a scheme we do not own is not ours to navigate to.
  if (path.startsWith('trackplayer://')) return null;

  return path;
}
