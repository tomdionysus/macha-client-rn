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
   * True when the URL is an HLS playlist. Required: the native player otherwise
   * parses the `.m3u8` as progressive audio and fails. Remux and transcode are
   * always HLS; Direct Play and downloads are plain files.
   */
  hls?: boolean;
}

let setupPromise: Promise<void> | undefined;

/** Long enough for the media notification controller to have connected. */
const NOTIFICATION_CONTROLLER_SETTLE_MS = 1_500;

/** Applied at setup and again on each load; see `loadAudioTrack`. */
const PLAYER_OPTIONS: UpdateOptions = {
        android: {
          // Dismissing the notification or swiping the app away stops playback,
          // rather than leaving a silent zombie service.
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // Leave the foreground promptly once paused so the notification is dismissible.
          stopForegroundGracePeriod: 5,
        },
        // Skip is advertised though the native queue holds one track, so external
        // controls can drive the JS queue (shuffle, repeat, per-track sessions).
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        /**
         * No notification transport buttons: react-native-track-player does not
         * deliver their presses to JS. SeekTo shows progress without a button.
         * `capabilities` above stays complete for media keys and other controllers.
         */
        notificationCapabilities: [Capability.SeekTo],
        progressUpdateEventInterval: 1,
        // Macha crimson.
        color: 0x2c0008,
      };

/**
 * Prepares the native audio player exactly once. The promise is cached, not a
 * boolean, because `setupPlayer` throws if called twice and concurrent callers
 * must share one setup.
 */
export function ensureAudioEngine(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      await TrackPlayer.updateOptions(PLAYER_OPTIONS);
      // The JS runtime decides repeat and advance; the native player must not.
      await TrackPlayer.setRepeatMode(TrackRepeatMode.Off);
    })().catch((error) => {
      // Do not cache a failed setup, or every later play no-ops.
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
  // The notification controller connects shortly after playback starts, and
  // options only reach a connected controller (else Media3's default buttons
  // remain). Re-apply now and after a delay to cover both orderings.
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
    // Resetting a player never set up, or already gone, is not worth reporting.
  }
}

export { TrackPlayer };
