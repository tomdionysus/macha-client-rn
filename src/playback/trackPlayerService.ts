import TrackPlayer, { Event } from 'react-native-track-player';
import { audioRemote } from './audioRemote';

/**
 * The background playback service.
 *
 * react-native-track-player requires a registered service, but on Android it
 * is an Android headless task that is only started when the platform decides
 * to — which is *not* while the app is alive and holding a media foreground
 * service. Registering the transport handlers only here meant the
 * notification's buttons had no listener at all during normal use.
 *
 * So the handlers live in the playback runtime, which is alive for exactly as
 * long as the JS context is, and this registers them only for the case where
 * the task is started without that runtime having mounted. `audioRemote` is
 * the single implementation either way, and the runtime replaces these as soon
 * as it mounts, so a button can never be handled twice.
 */
export async function trackPlayerService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => audioRemote().play());
  TrackPlayer.addEventListener(Event.RemotePause, () => audioRemote().pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => audioRemote().stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => audioRemote().next());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => audioRemote().previous());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => audioRemote().seekTo(position * 1000));
}
