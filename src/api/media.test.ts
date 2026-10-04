import { describe, expect, it } from 'vitest';
import {
  endpointFailure,
  MachaApiError,
  MachaClusterRouteError,
  MachaConnectionError,
  SessionNotStartedError,
} from '@machafoundation/core';
import { MediaApi } from './media';
import { OfflineLibrary } from './offlineLibrary';
import { DownloadStore } from '../state/downloads';
import { Connectivity } from '../state/connectivity';

/** A catalogue that only ever fails, to exercise `serve`'s classification. */
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
    // It arrives on every cold start; reporting it unreachable would suppress
    // real requests until the next probe.
    const connectivity = new Connectivity();
    const api = apiFailingWith(new SessionNotStartedError('not-started'), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(false);
  });

  it('still records a genuine transport failure as unreachable', async () => {
    const connectivity = new Connectivity();
    const api = apiFailingWith(new MachaConnectionError('no route'), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(true);
  });

  it('is only distinguishable by class, which is why the order matters', () => {
    // If this stops holding, the branch order in `serve` is merely redundant.
    expect(new SessionNotStartedError('not-started')).toBeInstanceOf(MachaConnectionError);
  });
});

/**
 * Errors as core's router throws them: an exhausted walk is a
 * `MachaClusterRouteError` around a `MachaEndpointError` around the original.
 */
describe('MediaApi.serve reads what the router throws', () => {
  const walked = (error: unknown) =>
    new MachaClusterRouteError(['http://a', 'http://b'], true, endpointFailure('http://b', 'http://b', error));

  it('serves downloads when the whole cluster is unreachable, and records it', async () => {
    const connectivity = new Connectivity();
    const api = apiFailingWith(walked(new MachaConnectionError('no route')), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(true);
  });

  it('does not mark the cluster offline for a session that has not started, wrapped by the walk', async () => {
    const connectivity = new Connectivity();
    const api = apiFailingWith(walked(new SessionNotStartedError('not-started')), connectivity);

    await expect(api.movies()).resolves.toEqual([]);
    expect(connectivity.isOffline).toBe(false);
  });

  it('serves downloads to a viewer the cluster refuses, without calling it offline', async () => {
    for (const refusal of [
      new MachaApiError('Macha catalogue request failed: forbidden', 403, 'forbidden'),
      endpointFailure('http://a', 'http://a', new MachaApiError('Macha catalogue request failed: unauthorized', 401)),
    ]) {
      const connectivity = new Connectivity();
      const api = apiFailingWith(refusal, connectivity);

      await expect(api.movies()).resolves.toEqual([]);
      expect(connectivity.isOffline).toBe(false);
    }
  });

  it('still shows a node that answered with a failure', async () => {
    const api = apiFailingWith(new MachaClusterRouteError(['http://a'], false, new MachaApiError('x', 500)), new Connectivity());
    await expect(api.movies()).rejects.toBeInstanceOf(MachaClusterRouteError);
  });
});
