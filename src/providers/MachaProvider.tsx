import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ClusterCatalogueApi } from '../api/catalogue';
import { EndpointRegistry } from '../api/endpoints';
import { MediaApi } from '../api/media';
import { ClusterPlaybackApi } from '../api/playback';
import { ClusterStatusApi } from '../api/status';
import { SessionManager, authFor, type AuthenticatedFetch } from '../api/session';
import {
  getApiToken,
  getClientId,
  getConfiguredEndpoints,
  getDiscoveredEndpoints,
  setApiToken,
  setConfiguredEndpoints,
  setDiscoveredEndpoints,
} from '../state/connection';
import { ContinueWatchingStore } from '../state/continueWatching';
import { DownloadStore } from '../state/downloads';
import { DownloadManager } from '../downloads/DownloadManager';
import { MusicLibraryStore } from '../state/musicLibrary';
import { PlaylistStore } from '../state/playlists';
import { PlaybackQueueStore } from '../state/queue';
import { clientStore } from '../state/storage';

export interface MachaServices {
  registry: EndpointRegistry;
  auth: AuthenticatedFetch;
  media: MediaApi;
  playback: ClusterPlaybackApi;
  status: ClusterStatusApi;
  continueWatching: ContinueWatchingStore;
  queue: PlaybackQueueStore;
  playlists: PlaylistStore;
  musicLibrary: MusicLibraryStore;
  downloads: DownloadStore;
  downloadManager: DownloadManager;
  clientId: string;
}

interface MachaContextValue extends MachaServices {
  /** True once persisted client state has been read; nothing renders before this. */
  hydrated: boolean;
  endpoints: string[];
  apiToken: string;
  /** Replaces the configured bootstrap seeds and restarts the session lifecycle. */
  configure(endpoints: readonly string[], apiToken: string): void;
  /** Bumped whenever services are rebuilt, so screens can re-run their loads. */
  generation: number;
}

const MachaContext = createContext<MachaContextValue | undefined>(undefined);

export function useMacha(): MachaContextValue {
  const value = useContext(MachaContext);
  if (!value) throw new Error('useMacha must be used inside <MachaProvider>.');
  return value;
}

export function MachaProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(clientStore.isHydrated);
  const [endpoints, setEndpoints] = useState<string[]>([]);
  const [apiToken, setToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [generation, setGeneration] = useState(0);

  const registry = useMemo(() => new EndpointRegistry(), []);
  const sessions = useMemo(() => new SessionManager(), []);
  /**
   * One opaque viewer identity for the life of the app process. It rides every
   * playback-session POST so the node can recognise one logical viewer across
   * reloads, seeks, retries and node failover. It is not an account.
   */
  const viewerSession = useMemo(() => Crypto.randomUUID(), []);

  useEffect(() => {
    let cancelled = false;
    void clientStore.hydrate().then(() => {
      if (cancelled) return;
      setClientId(getClientId());
      setEndpoints(getConfiguredEndpoints());
      setToken(getApiToken());
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed the registry with configured endpoints plus whatever this client
  // reached last time, then (re)start the anonymous session lifecycle.
  useEffect(() => {
    if (!hydrated) return;
    registry.replace(endpoints);
    registry.merge(getDiscoveredEndpoints());
    if (endpoints.length > 0) sessions.start(registry);
    else sessions.stop();
    setGeneration((value) => value + 1);
    return () => sessions.stop();
  }, [hydrated, endpoints, apiToken, registry, sessions]);

  const services = useMemo<MachaServices>(() => {
    const auth = authFor(apiToken, sessions);
    const catalogue = new ClusterCatalogueApi(registry, auth);
    const mediaApi = new MediaApi(catalogue);
    const playbackApi = new ClusterPlaybackApi(registry, auth, viewerSession);
    const downloads = new DownloadStore(clientId || 'anonymous');
    return {
      registry,
      auth,
      media: mediaApi,
      playback: playbackApi,
      status: new ClusterStatusApi(registry, auth),
      continueWatching: new ContinueWatchingStore(clientId || 'anonymous'),
      queue: new PlaybackQueueStore(clientId || 'anonymous'),
      playlists: new PlaylistStore(clientId || 'anonymous'),
      musicLibrary: new MusicLibraryStore(clientId || 'anonymous'),
      downloads,
      downloadManager: new DownloadManager(downloads, playbackApi, mediaApi),
      clientId,
    };
    // `generation` deliberately participates: reconfiguring the connection must
    // hand every screen freshly built services rather than stale closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, sessions, apiToken, clientId, viewerSession, generation]);

  const discoveryDone = useRef(false);
  useEffect(() => {
    discoveryDone.current = false;
  }, [generation]);

  /**
   * One best-effort membership refresh per connection generation. The cluster
   * knows which nodes exist and which client-facing API bases they advertise;
   * learning them means a later failover has somewhere to go. Discovered bases
   * are remembered as a startup hint only — never as user configuration.
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0 || discoveryDone.current) return;
    discoveryDone.current = true;
    let cancelled = false;
    void services.status
      .status()
      .then((snapshot) => {
        if (cancelled) return;
        const scheme = endpoints[0]?.startsWith('https://') ? 'https' : 'http';
        const advertised = ClusterStatusApi.advertisedApiBases(snapshot, scheme);
        if (advertised.length === 0) return;
        registry.merge(advertised);
        setDiscoveredEndpoints(
          registry.all.filter((endpoint) => endpoint.source === 'discovered').map((endpoint) => endpoint.baseUrl),
        );
      })
      .catch(() => {
        // A node that cannot describe the cluster is still perfectly able to
        // serve the catalogue. Discovery is an optimisation, never a gate.
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, endpoints, services, registry]);

  const configure = useCallback((nextEndpoints: readonly string[], nextToken: string) => {
    const normalized = setConfiguredEndpoints(nextEndpoints);
    setApiToken(nextToken);
    setDiscoveredEndpoints([]);
    setEndpoints(normalized);
    setToken(nextToken.trim());
  }, []);

  const value = useMemo<MachaContextValue>(
    () => ({ ...services, hydrated, endpoints, apiToken, configure, generation }),
    [services, hydrated, endpoints, apiToken, configure, generation],
  );

  return <MachaContext.Provider value={value}>{children}</MachaContext.Provider>;
}

/**
 * Headers an image or media request must carry to reach a node's own object
 * URLs. Signed capability URLs need none of this; these are for the
 * authenticated fallbacks. The hook re-renders when the session token is
 * replaced, so a view holding a stale header set does not silently start 401ing.
 */
export function useAuthHeaders(): Record<string, string> | undefined {
  const { auth } = useMacha();
  const [token, setToken] = useState(auth.token);

  useEffect(() => {
    setToken(auth.token);
    const manager = auth instanceof SessionManager ? auth : undefined;
    if (!manager) return;
    return manager.subscribe(() => setToken(manager.token));
  }, [auth]);

  return useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);
}
