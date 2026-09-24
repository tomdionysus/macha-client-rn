import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
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
import { PlaylistStore } from '@machafoundation/core';

import { clientStore } from '../state/storage';
import { reclaimOrphans, SessionLedger } from '../playback/sessionLedger';

// Core reaches for storage, a clock and an id generator through its host seam
// rather than a browser global. `ClientStore` already presents the synchronous
// `StorageLike` shape core wants, over an AsyncStorage cache hydrated at startup.
//
// `ephemeralStorage` used to be listed here as the same store, deliberately: the
// web's `sessionStorage` ties a session to a tab, and a phone has no tab. Core
// 0.10.0 removed that seam entirely — there is one session, it is always worth
// keeping, and it lives in `secureStorage ?? storage`. Dropping the line changes
// nothing here, because the fallback is this same store.
//
// **`secureStorage` is not supplied yet and should be.** Without it the bearer
// sits in AsyncStorage in plain text, readable on a rooted device or in a
// backup; `expo-secure-store` is the fix and is not yet a dependency.
configureMachaHost({
  storage: clientStore,
  now: Date.now,
  uuid: () => Crypto.randomUUID(),
});

// One per process, deliberately module-scoped: the playback services are
// rebuilt on every connection generation, and the ledger's once-only orphan
// snapshot has to outlive them. See `sessionLedger.ts`.
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
  /**
   * Core's `lastIdentityChange` as of the same read, so a named account
   * replaced by an anonymous session can be told so (`sessionEndedNotice`).
   */
  identityChange?: SessionIdentityChange;
}

