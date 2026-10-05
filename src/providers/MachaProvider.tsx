import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { connectionKindOf, setConnectionKind } from '../playback/quality';
import { ClusterCatalogueApi } from '../api/catalogue';
import {
  ClusterEndpointRouter,
  ContinueWatchingStore,
  EndpointBandwidth,
  EndpointHealthMonitor,
  EndpointRegistry,
  PlaybackQueueStore,
  bootstrapEndpoints,
  configureMachaHost,
  subscribeConnectionState,
  type SessionIdentityChange,
} from '@machafoundation/core';
import { MediaApi } from '../api/media';
import { ClusterUsersApi, type CurrentSession } from '../api/users';
import { describeAccount, type AccountDisplay } from '../account/marker';
import { describeMediaAccess, mayRequestMedia, type MediaAccess } from '../account/access';
import { describeProblems, type Problem } from '../state/problems';
import { ClusterPlaybackApi } from '../api/playback';
import { ClusterStatusRouter } from '../api/status';
import { SessionManager, type AuthenticatedFetch, type SessionCredentials } from '../api/session';
import {
  getClientId,
  getConfiguredEndpoints,
  getDiscoveredEndpoints,
  recoverClientId,
  setConfiguredEndpoints,
  setDiscoveredEndpoints,
} from '../state/connection';
import { adoptLegacyContinueWatching } from '../state/continueWatchingMigration';
import { DownloadStore } from '../state/downloads';
import { Connectivity } from '../state/connectivity';
import { OfflineLibrary } from '../api/offlineLibrary';
import { DownloadManager } from '../downloads/DownloadManager';
import { MusicLibraryStore } from '../state/musicLibrary';
import { PlaylistStore } from '@machafoundation/core';

import { clientStore } from '../state/storage';
import { secureStorage } from '../state/secureStorage';
import { reclaimOrphans, SessionLedger } from '../playback/sessionLedger';

// Core's host seam. `clientStore` is a synchronous `StorageLike` over an
// AsyncStorage cache hydrated at startup.
configureMachaHost({
  storage: clientStore,
  // Session token lives here, not in plaintext `storage`.
  secureStorage,
  now: Date.now,
  uuid: () => Crypto.randomUUID(),
});

// Plaintext session tokens under these keys are deleted, not migrated: a copy
// would be one more path handling the secret, and the cost is one login.
clientStore.removeItem('macha.session.v1');
clientStore.removeItem('macha-session');

// Module-scoped: playback services are rebuilt per connection generation, and
// the ledger's once-only orphan snapshot must outlive them.
const sessionLedger = new SessionLedger(clientStore);

export interface MachaServices {
  registry: EndpointRegistry;
  auth: AuthenticatedFetch;
  media: MediaApi;
  playback: ClusterPlaybackApi;
  status: ClusterStatusRouter;
  continueWatching: ContinueWatchingStore;
  queue: PlaybackQueueStore;
  playlists: PlaylistStore;
  musicLibrary: MusicLibraryStore;
  users: ClusterUsersApi;
  downloads: DownloadStore;
  downloadManager: DownloadManager;
  connectivity: Connectivity;
  clientId: string;
}

/** Who the current token belongs to, and whether the cluster actually said. */
export interface AccountState {
  session?: CurrentSession;
  known: boolean;
  /** Core's `lastIdentityChange` at the same read, so a named account replaced by an anonymous session can be told. */
  identityChange?: SessionIdentityChange;
}

interface MachaContextValue extends MachaServices {
  account: AccountState;
  /** Whether the cluster will serve media to us. Only `denied` may gate anything; see `account/access.ts`. */
  access: MediaAccess;
  /** Root causes standing between this device and the cluster's media; empty when nothing is wrong. */
  problems: Problem[];
  /** Re-reads the whoami. Call after anything that changes the session. */
  refreshAccount(): void;
  /** Exchanges credentials for a session belonging to that account. Rejects on a refusal. */
  signIn(credentials: SessionCredentials): Promise<void>;
  /**
   * Revokes this session cluster-wide and takes an anonymous one. The local
   * sign-out always happens; a rejection means the revoke was not delivered and
   * the token stays live elsewhere until it expires.
   */
  signOut(): Promise<void>;
  /** True once persisted client state has been read; nothing renders before this. */
  hydrated: boolean;
  endpoints: string[];
  /** Replaces the configured bootstrap seeds and restarts the session lifecycle. */
  configure(endpoints: readonly string[]): void;
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
  const [clientId, setClientId] = useState('');
  const [generation, setGeneration] = useState(0);

