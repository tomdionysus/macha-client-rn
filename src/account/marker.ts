import { isSignedIn, type CurrentSession } from '@machafoundation/core';

/**
 * What the account marker should say. Only `anonymous` and `signedIn` render;
 * the others render nothing:
 *
 * - `unknown`: the cluster has not answered, so "nobody is signed in" is not known.
 * - `unstated`: it answered but named no user (a node without accounts), so
 *   there is nothing to log in to.
 */
export type AccountDisplay =
  | { kind: 'unknown' }
  | { kind: 'unstated' }
  | { kind: 'anonymous' }
  | { kind: 'signedIn'; username: string; initial: string };

export interface AccountState {
  session?: CurrentSession;
  /** Whether the cluster answered at all; an absent session is not the same as no answer. */
  known: boolean;
}

/** Reads the current session into something a marker can draw. Anonymity is core's `isSignedIn` call. */
export function describeAccount({ session, known }: AccountState): AccountDisplay {
  if (!known || !session) return { kind: 'unknown' };

  const username = session.username?.trim() ?? '';
  // An empty name is as good as none.
  if (username === '') return { kind: 'unstated' };

  if (!isSignedIn(session)) return { kind: 'anonymous' };
  return { kind: 'signedIn', username, initial: initialOf(username) };
}

/** The first code point of a username, for the badge; `Array.from` avoids splitting a surrogate pair. */
function initialOf(username: string): string {
  return (Array.from(username)[0] ?? '').toUpperCase();
}
