import { describe, expect, it } from 'vitest';
import { MachaConnectionError, SessionNotStartedError } from '@machafoundation/core';
import { MediaApi } from './media';
import { OfflineLibrary } from './offlineLibrary';
import { DownloadStore } from '../state/downloads';
import { Connectivity } from '../state/connectivity';

/** A catalogue that only ever fails, which is the whole of what `serve` is classifying. */
function apiFailingWith(error: unknown, connectivity: Connectivity): MediaApi {
  const catalogue = { list: () => Promise.reject(error) };
  return new MediaApi(
    catalogue as unknown as ConstructorParameters<typeof MediaApi>[0],
    new OfflineLibrary(new DownloadStore('test-client')),
    connectivity,
  );
}

describe('MediaApi.serve error classification', () => {
  it('treats a session that has not started as "could not ask", not as an unreachable cluster', async () => {
    // Core 0.12.0 made `SessionNotStartedError` extend `MachaConnectionError`,
    // which is what keeps the offline fallback working for a host that does
    // nothing. Taken alone it would also route this through
    // `reportUnreachable()` — and this error arrives before `start()` on every
    // cold start, so a cluster that is up and answering would be marked offline
    // on every launch. `shouldProbe()` then suppresses real requests for twenty
    // seconds, and the viewer gets their downloads instead of their library.
    const connectivity = new Connectivity();
    const api = apiFailingWith(new SessionNotStartedError('not-started'), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(false);
  });

  it('still records a genuine transport failure as unreachable', async () => {
    // The guard above must not swallow the case it sits in front of: a node
    // that cannot be reached is exactly what `Connectivity` exists to track.
    const connectivity = new Connectivity();
    const api = apiFailingWith(new MachaConnectionError('no route'), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(true);
  });

  it('is only distinguishable by class, which is why the order matters', () => {
    // Pinning the premise rather than trusting the release note: if this ever
    // stops being true, the branch ordering in `serve` is merely redundant
    // rather than load-bearing, and someone should know which.
    expect(new SessionNotStartedError('not-started')).toBeInstanceOf(MachaConnectionError);
  });
});
