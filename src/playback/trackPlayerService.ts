import TrackPlayer, { Event } from 'react-native-track-player';
import { audioRemote } from './audioRemote';

/**
 * The background playback service.
 *
 * On Android this is a headless task the platform starts only when it decides
 * to, which is not while the app is alive and holding a media foreground
 * service, so handlers registered only here would have no listener during
 * normal use. The playback runtime installs the real handlers on mount; this
 * covers the task starting before it has. `audioRemote` is the single
 * implementation either way, so a press is never handled twice.
 */
export async function trackPlayerService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => audioRemote().play());
  TrackPlayer.addEventListener(Event.RemotePause, () => audioRemote().pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => audioRemote().stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => audioRemote().next());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => audioRemote().previous());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => audioRemote().seekTo(position * 1000));
}
