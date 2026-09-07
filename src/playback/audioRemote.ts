/**
 * The seam between the background playback service and the app's playback
 * runtime.
 *
 * react-native-track-player's service is registered before React exists and
 * must keep working while the app is backgrounded, so it cannot reach into a
 * provider. It calls through this module-level handler instead; the runtime
 * installs its own implementation on mount.
 *
 * Skip is the reason this exists: the notification's next/previous buttons must
 * run *our* queue logic — shuffle order, repeat, and negotiating a fresh Macha
 * session per track — not the native player's own single-item queue.
 */
export interface AudioRemoteHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seekTo(positionMs: number): void;
}

const noop = () => undefined;

let handlers: AudioRemoteHandlers = {
  play: noop,
  pause: noop,
  stop: noop,
  next: noop,
  previous: noop,
  seekTo: noop,
};

export function setAudioRemoteHandlers(next: Partial<AudioRemoteHandlers>): void {
  handlers = { ...handlers, ...next };
}

export function audioRemote(): AudioRemoteHandlers {
  return handlers;
}
