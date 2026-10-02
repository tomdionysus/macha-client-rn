// The session lifecycle is core's. Its manager caches the minted session,
// revalidates a cached token on start rather than assuming it, and chunks the
// wait to a distant expiry so a long-lived session does not overflow
// `setTimeout`'s 32-bit delay and fire immediately.
//
// The manager is the only authority for the token. Signing in mints a new
// token with credentials rather than upgrading the one in hand, and signing
// out drops the token and immediately mints a fresh anonymous one, so the
// client is never left holding no session at all.
export {
  NO_AUTH,
  SessionAuthError,
  SessionManager,
  type AuthenticatedFetch,
  type SessionCredentials,
} from '@machafoundation/core';
