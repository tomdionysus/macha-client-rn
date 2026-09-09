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
export {
  NO_AUTH,
  SessionManager,
  mintAnonymousSession,
  type AnonymousSession,
  type AuthenticatedFetch,
} from '@macha/core';
