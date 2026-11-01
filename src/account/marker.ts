import { isSignedIn, type CurrentSession } from '@machafoundation/core';
import type { MediaAccess } from './access';

/**
 * What the account marker should say. `anonymous`, `required` and `signedIn`
 * render; the others render nothing:
 *
 * - `unknown`: the cluster has not answered, so "nobody is signed in" is not known.
 * - `unstated`: it answered but named no user (a node without accounts), so
 *   there is nothing to log in to.
 * - `required`: the cluster refused a guest session, so there is no whoami to
 *   read, but logging in is the only way in.
 */
export type AccountDisplay =
  | { kind: 'unknown' }
  | { kind: 'unstated' }
  | { kind: 'anonymous' }
  | { kind: 'required' }
  | { kind: 'signedIn'; username: string; initial: string };

export interface AccountState {
  session?: CurrentSession;
  /** Whether the cluster answered at all; an absent session is not the same as no answer. */
  known: boolean;
}

/** Reads the current session into something a marker can draw. Anonymity is core's `isSignedIn` call. */
export function describeAccount({ session, known }: AccountState, access?: MediaAccess): AccountDisplay {
  const display = describeSession(session, known);
  // A refused mint leaves no session to describe; only a named session outranks it.
  if (display.kind !== 'signedIn' && access?.kind === 'denied' && access.reason === 'no-session') {
    return { kind: 'required' };
  }
  return display;
}

function describeSession(session: CurrentSession | undefined, known: boolean): AccountDisplay {
  if (!known || !session) return { kind: 'unknown' };

  const username = session.username?.trim() ?? '';
  // An empty name is as good as none.
  if (username === '') return { kind: 'unstated' };

  if (!isSignedIn(session)) return { kind: 'anonymous' };
  return { kind: 'signedIn', username, initial: initialOf(username) };
}

/** Whether the viewer should be offered the login screen. */
export function offersLogin(display: AccountDisplay): boolean {
  return display.kind === 'anonymous' || display.kind === 'required';
}

/** The first code point of a username, for the badge; `Array.from` avoids splitting a surrogate pair. */
function initialOf(username: string): string {
  return (Array.from(username)[0] ?? '').toUpperCase();
}
