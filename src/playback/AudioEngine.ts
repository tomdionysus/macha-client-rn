import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode as TrackRepeatMode,
  TrackType,
  type UpdateOptions,
} from 'react-native-track-player';

export interface AudioTrackInfo {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  /** Absolute URL or `file://` path; the notification loads it itself. */
  artwork?: string;
  durationMs?: number;
  /**
   * True when the URL is an HLS playlist rather than a media file.
   *
   * This is not optional detail: without it the native player treats the
   * `.m3u8` as progressive audio, fails to parse it and reports a source
   * error. Remux and transcode sessions are always HLS; Direct Play and
   * downloaded originals are plain files.
   */
  hls?: boolean;
}

let setupPromise: Promise<void> | undefined;

/** Long enough for the media notification controller to have connected. */
const NOTIFICATION_CONTROLLER_SETTLE_MS = 1_500;

/**
 * Kept as a value because it must be applied more than once: see
 * `loadAudioTrack`.
 */
const PLAYER_OPTIONS: UpdateOptions = {
        android: {
          // Dismissing the notification, or swiping the app away, ends
          // playback outright rather than leaving a silent zombie service.
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // Leave the foreground promptly once paused, so the notification
          // becomes dismissible instead of lingering as a dead transport.
          stopForegroundGracePeriod: 5,
        },
        // Skip is advertised even though the native queue holds a single track:
        // the buttons must exist so the notification can drive our own queue,
        // which is where shuffle, repeat and per-track session negotiation live.
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        /**
         * Deliberately no transport buttons. A press on the notification's own
         * buttons never reaches JS in this version of
         * react-native-track-player, so the notification is informational and
         * the transport lives on the media keys, headset, Bluetooth and the app.
         *
         * SeekTo renders no button but keeps progress visible. Buttons come
         * from PLAY/PAUSE, STOP and the SKIP_TO_* custom layout, so leaving
         * those out removes them. `capabilities` above stays complete because
         * it governs the session for other controllers, such as media keys.
         */
        notificationCapabilities: [Capability.SeekTo],
        progressUpdateEventInterval: 1,
        // The Macha crimson, so the notification is tinted like the app.
        color: 0x2c0008,
      };

/**
 * Prepares the native audio player exactly once.
 *
 * `setupPlayer` throws if it is already initialised, so the promise is cached
 * rather than guarded by a boolean — two concurrent callers must await the same
 * setup, not race two of them.
 */
export function ensureAudioEngine(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      await TrackPlayer.updateOptions(PLAYER_OPTIONS);
      // Repeat and advance are decided by the app runtime, so the native player
      // must never loop or skip on its own.
      await TrackPlayer.setRepeatMode(TrackRepeatMode.Off);
    })().catch((error) => {
      // A failed setup must not be cached as success, or every later play
      // silently no-ops against a player that was never initialised.
      setupPromise = undefined;
      throw error;
    });
  }
  return setupPromise;
}

/** Replaces the single native track. The app queue lives in JS, not here. */
export async function loadAudioTrack(track: AudioTrackInfo, startAtMs = 0): Promise<void> {
  await ensureAudioEngine();
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: track.id,
    url: track.url,
    type: track.hls ? TrackType.HLS : TrackType.Default,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    duration: track.durationMs ? track.durationMs / 1000 : undefined,
  });
  if (startAtMs > 0) await TrackPlayer.seekTo(startAtMs / 1000);
  await TrackPlayer.play();
  // The notification's controller connects a moment after playback starts,
  // and the library only pushes restricted commands to a controller that
  // already exists; applied only at setup, the controller keeps Media3's
  // default buttons. Re-applying now and again shortly after covers both
  // orderings.
  await TrackPlayer.updateOptions(PLAYER_OPTIONS).catch(() => undefined);
  setTimeout(() => {
    void TrackPlayer.updateOptions(PLAYER_OPTIONS).catch(() => undefined);
  }, NOTIFICATION_CONTROLLER_SETTLE_MS);
}

export async function stopAudio(): Promise<void> {
  if (!setupPromise) return;
  try {
    await TrackPlayer.reset();
  } catch {
    // Resetting a player that was never set up, or has already gone away, is
    // not a failure the viewer needs to hear about.
  }
}

export { TrackPlayer };