  /**
   * The endpoint registry with a throughput store attached; without one,
   * `recordTransferByUrl` is a silent no-op. (Core's `createMachaServices` does
   * this, but this client builds its services by hand.)
   *
   * The client id is a function resolved at write time and gated on
   * `isHydrated`: `getClientId()` mints when the key looks absent, so calling it
   * before hydration would mint a fresh identity every launch. Core's
   * `restore()` waits until the id is defined.
   */
  const registry = useMemo(() => {
    const created = new EndpointRegistry([]);
    created.attachBandwidth(
      new EndpointBandwidth(() => (clientStore.isHydrated ? getClientId() : undefined)),
    );
    return created;
  }, []);
  const router = useMemo(() => new ClusterEndpointRouter(registry), [registry]);
  // A ref, so learning our access does not rebuild every service.
  const accessRef = useRef<MediaAccess>({ kind: 'unknown' });
  const [networkDown, setNetworkDown] = useState(false);
  // Kept so a returning radio can force a health cycle at once.
  const monitorRef = useRef<EndpointHealthMonitor | undefined>(undefined);
  const sessions = useMemo(() => new SessionManager(), []);
  // App-wide, outliving service rebuilds.
  const connectivity = useMemo(() => new Connectivity(), []);
  /** Sessions a previous process left open, waiting for a seeded registry. */
  const orphansRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void clientStore.hydrate().then(() => {
      if (cancelled) return;
      // Before any session can exist, so none of this process's are included.
      // A remount in the same process gets none.
      orphansRef.current = sessionLedger.takeOrphans();
      recoverClientId();
      setClientId(getClientId());
      setEndpoints(getConfiguredEndpoints());
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
    registry.replace(bootstrapEndpoints(endpoints, 'bootstrap'));
    // Replaces the discovered set wholesale (keeping others), so a node that
    // left the cluster disappears.
    registry.applyAdvertisement(getDiscoveredEndpoints().map((baseUrl) => ({ apiBaseUrls: [baseUrl] })));
    if (endpoints.length > 0) sessions.start(registry);
    else sessions.stop();
    setGeneration((value) => value + 1);
    return () => sessions.stop();
  }, [hydrated, endpoints, registry, router, sessions]);

