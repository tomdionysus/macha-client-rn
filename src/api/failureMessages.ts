import { playbackFailureDetail, playbackFailureStatus } from '@machafoundation/core';
import { isUnreachable, NO_NODE_ANSWERED_TEXT, noNodeAnswered, UNREACHABLE_TEXT } from './errors';

/**
 * Viewer text for failures outside playback (playback's is in
 * `playback/policy.ts`).
 *
 * One lead per kind of failure, keyed on status read through core's accessors
 * (which walk any `cause` chain despite the `playback` in their names), plus
 * the server's own detail in brackets where it gave one. Never fall back to
 * `.message`: that is core's log text, with envelopes and a node address.
 */

const NOT_LOGGED_IN = 'You are not logged in. Log in and try again.';
const NOT_ALLOWED = 'This account is not allowed to see this. Log in with an account that is.';

function quoted(lead: string, error: unknown): string {
  const detail = playbackFailureDetail(error);
  return detail ? `${lead} (${detail})` : lead;
}

/** The rules every read shares; `lead` is what failed, said plainly. */
function explain(error: unknown, lead: string): string {
  const status = playbackFailureStatus(error);
  if (status === 401) return NOT_LOGGED_IN;
  if (status === 403) return NOT_ALLOWED;
  if (status === 429) return quoted('The server is busy right now. Try again in a few minutes.', error);
  if (status !== undefined && status >= 500) return quoted(`${lead} The server had a problem; try again in a moment.`, error);
  if (noNodeAnswered(error)) return NO_NODE_ANSWERED_TEXT;
  if (isUnreachable(error)) return UNREACHABLE_TEXT;
  return quoted(`${lead} Try again.`, error);
}

/** A screen whose content could not be loaded at all. */
export function loadFailureMessage(error: unknown): string {
  return explain(error, 'This could not be loaded.');
}

/** A refresh that failed while the last good content is still on screen. */
export function refreshFailureMessage(error: unknown): string {
  return explain(error, 'Could not refresh, so this may be out of date.');
}

/**
 * A sign-in the cluster did not accept. One sentence for any 401, so an unknown
 * user and a wrong password stay indistinguishable. A 403 (anonymous access
 * off, account disabled) says which only in the server's detail.
 */
export function signInFailureMessage(error: unknown): string {
  const status = playbackFailureStatus(error);
  if (status === 401) return 'That username or password was not accepted.';
  if (status === 403) return quoted('The server is not accepting this sign-in.', error);
  return explain(error, 'Could not log in.');
}

/**
 * A logout whose revoke failed. Core has already cleared the local session; the
 * server's copy stays valid until it expires.
 */
export function signOutFailureMessage(error: unknown): string {
  const lead = 'Logged out on this device, but the server could not be told, so the old session stays valid until it expires.';
  return isUnreachable(error) ? `${lead} The server could not be reached.` : quoted(lead, error);
}

/**
 * A download that did not finish; stored on the record. Local failures carry
 * no detail and get the lead alone, never their native wording.
 */
export function downloadFailureMessage(error: unknown): string {
  return explain(error, 'The download did not finish.');
}
