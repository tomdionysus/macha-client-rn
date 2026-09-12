import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ClusterCatalogueApi } from '../api/catalogue';
import {
  ClusterEndpointRouter,
  ContinueWatchingStore,
  EndpointHealthMonitor,
  EndpointRegistry,
  PlaybackQueueStore,
  bootstrapEndpoints,
  configureMachaHost,
} from '@macha/core';
import { MediaApi } from '../api/media';
import { ClusterUsersApi, type CurrentSession } from '../api/users';
import { describeAccount, type AccountDisplay } from '../account/marker';
import { ClusterPlaybackApi } from '../api/playback';
import { ClusterStatusRouter } from '../api/status';
import { MachaConnectionError } from '../api/errors';
import { SessionManager, type AuthenticatedFetch, type SessionCredentials } from '../api/session';
import {
  getClientId,
  getConfiguredEndpoints,
  getDiscoveredEndpoints,
  setConfiguredEndpoints,
  setDiscoveredEndpoints,
} from '../state/connection';
import { adoptLegacyContinueWatching } from '../state/continueWatchingMigration';
import { DownloadStore } from '../state/downloads';
import { Connectivity } from '../state/connectivity';
import { OfflineLibrary } from '../api/offlineLibrary';
import { DownloadManager } from '../downloads/DownloadManager';
import { MusicLibraryStore } from '../state/musicLibrary';
import { PlaylistStore } from '@macha/core';

import { clientStore } from '../state/storage';

// Core reaches for storage, a clock and an id generator through its host seam
// rather than a browser global. `ClientStore` already presents the synchronous
// `StorageLike` shape core wants, over an AsyncStorage cache hydrated at
// startup. `ephemeralStorage` is the same store on purpose: the web's choice of
// `sessionStorage` ties an anonymous session to a tab, and a phone has no tab —
// its run is the process, and a session surviving a relaunch is the behaviour
// people expect from an app.
configureMachaHost({
  storage: clientStore,
  ephemeralStorage: clientStore,
  now: Date.now,
  uuid: () => Crypto.randomUUID(),
});

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
}

interface MachaContextValue extends MachaServices {
  account: AccountState;
  /** Re-reads the whoami. Call after anything that changes the session. */
  refreshAccount(): void;
  /** Exchanges credentials for a session belonging to that account. Rejects on a refusal. */
  signIn(credentials: SessionCredentials): Promise<void>;
  /**
   * Revokes this session cluster-wide and takes an anonymous one.
   *
   * Rejects when the revoke could not be delivered — but the local sign-out
   * has still happened by then, because a viewer who has asked to be signed
   * out must not end up still signed in. A rejection means "you are signed out
   * here, and that token is still live elsewhere until it expires".
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

/**
 * Only a backstop. Network changes arrive as events; this catches the case
 * the device cannot see — the node itself going away on a healthy network.
 */
const REACHABILITY_BACKSTOP_MS = 60_000;

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