interface MachaContextValue extends MachaServices {
  account: AccountState;
  /**
   * Whether the cluster will serve media to whoever we are — three answers, not
   * two. Only `denied` may gate anything; see `src/account/access.ts`.
   */
  access: MediaAccess;
  /**
   * Everything standing between this device and the cluster's media, root
   * causes only. Empty when nothing is wrong.
   */
  problems: Problem[];
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
   * The endpoint registry, with somewhere to keep measured throughput.
   *
   * Core `0.12.0` took throughput off the constructor: `createMachaServices`
   * attaches the store for hosts that use it. This client builds its services
   * by hand, so it attaches its own — and it must, because
   * `recordTransferByUrl` is a **silent no-op when nothing is attached**. A
   * hand-building host that skips this looks correctly wired and ranks on
   * whatever core's own JSON reads happen to see.
   *
   * The id is a function on purpose. Core resolves it when the store *writes*,
   * not when it is constructed, so it can be attached here — during the first
   * render, before `clientStore` has hydrated — without inventing anything.
   * `getClientId()` mints when the key is absent, and an unhydrated cache is
   * indistinguishable from an absent key, so calling it early would mint a
   * fresh identity on every launch and orphan the previous record. Gating on
   * `isHydrated` is what makes that impossible; core's `restore()` does not
   * latch while the id is undefined, so persistence simply begins once there
   * is one.
   */
  const registry = useMemo(() => {
    const created = new EndpointRegistry([]);
    created.attachBandwidth(
      new EndpointBandwidth(() => (clientStore.isHydrated ? getClientId() : undefined)),
    );
    return created;
  }, []);
  const router = useMemo(() => new ClusterEndpointRouter(registry), [registry]);
  // Read by MediaApi through a ref, so learning our access does not rebuild
  // every service and bump `generation` under every mounted screen.
  const accessRef = useRef<MediaAccess>({ kind: 'unknown' });
  const [networkDown, setNetworkDown] = useState(false);
  // Core's health loop, kept so a returning radio can force a cycle at once.
  const monitorRef = useRef<EndpointHealthMonitor | undefined>(undefined);
  const sessions = useMemo(() => new SessionManager(), []);
  // One connectivity fact for the whole app, outliving service rebuilds.
  const connectivity = useMemo(() => new Connectivity(), []);
  /** Sessions a previous process left open, waiting for a seeded registry. */
  const orphansRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void clientStore.hydrate().then(() => {
      if (cancelled) return;
      // Before any endpoint exists to create a session on, so nothing this
      // process holds can be in it. A remount in the same process gets none.
      orphansRef.current = sessionLedger.takeOrphans();
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
    const playbackApi = new ClusterPlaybackApi(router, auth, sessionLedger);
    const downloads = new DownloadStore(clientId || 'anonymous');
    const continueWatching = new ContinueWatchingStore(clientId || 'anonymous');
    // Idempotent: it returns immediately once the store has anything in it, so
    // running again on a later connection generation cannot resurrect history
    // the viewer has since cleared.
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
    // `generation` deliberately participates: reconfiguring the connection must
    // hand every screen freshly built services rather than stale closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, router, sessions, connectivity, clientId, generation]);

  // Close what a killed process left open, once, as soon as the registry is
  // seeded: core recovers each session's node from its id, and a node that is
  // not in the registry cannot be asked. Every `install -r` and every swipe-away
  // leaves one, holding a transcode slot for thirty minutes otherwise.
  useEffect(() => {
    if (generation === 0 || orphansRef.current.length === 0) return;
    const orphans = orphansRef.current;
    orphansRef.current = [];
    console.log('[macha] [playback] orphan-sessions-reclaim', { count: orphans.length });
    void reclaimOrphans(orphans, sessionLedger, (sessionId) => services.playback.stopById(sessionId));
  }, [generation, services]);

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
    monitorRef.current = monitor;

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
      if (monitorRef.current === monitor) monitorRef.current = undefined;
    };
  }, [hydrated, endpoints, registry, services, sessions]);

  /**
   * Reachability is core's answer, mirrored here rather than re-decided.
   *
   * This was a 60s timer calling `media.status()` and publishing its own
   * verdict. Two things ended that. It asked `/api/v1/status`, which server
   * 0.38.5 now gates behind a `view_status` role — so it would have begun
   * answering 403 and reporting a perfectly healthy cluster as unreachable,
   * which is the precise failure this client exists to avoid. And core's health
   * loop already answers the same question every `ENDPOINT_HEALTH_INTERVAL_MS`
   * (10s), from a liveness route needing no session and no role, so the timer
   * was a slower second opinion on a settled question.
   *
   * Four bugs in this project have been two independently chosen timeouts
   * colliding. `Connectivity` is now a mirror of core's transitions rather than
   * an independent judge, so there is one authority on whether the cluster can
   * be reached.
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
   * The device's own radio, which core has no way to see.
   *
   * Deliberately **not** a reachability verdict — core owns that. This records
   * the device fact, so the problem list can say "this device has no network"
   * the instant it happens instead of waiting for a probe to fail, and nudges
   * core's health loop to re-probe the moment the radio returns rather than
   * waiting out its interval.
   *
   * `isInternetReachable` stays ignored on purpose: a LAN with no route to the
   * internet is a perfectly good home for a Macha cluster.
   */
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const down = state.isConnected === false;
        setNetworkDown(down);
        if (down) return;
        // A cycle now instead of on the next tick. `probeNow` awaits one already
        // running rather than aborting it, and leaves a monitor stopped for the
        // background stopped — the `stop()`/`start()` this replaced restarted
        // polling whenever the radio came back with the app in the background.
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
          if (!controller.signal.aborted) setAccount({ session, known: true, identityChange: sessions.lastIdentityChange });
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

  /**
   * The session lifecycle as three facts, kept apart on purpose.
   *
   * `settled` is core's `isReady`: the manager has minted or given up trying.
   * Before it, nothing below is evidence, and since core `0.12.0` "early"
   * fails in two different ways. Before `start()` or after `stop()`, `fetch`
   * throws `SessionNotStartedError` rather than sending anything. Once started,
   * a request made after a *failed* mint still goes out with no token, is
   * answered 401 and is returned unretried — core only re-mints and retries
   * when it actually sent a token — which reads exactly like being refused.
   * `mintRefused` is the only one of the three that means a node said no.
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
      // `authorization()` waits on a mint already in flight rather than
      // answering undefined during one, so this resolves after the lifecycle
      // has actually decided instead of racing it.
      void sessions.authorization().then((authorization) => {
        if (cancelled) return;
        const settled = sessions.isReady;
        const hasToken = authorization !== undefined;
        // Core states *why* a mint failed rather than leaving each client to
        // infer it from a status code — `refused` is a node that answered and
        // said no, `unreachable` is nothing answering at all. Only the first
        // may offer a login; the second is the away-from-home case and must
        // stay quiet and serve the downloads. Core clears this on a successful
        // adopt, so holding a token already means no refusal stands.
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
        // Only when the device believes it has a network: otherwise this is a
        // restatement of `networkDown`, and `describeProblems` drops it anyway.
        clusterUnreachable: clusterUnreachable && !networkDown,
        access,
      }),
    [endpoints, networkDown, clusterUnreachable, access],
  );

  /**
   * A change of access has to re-run every screen's load.
   *
   * Screens read through `generation`, and access is learned *after* the first
   * load has already gone out — optimistically, because `unknown` must not
   * behave as a refusal. So the first catalogue call is made before we know we
   * are refused, fails, and the screen renders that failure. Without this the
   * error is permanent: `MediaApi` would serve the device's own library
   * perfectly well on the next read, and nothing ever asks it for one.
   *
   * Keyed on the kind rather than the object, and guarded on an actual
   * transition, so a re-render cannot turn this into its own trigger.
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
    () => ({ ...services, hydrated, endpoints, configure, generation, account, access, problems, refreshAccount, signIn, signOut }),
    [services, hydrated, endpoints, configure, generation, account, access, problems, refreshAccount, signIn, signOut],
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

/**
 * Whether the cluster will serve media, and why not when it will not.
 *
 * `unknown` is not a refusal. A screen that blocks on it will block on every
 * cold start against a slow cluster, which is the whole reason this is not a
 * boolean.
 */
export function useMediaAccess(): MediaAccess {
  return useMacha().access;
}

/**
 * Everything currently standing between this device and the cluster's media.
 *
 * One list, read by the header warning, by the popover that explains it, and by
 * any view deciding whether cluster-served media is worth offering — so those
 * three can never disagree about whether something is wrong.
 */
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
