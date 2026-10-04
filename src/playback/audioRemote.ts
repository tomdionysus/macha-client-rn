/**
 * The seam between the background playback service and the app's playback
 * runtime. The service is registered before React exists and runs while
 * backgrounded, so it calls through these module-level handlers, which the
 * runtime installs on mount. Remote next/previous must drive the JS queue
 * (shuffle, repeat, a fresh session per track), not the native single-item queue.
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