  const registry = useMemo(() => new EndpointRegistry([]), []);
  const router = useMemo(() => new ClusterEndpointRouter(registry), [registry]);
  const sessions = useMemo(() => new SessionManager(), []);
  // One connectivity fact for the whole app, outliving service rebuilds.
  const connectivity = useMemo(() => new Connectivity(), []);
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
    // `applyAdvertisement` is not a merge: it keeps every non-discovered
    // endpoint and replaces the discovered set wholesale, because discovery is
    // a refreshable view rather than accumulated history. A node that has left
    // the cluster has to disappear, which an accumulating merge cannot express.
    registry.applyAdvertisement(getDiscoveredEndpoints().map((baseUrl) => ({ apiBaseUrls: [baseUrl] })));
    if (endpoints.length > 0) sessions.start(registry);
    else sessions.stop();
    setGeneration((value) => value + 1);
    return () => sessions.stop();
  }, [hydrated, endpoints, registry, router, sessions]);

  const services = useMemo<MachaServices>(() => {
    const auth = sessions;
    const catalogue = new ClusterCatalogueApi(router, auth);
    const playbackApi = new ClusterPlaybackApi(router, auth, viewerSession);
    const downloads = new DownloadStore(clientId || 'anonymous');
    const continueWatching = new ContinueWatchingStore(clientId || 'anonymous');
    // Idempotent: it returns immediately once the store has anything in it, so
    // running again on a later connection generation cannot resurrect history
    // the viewer has since cleared.
    adoptLegacyContinueWatching(continueWatching, clientId || 'anonymous');
    const mediaApi = new MediaApi(catalogue, new OfflineLibrary(downloads), connectivity);
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
      downloadManager: new DownloadManager(downloads, playbackApi, mediaApi),
      connectivity,
      clientId,
    };
    // `generation` deliberately participates: reconfiguring the connection must
    // hand every screen freshly built services rather than stale closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, router, sessions, connectivity, clientId, viewerSession, generation]);

  // Going offline (or coming back) changes what every screen should be
  // showing, so it invalidates loaded data exactly like reconfiguring the
  // connection does. Screens already key their loads on `generation`.
  useEffect(
    () => connectivity.subscribe(() => setGeneration((value) => value + 1)),
    [connectivity],
  );

  /**
   * Cluster membership and endpoint health, on core's loop.
   *
   * This replaces a single best-effort discovery per connection generation.
   * The monitor discovers members, probes every known node, and records the
   * latency and capacity that ranking actually runs on — without it the
   * registry degrades to sticky, then failure count, then configured order,
   * which is to say the endpoint migration buys nothing until this runs.
   *
   * It also gets the scheme right. The old local helper assumed the scheme of
   * the first configured endpoint; core inherits it from the endpoint that
   * answered, and discovers nothing rather than defaulting to `http` when
   * neither an origin nor a scheme-carrying endpoint is available — a silent
   * downgrade to plaintext being the worse failure.
   *
   * Bound to the foreground: a backgrounded phone has no business probing a
   * cluster on a timer. `stop()` is idempotent, so the teardown path is safe
   * to run more than once.
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0) return;
    const monitor = new EndpointHealthMonitor({
      registry,
      clusterStatusApi: services.status,
      auth: sessions,
    });

    // Discovered bases are a startup hint, never user configuration. The
    // registry notifies on every health change, so persist only when the
    // discovered set itself moves rather than on every success and failure.
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
    };
  }, [hydrated, endpoints, registry, services, sessions]);

  /**
   * Reachability, driven by events rather than polling.
   *
   * The device pushes network changes, so losing Wi-Fi or switching on
   * airplane mode is known immediately and for free — no timer, no request.
   *
   * But the device's network is not the question: on the same Wi-Fi with the
   * node powered off, NetInfo happily reports "connected" while Macha is
   * unreachable. So a network event only *triggers* the decision — losing the
   * network means offline outright, while regaining it prompts a cheap
   * catalogue status GET to confirm Macha itself is actually there. The slow
   * timer that remains is only a backstop for the node going away underneath a
   * perfectly healthy network.
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0) return;
    let cancelled = false;

    const confirm = async () => {
      try {
        await services.media.status();
        if (!cancelled) connectivity.reportReachable();
      } catch (error) {
        if (!cancelled && error instanceof MachaConnectionError) connectivity.reportUnreachable();
      }
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (cancelled) return;
      // `isInternetReachable` is deliberately ignored: a LAN with no route to
      // the internet is a perfectly good home for a Macha cluster.
      if (state.isConnected === false) connectivity.reportUnreachable();
      else void confirm();
    });

    void confirm();
    const backstop = setInterval(() => {
      if (AppState.currentState === 'active') void confirm();
    }, REACHABILITY_BACKSTOP_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void confirm();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(backstop);
      appState.remove();
    };
  }, [hydrated, endpoints, services, connectivity]);

  const configure = useCallback((nextEndpoints: readonly string[]) => {
    const normalized = setConfiguredEndpoints(nextEndpoints);
    setDiscoveredEndpoints([]);
    setEndpoints(normalized);
  }, []);

  const [account, setAccount] = useState<AccountState>({ known: false });
  const [accountAttempt, setAccountAttempt] = useState(0);
  const refreshAccount = useCallback(() => setAccountAttempt((value) => value + 1), []);

  /**
   * Who the current token belongs to, re-read whenever that token changes.
   *
   * Subscribing to the session manager rather than reading once at sign-in is
   * the point. Core's manager answers a 401 by re-minting, and a re-mint
   * carries no credentials — so a password or role change downgrades a
   * signed-in viewer to anonymous with nothing announcing it. A marker drawn
   * from a remembered username would go on naming somebody who is no longer
   * signed in; one drawn from the whoami corrects itself on the next token.
   *
   * `known` is carried separately from `session` because a failed read and a
   * session with no user are different answers, and "the cluster did not say"
   * must never be rendered as "nobody is signed in".
   */
  useEffect(() => {
    if (!hydrated || endpoints.length === 0) {
      // Only when there is something to clear: a fresh object every run would
      // make this effect its own trigger.
      setAccount((current) => (current.known || current.session ? { known: false } : current));
      return;
    }
    const controller = new AbortController();
    const read = () => {
      services.users.currentSession(controller.signal).then(
        (session) => {
          if (!controller.signal.aborted) setAccount({ session, known: true });
        },
        () => {
          // A node too old to answer and a node that cannot be reached mean
          // the same thing here: identity is unknown and nothing may be
          // claimed on the strength of it.
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

  const signIn = useCallback(
    async (credentials: SessionCredentials) => {
      await sessions.signIn(credentials);
      refreshAccount();
    },
    [refreshAccount, sessions],
  );

  const signOut = useCallback(async () => {
    // Revoke first, because after the token is dropped there is nothing left
    // to revoke with: dropping a token locally is not a logout, and the
    // session stays valid on every node until it expires.
    let revocation: unknown;
    try {
      await services.users.logout();
    } catch (error) {
      revocation = error;
    }
    await sessions.signOut();
    refreshAccount();
    if (revocation) throw revocation;
  }, [refreshAccount, services, sessions]);

  const value = useMemo<MachaContextValue>(
    () => ({ ...services, hydrated, endpoints, configure, generation, account, refreshAccount, signIn, signOut }),
    [services, hydrated, endpoints, configure, generation, account, refreshAccount, signIn, signOut],
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
  const [authorization, setAuthorization] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    // `authorization()` waits for a mint already in flight rather than
    // answering undefined during one, so a view mounted on a cold start gets
    // the header once it exists instead of loading its images unauthenticated
    // and 401ing with nothing to retry.
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

  // Core returns the whole header value, not the bare token: a token in a query
  // string ends up in access logs and `Referer`.
  return useMemo(() => (authorization ? { Authorization: authorization } : undefined), [authorization]);
}

/**
 * The account marker's view of the session: what to draw, and who it is.
 *
 * `display` is the four-state reading — unknown, unstated, anonymous or
 * signed in — because only two of those are things to render.
 */
export function useAccount(): { display: AccountDisplay; session?: CurrentSession; known: boolean; refresh(): void } {
  const { account, refreshAccount } = useMacha();
  const display = useMemo(() => describeAccount(account), [account]);
  return { display, session: account.session, known: account.known, refresh: refreshAccount };
}

/** Subscribes to the app-wide reachability state. */
export function useConnectivity(): { offline: boolean } {
  const { connectivity } = useMacha();
  const [offline, setOffline] = useState(connectivity.isOffline);
  useEffect(() => connectivity.subscribe(() => setOffline(connectivity.isOffline)), [connectivity]);
  return { offline };
}
