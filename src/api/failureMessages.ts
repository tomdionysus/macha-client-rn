import { playbackFailureDetail, playbackFailureStatus } from '@machafoundation/core';
import { isUnreachable } from './errors';

/**
 * Viewer text for every failure outside playback, which has its own in
 * `playback/policy.ts`.
 *
 * **These were `describeError` until 2026-09-24, which is `.message`** — and
 * core defined `.message` as log text that day. What reached the screen was
 * *"Macha endpoint https://macnessa.macha.network failed: Macha catalogue
 * request failed: ..."*: two of core's envelopes and a node address, in front
 * of a viewer, at the home refresh line, every load failure, login, logout
 * and a failed download.
 *
 * The same shape as `createFailureMessage`, for the same reasons: one lead per
 * kind of failure, saying only what is known, keyed on status and code read
 * through core's accessors because they sit a `cause` or two down; and the
 * server's own sentence in brackets where it stated one, because it is the
 * only place the actual reason appears. **Never `.message` as a fallback** —
 * no detail means the server said nothing, and the lead stands alone.
 *
 * The accessors carry `playback` in their names and walk any chain; core says
 * so and asks that nobody write a second walk because of the name.
 */

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';
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
  if (isUnreachable(error)) return UNREACHABLE;
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
 * A sign-in the cluster did not accept.
 *
 * A node answers an unknown username and a wrong password identically, and in
 * the same time; one sentence for any 401 keeps that true here. 403 is a
 * refusal to mint at all — anonymous access switched off, or the account
 * disabled — and the server's sentence is the only thing that says which.
 */
export function signInFailureMessage(error: unknown): string {
  const status = playbackFailureStatus(error);
  if (status === 401) return 'That username or password was not accepted.';
  if (status === 403) return quoted('The server is not accepting this sign-in.', error);
  return explain(error, 'Could not log in.');
}

/**
 * A logout whose revoke failed.
 *
 * By the time this throws the phone has already forgotten the session — core
 * clears it unconditionally — so what failed is telling the cluster. The
 * session stays valid on every node until it expires, and that is the honest
 * thing to say.
 */
export function signOutFailureMessage(error: unknown): string {
  const lead = 'Logged out on this phone, but the server could not be told, so the old session stays valid until it expires.';
  return isUnreachable(error) ? `${lead} The server could not be reached.` : quoted(lead, error);
}

/**
 * A download that did not finish.
 *
 * Stored on the record and shown in the downloads list, so it outlives the
 * failure. A local failure — the file system, a missing file — carries no
 * detail and gets the lead alone; its native wording is not the viewer's.
 */
export function downloadFailureMessage(error: unknown): string {
  return explain(error, 'The download did not finish.');
}
