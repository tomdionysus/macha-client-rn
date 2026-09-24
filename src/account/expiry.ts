import { isSignedIn, type SessionIdentityChange } from '@machafoundation/core';
import { describeAccount, type AccountState } from './marker';

/**
 * How far ahead of the deadline the viewer is asked to log in again.
 *
 * Three days, so a phone picked up every other day still sees it before the
 * session lapses. Longer would nag through most of a 30-day session's last
 * week for something one tap fixes.
 */
export const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ExpiryNotice {
  title: string;
  detail: string;
}

/**
 * A warning that a signed-in session is about to lapse, or nothing.
 *
 * **Why this exists.** Core's refresh timer does not refresh, it re-mints, and
 * a re-mint presents no credentials. So 30 days after logging in, a viewer
 * becomes anonymous mid-use with nothing said, and the library can empty in
 * front of them. The deadline is known in advance: the whoami this client
 * already reads carries `expires_unix_ms`. So the honest fix is to ask before
 * it arrives rather than explain afterwards.
 *
 * Only for a named account, as core's `isSignedIn` decides through
 * `describeAccount`. An anonymous session lapses too, but is re-minted as the
 * same nobody, so there is nothing to warn about.
 */
export function sessionExpiryNotice(state: AccountState, nowMs: number): ExpiryNotice | undefined {
  if (describeAccount(state).kind !== 'signedIn' || !state.session) return undefined;
  const remainingMs = state.session.expires_unix_ms - nowMs;
  if (remainingMs <= 0 || remainingMs > EXPIRY_WARNING_MS) return undefined;
  return {
    title: `Your login expires ${inWords(remainingMs)}`,
    detail:
      'Log in again to keep seeing everything this account can. When it lapses, this phone carries on without an account and may lose the library.',
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
 * A notice that a named account's session was replaced by one that is not
 * signed in, or nothing.
 *
 * Core records the replacement in `lastIdentityChange` and does not say why:
 * a 401 cannot tell an expiry from a revoke or a password change, so this
 * does not say "expired" either. A deliberate logout clears the record in
 * core, and logging back in replaces it with a change *to* the account, so
 * neither shows this. It lasts until then, or until the app restarts, since
 * core keeps the record in memory only.
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
    detail: `This phone was logged in as ${from.trim()}, and the cluster has replaced that session. Log in again to get back everything that account can see.`,
  };
}
