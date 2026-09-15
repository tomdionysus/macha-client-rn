// Anonymous-session lifecycle is core's.
//
// This was a near-verbatim copy, down to the comment on `fixedBearerToken`.
// Core's is also strictly more capable: it caches the minted session, revalidates
// a cached token on start rather than assuming it, and chunks the wait to a
// distant expiry so a long-lived session does not overflow `setTimeout`'s
// 32-bit delay and fire immediately.
//
// The local `AuthenticatedFetch` carried a `token` getter for callers building
// their own URLs. Nothing outside this module ever read it, and core's
// `authorization()` covers the case properly, so it is gone rather than ported.
//
// There is no manual-token override any more. `authFor` used to pick
// `fixedBearerToken` over the session manager when the viewer had typed a token
// into Settings; the field is gone from every Macha client, so the manager is
// now the only authority and callers use it directly. Core still exports
// `fixedBearerToken` for whoever removes it there once every client is clear.
//
// `signIn` and `signOut` live on the manager too: signing in mints a new token
// with credentials rather than upgrading the one in hand, and signing out
// drops the token and immediately mints a fresh anonymous one, so the client
// is never left holding no session at all.
// `mintAnonymousSession` and `AnonymousSession` were re-exported here and are
// gone from core 0.10.0, renamed to `mintSession` / `Session`. Nothing in this
// client referenced either: the one caller was a probe that classified a failed
// mint by asking a node directly, which was removed the day it was written as a
// polyfill of core's own lifecycle. They are dropped rather than renamed,
// because re-exporting a name nobody imports is how a surface grows.
export {
  NO_AUTH,
  SessionAuthError,
  SessionManager,
  type AuthenticatedFetch,
  type SessionCredentials,
} from '@machafoundation/core';