  const services = useMemo<MachaServices>(() => {
    const auth = sessions;
    const catalogue = new ClusterCatalogueApi(router, auth);
    const playbackApi = new ClusterPlaybackApi(router, auth, sessionLedger);
    const downloads = new DownloadStore(clientId || 'anonymous');
    const continueWatching = new ContinueWatchingStore(clientId || 'anonymous');
    // No-op once the store has anything, so it cannot resurrect cleared history.
    adoptLegacyContinueWatching(continueWatching, clientId || 'anonymous');
    const mediaApi = new MediaApi(catalogue, new OfflineLibrary(downloads), connectivity, () =>
      mayRequestMedia(accessRef.current),
    );
    return {
      registry,
      auth,
      media: mediaApi,
      playback: playbackApi,
      status: new ClusterStatusRouter(router, auth),
      continueWatching,
      queue: new PlaybackQueueStore(clientId || 'anonymous'),
      playlists: new PlaylistStore(clientId || 'anonymous'),
      musicLibrary: new MusicLibraryStore(clientId || 'anonymous'),
      users: new ClusterUsersApi(router, auth),
      downloads,
      downloadManager: new DownloadManager(downloads, playbackApi, mediaApi, registry),
      connectivity,
      clientId,
    };
    // `generation` is deliberate: reconfiguring must hand screens fresh services.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, router, sessions, connectivity, clientId, generation]);

  // Close sessions a killed process left open, once the registry is seeded (core
  // finds each session's node from its id, so the node must be registered).
  // Otherwise each holds a transcode slot for thirty minutes.
  useEffect(() => {
    if (generation === 0 || orphansRef.current.length === 0) return;
    const orphans = orphansRef.current;
    orphansRef.current = [];
    console.log('[macha] [playback] orphan-sessions-reclaim', { count: orphans.length });
    void reclaimOrphans(orphans, sessionLedger, (sessionId) => services.playback.stopById(sessionId));
  }, [generation, services]);

  // Going offline or back invalidates every screen's loads, like reconfiguring.
  useEffect(
    () => connectivity.subscribe(() => setGeneration((value) => value + 1)),
    [connectivity],
  );

  /**
   * Core's health monitor: discovers members and records the latency and
   * capacity that endpoint ranking runs on. Foreground only.
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0) return;
    const monitor = new EndpointHealthMonitor({
      registry,
      clusterStatusApi: services.status,
      auth: sessions,
    });
    monitorRef.current = monitor;

    // Discovered bases are persisted as a startup hint, only when the set changes
    // (the registry notifies on every health change).
    let lastPersisted = '';
    const persist = registry.subscribe(() => {
      const discovered = registry
        .snapshot()
        .map(({ endpoint }) => endpoint)
        .filter((endpoint) => endpoint.source === 'discovered')
        .map((endpoint) => endpoint.baseUrl);
      const key = discovered.join('\n');
      if (key === lastPersisted) return;
      lastPersisted = key;
      setDiscoveredEndpoints(discovered);
    });

    const apply = (state: AppStateStatus) => {
      if (state === 'active') monitor.start();
      else monitor.stop();
    };
    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);

    return () => {
      subscription.remove();
      persist();
      monitor.stop();
      if (monitorRef.current === monitor) monitorRef.current = undefined;
    };
  }, [hydrated, endpoints, registry, services, sessions]);

  /**
   * Reachability is core's verdict, mirrored rather than re-decided. (Probing
   * `/api/v1/status` instead would need `view_status`.)
   */
  useEffect(
    () =>
      subscribeConnectionState((event) => {
        if (event.type === 'reachable') connectivity.reportReachable();
        else connectivity.reportUnreachable();
      }),
    [connectivity],
  );

  /**
   * The device's radio, which core cannot see. Not a reachability verdict: it
   * lets the problem list report "no network" at once, and re-probes the moment
   * the radio returns. `isInternetReachable` is ignored because a LAN without
   * internet is a fine home for a cluster.
   */
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        // Mobile data has its own ceiling on automatic play; see `playback/quality.ts`.
        setConnectionKind(connectionKindOf(state.type));
        const down = state.isConnected === false;
        setNetworkDown(down);
        if (down) return;
        // `probeNow` joins a running cycle and leaves a backgrounded monitor stopped,
        // which `stop()`/`start()` would not.
        void monitorRef.current?.probeNow().catch(() => undefined);
      }),
    [],
  );

  const configure = useCallback((nextEndpoints: readonly string[]) => {
    const normalized = setConfiguredEndpoints(nextEndpoints);
    setDiscoveredEndpoints([]);
    setEndpoints(normalized);
  }, []);

  const [account, setAccount] = useState<AccountState>({ known: false });
  const [accountAttempt, setAccountAttempt] = useState(0);
  const refreshAccount = useCallback(() => setAccountAttempt((value) => value + 1), []);

  /**
   * Who the current token belongs to, re-read on every token change: core
   * answers a 401 by re-minting anonymously, so a signed-in viewer can be
   * downgraded silently. `known` is separate because "the cluster did not say"
   * must never render as "nobody is signed in".
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0) {
      // Keep the same object when already clear, or this effect retriggers itself.
      setAccount((current) => (current.known || current.session ? { known: false } : current));
      return;
    }
    const controller = new AbortController();
    const read = () => {
      services.users.currentSession(controller.signal).then(
        (session) => {
          if (!controller.signal.aborted) setAccount({ session, known: true, identityChange: sessions.lastIdentityChange });
        },
        () => {
          // Too old to answer or unreachable: identity is unknown.
          if (!controller.signal.aborted) setAccount({ known: false });
        },
      );
    };
    read();
    const unsubscribe = sessions.subscribe(read);
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [hydrated, endpoints, services, sessions, accountAttempt]);

  /**
   * The session lifecycle as three separate facts. `settled` is core's
   * `isReady` (minted or gave up); before it nothing else is evidence, since a
   * request after a failed mint goes out tokenless and its 401 looks like a
   * refusal. Only `mintRefused` means a node said no.
   */
  const [sessionFacts, setSessionFacts] = useState({ settled: false, hasToken: false, mintRefused: false });

  useEffect(() => {
    if (!hydrated || endpoints.length === 0) {
      setSessionFacts((current) =>
        current.settled || current.hasToken || current.mintRefused
          ? { settled: false, hasToken: false, mintRefused: false }
          : current,
      );
      return;
    }
    let cancelled = false;
    const read = () => {
      // `authorization()` waits on an in-flight mint, so this does not race it.
      void sessions.authorization().then((authorization) => {
        if (cancelled) return;
        const settled = sessions.isReady;
        const hasToken = authorization !== undefined;
        // Only `refused` may offer a login; `unreachable` is the away-from-home
        // case and must stay quiet and serve downloads. Core clears it on success.
        const mintRefused = sessions.lastMintFailure?.reason === 'refused';
        setSessionFacts((current) =>
          current.settled === settled && current.hasToken === hasToken && current.mintRefused === mintRefused
            ? current
            : { settled, hasToken, mintRefused },
        );
      });
    };
    read();
    const unsubscribe = sessions.subscribe(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hydrated, endpoints, sessions, generation]);

  const access = useMemo(
    () => describeMediaAccess({ ...sessionFacts, session: account.session, known: account.known }),
    [sessionFacts, account],
  );
  accessRef.current = access;

  const [clusterUnreachable, setClusterUnreachable] = useState(connectivity.isOffline);
  useEffect(
    () => connectivity.subscribe(() => setClusterUnreachable(connectivity.isOffline)),
    [connectivity],
  );

  const problems = useMemo(
    () =>
      describeProblems({
        endpointsConfigured: endpoints.length > 0,
        networkDown,
        // Otherwise a restatement of `networkDown`.
        clusterUnreachable: clusterUnreachable && !networkDown,
        access,
      }),
    [endpoints, networkDown, clusterUnreachable, access],
  );

  /**
   * A change of access kind re-runs every screen's load. Access is learned after
   * the first (optimistic) load, so a refused viewer's failed load would
   * otherwise stick even though `MediaApi` could now serve the local library.
   */
  const lastAccessKind = useRef(access.kind);
  useEffect(() => {
    if (lastAccessKind.current === access.kind) return;
    lastAccessKind.current = access.kind;
    setGeneration((value) => value + 1);
  }, [access.kind]);

  const signIn = useCallback(
    async (credentials: SessionCredentials) => {
      await sessions.signIn(credentials);
      refreshAccount();
    },
    [refreshAccount, sessions],
  );

  const signOut = useCallback(async () => {
    // Core forgets the token locally, then revokes it, throwing if that fails.
    // Do not also call `users.logout()`.
    try {
      await sessions.signOut();
    } finally {
      refreshAccount();
    }
  }, [refreshAccount, sessions]);

  const value = useMemo<MachaContextValue>(
    () => ({ ...services, hydrated, endpoints, configure, generation, account, access, problems, refreshAccount, signIn, signOut }),
    [services, hydrated, endpoints, configure, generation, account, access, problems, refreshAccount, signIn, signOut],
  );

  return <MachaContext.Provider value={value}>{children}</MachaContext.Provider>;
}

