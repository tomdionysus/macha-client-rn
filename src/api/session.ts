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
export {
  NO_AUTH,
  SessionManager,
  fixedBearerToken,
  mintAnonymousSession,
  type AnonymousSession,
  type AuthenticatedFetch,
} from '@macha/core';

import { fixedBearerToken, type AuthenticatedFetch, type SessionManager } from '@macha/core';

/**
 * A manually configured token wins over the anonymous session.
 *
 * The Settings screen's override is a deliberate act by someone who knows what
 * they are doing; the anonymous session is the fallback for everyone else.
 */
export function authFor(manualToken: string | undefined, sessions: SessionManager): AuthenticatedFetch {
  const trimmed = manualToken?.trim();
  return trimmed ? fixedBearerToken(trimmed) : sessions;
}
