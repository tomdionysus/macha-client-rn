import TrackPlayer, { Event } from 'react-native-track-player';
import { audioRemote } from './audioRemote';

/**
 * The background playback service. On Android it is a headless task the
 * platform may start before the app installs its handlers; both paths call
 * `audioRemote`, so a press is never handled twice.
 */
export async function trackPlayerService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => audioRemote().play());
  TrackPlayer.addEventListener(Event.RemotePause, () => audioRemote().pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => audioRemote().stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => audioRemote().next());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => audioRemote().previous());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => audioRemote().seekTo(position * 1000));
}
