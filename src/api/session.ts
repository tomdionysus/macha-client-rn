// Session lifecycle, re-exported from core. The manager is the only authority
// for the token: sign-in mints a new one, and sign-out immediately mints a
// fresh anonymous one, so there is always a session.
export {
  NO_AUTH,
  SessionAuthError,
  SessionManager,
  type AuthenticatedFetch,
  type SessionCredentials,
} from '@machafoundation/core';