/**
 * Auth headers for image or media requests to a node's own object URLs (signed
 * capability URLs need none). Re-renders when the token is replaced.
 */
export function useAuthHeaders(): Record<string, string> | undefined {
  const { auth } = useMacha();
  const [authorization, setAuthorization] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    // Waits on an in-flight mint, so a cold-start view does not load unauthenticated.
    const refresh = () => {
      void auth.authorization().then((value) => {
        if (!cancelled) setAuthorization(value);
      });
    };
    refresh();
    const manager = auth instanceof SessionManager ? auth : undefined;
    const unsubscribe = manager?.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [auth]);

  // Core returns the whole header value. Never put the token in a query string.
  return useMemo(() => (authorization ? { Authorization: authorization } : undefined), [authorization]);
}

/** The account marker's view of the session; `display` is the four-state reading. */
export function useAccount(): { display: AccountDisplay; session?: CurrentSession; known: boolean; refresh(): void } {
  const { account, refreshAccount } = useMacha();
  const display = useMemo(() => describeAccount(account), [account]);
  return { display, session: account.session, known: account.known, refresh: refreshAccount };
}

/** Whether the cluster will serve media, and why not. `unknown` is not a refusal; never block on it. */
export function useMediaAccess(): MediaAccess {
  return useMacha().access;
}

/** Everything standing between this device and the cluster's media: the one list every view reads. */
export function useProblems(): Problem[] {
  return useMacha().problems;
}

/** Subscribes to the app-wide reachability state. */
export function useConnectivity(): { offline: boolean } {
  const { connectivity } = useMacha();
  const [offline, setOffline] = useState(connectivity.isOffline);
  useEffect(() => connectivity.subscribe(() => setOffline(connectivity.isOffline)), [connectivity]);
  return { offline };
}
