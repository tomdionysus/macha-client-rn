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

/**
 * The player options, kept as a value because they must be applied more than
 * once. react-native-track-player only pushes the notification controller's
 * available commands when that controller already exists
 * (`mediaNotificationControllerInfo != null`), and at setup time it does not —
 * no notification has been created yet. The result is a notification whose
 * buttons are drawn but dispatch nothing. Re-applying once playback has
 * actually started is what makes them live.
 */
/** Long enough for the media notification controller to have connected. */
const NOTIFICATION_CONTROLLER_SETTLE_MS = 1_500;

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
         * Deliberately no transport buttons.
         *
         * The notification's own buttons do not work in this version of
         * react-native-track-player: a press never reaches JS at all — proven
         * by instrumenting the handlers, where a media key fires RemotePause
         * and a notification press fires nothing. Rather than draw controls
         * that silently do nothing, the notification is informational —
         * artwork, title and artist — and the transport lives on the media
         * keys, headset and Bluetooth, which do work, and in the app itself.
         *
         * Only SeekTo is declared: it renders no button, but keeps the
         * position visible so the system panel can show progress. Buttons come
         * from PLAY/PAUSE (COMMAND_PLAY_PAUSE), STOP, and the SKIP_TO_*
         * custom layout, so leaving all of those out is what removes them.
         *
         * `capabilities` above stays complete. It governs the session for
         * non-notification controllers, which is how the media keys keep
         * working.
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
  // The notification's controller connects a moment after playback starts, and
  // the library only pushes restricted commands at a controller that already
  // exists. Applied once at setup it is too early and the controller keeps
  // Media3's defaults — which is why transport buttons reappeared. Re-applying
  // immediately and again shortly after covers both orderings.
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
