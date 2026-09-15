import { isSignedIn, type CurrentSession } from '@machafoundation/core';

/**
 * What the account marker should say, which is four answers rather than two.
 *
 * The two easy ones are "somebody is signed in" and "nobody is". The two that
 * get conflated with them are worth keeping apart:
 *
 * - `unknown` — the cluster has not answered. Offline, still starting, or the
 *   whoami failed. Offering "Log in" here states that nobody is signed in,
 *   which is a claim this client cannot make without an answer.
 * - `unstated` — the cluster answered and named no user at all. A node that
 *   has sessions but not yet accounts does exactly this, and there is nothing
 *   to log in to on one. Offering a login form would be a promise the server
 *   cannot keep.
 *
 * Only `anonymous` and `signedIn` are things to render. The other two render
 * nothing, which is why they are separate values rather than an absent
 * session — a caller that tests for truthiness cannot tell them apart.
 */
export type AccountDisplay =
  | { kind: 'unknown' }
  | { kind: 'unstated' }
  | { kind: 'anonymous' }
  | { kind: 'signedIn'; username: string; initial: string };

export interface AccountState {
  session?: CurrentSession;
  /** Whether the cluster answered at all. Absent session and unanswered question are not the same. */
  known: boolean;
}

/**
 * Reads the current session into something a marker can draw.
 *
 * `isSignedIn` is core's and is not reimplemented here: it is the one place
 * that knows the anonymous account by name, and this client must not grow a
 * second opinion about which usernames are special.
 */
export function describeAccount({ session, known }: AccountState): AccountDisplay {
  if (!known || !session) return { kind: 'unknown' };

  const username = session.username?.trim() ?? '';
  // Stated as empty is as uninformative as not stated at all, and a marker
  // drawn from an empty string is a blank circle nobody can act on.
  if (username === '') return { kind: 'unstated' };

  if (!isSignedIn(session)) return { kind: 'anonymous' };
  return { kind: 'signedIn', username, initial: initialOf(username) };
}

/**
 * The first character of a username, for the badge.
 *
 * `Array.from` rather than `username[0]`: indexing a string yields UTF-16 code
 * units, so a name starting outside the basic plane would render as half a
 * character. This still splits a combined emoji at its first component, which
 * is a cosmetic limit rather than a broken glyph.
 */
function initialOf(username: string): string {
  return (Array.from(username)[0] ?? '').toUpperCase();
}
