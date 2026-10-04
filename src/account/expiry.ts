import { isSignedIn, type SessionIdentityChange } from '@machafoundation/core';
import { describeAccount, type AccountState } from './marker';

/** How far ahead of expiry to ask the viewer to log in again: long enough for a phone used every other day. */
export const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ExpiryNotice {
  title: string;
  detail: string;
}

/**
 * A warning that a signed-in session is about to lapse, or nothing. Core's
 * expiry re-mint carries no credentials, so a lapsed login silently becomes
 * anonymous. Named accounts only; anonymous sessions lose nothing.
 */
export function sessionExpiryNotice(state: AccountState, nowMs: number): ExpiryNotice | undefined {
  if (describeAccount(state).kind !== 'signedIn' || !state.session) return undefined;
  const remainingMs = state.session.expires_unix_ms - nowMs;
  if (remainingMs <= 0 || remainingMs > EXPIRY_WARNING_MS) return undefined;
  return {
    title: `Your login expires ${inWords(remainingMs)}`,
    detail:
      'Log in again to keep seeing everything this account can. When it lapses, this device carries on without an account and may lose the library.',
  };
}

function inWords(remainingMs: number): string {
  if (remainingMs < HOUR_MS) return 'in less than an hour';
  if (remainingMs < DAY_MS) return `in ${count(Math.ceil(remainingMs / HOUR_MS), 'hour')}`;
  return `in ${count(Math.ceil(remainingMs / DAY_MS), 'day')}`;
}

function count(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/**
 * A notice that a named account's session was replaced by one not signed in,
 * or nothing. Does not say "expired": core's `lastIdentityChange` cannot tell
 * expiry from revocation. A deliberate logout or a new login clears it, as
 * does a restart (core keeps it in memory).
 */
export function sessionEndedNotice(
  state: AccountState & { identityChange?: SessionIdentityChange },
): ExpiryNotice | undefined {
  const from = state.identityChange?.from;
  if (!from || !isSignedIn({ username: from })) return undefined;
  const now = describeAccount(state).kind;
  if (now !== 'anonymous' && now !== 'unstated') return undefined;
  return {
    title: 'You have been logged out',
    detail: `This device was logged in as ${from.trim()}, and the cluster has replaced that session. Log in again to get back everything that account can see.`,
  };
}
