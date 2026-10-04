/**
 * Rewrites react-native-track-player's ACTION_VIEW links before the router sees
 * them: `trackplayer://notification.click` (notification tapped) and
 * `trackplayer://service-bound` (service woke the app) match no route.
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }): string | null {
  if (!path) return path;

  if (path.includes('notification.click')) return '/play';

  // Internal bookkeeping, not a destination: null leaves the current screen as is.
  if (path.includes('service-bound')) return null;

  // Any other track-player link is not ours to navigate to.
  if (path.startsWith('trackplayer://')) return null;

  return path;
}
