import { hasRole, sessionLockedOut, type CurrentSession, type UserRole } from '@machafoundation/core';

/**
 * The role a node requires for reads and playback.
 *
 * Named once here rather than spelled at each gate. The server decides this in
 * `Service::required_role`, where everything that is not session, status,
 * account management or a mutation falls through to exactly this role.
 */
export const MEDIA_ROLE: UserRole = 'media_viewer';

/**
 * Whether this client may ask the cluster for media, which is three answers
 * rather than two.
 *
 * `unknown` is the one that matters and the one that is easy to lose. "Nobody
 * has answered yet" is not "you are refused", and conflating them is not a
 * cosmetic bug: it sends a fully privileged viewer to a login screen on any
 * cold start against a slow cluster. The web client lost a whole run's worth of
 * privileged UI to that exact shape, and core makes it easy to reproduce —
 * `SessionManager.fetch` waits on a mint only when one is *already* in flight,
 * so a request made in the window after a failed mint goes out tokenless, is
 * answered 401, and is returned unretried because it sent no token.
 *
 * Only `denied` may gate anything. `unknown` must behave as "not yet", never as
 * "no".
 */
export type MediaAccess =
  | { kind: 'unknown' }
  | { kind: 'granted' }
  | { kind: 'denied'; reason: DenialReason };

/**
 * Why the cluster will not serve media.
 *
 * Two genuinely different states, and both are reachable today:
 *
 * - `no-session` — the node refused to mint at all. Either anonymous access is
 *   switched off, or the anonymous account holds no roles: the server maps both
 *   onto one 403 `anonymous_disabled`, so a client cannot tell them apart and
 *   does not need to.
 * - `no-role` — a session exists and simply does not carry `media_viewer`.
 * - `no-roles` — a session exists and carries **nothing at all**.
 *
 * They read the same to a viewer ("log in to see anything") but not to us: only
 * the last two mean we are holding a usable token.
 *
 * **`no-roles` is split out because the remedy differs, not the mechanism.**
 * A session with some roles but not `media_viewer` is an account configured
 * for something else, and the answer is to ask for the role. A session with an
 * empty role array was granted nothing — which core records as either a
 * registered-users-only deployment (removing `media_viewer` from the anonymous
 * account is how that is configured, server 0.38.4) or a signed-in viewer
 * silently degraded to anonymous by a credential-less re-mint. **Both of those
 * are answered by signing in, and neither is answered by asking an
 * administrator for a role the viewer may already have.** Told to do the wrong
 * one, a viewer whose session merely lapsed goes looking for an admin.
 *
 * Decided with core's `sessionLockedOut` rather than by testing the array,
 * because `undefined` is the unknown state and must never be read as locked
 * out. It cannot arise here — `CurrentSession.roles` is always an array — but
 * the helper is what keeps that true if the shape ever changes.
 */
export type DenialReason = 'no-session' | 'no-role' | 'no-roles';

export interface AccessFacts {
  /**
   * Whether the session lifecycle has finished trying — minted, or failed and
   * given up. Before this, nothing below is evidence of anything.
   */
  settled: boolean;
  /** Whether a bearer token actually exists right now. */
  hasToken: boolean;
  /**
   * Whether a mint was *refused by a node* rather than failing in transport.
   *
   * A refusal is an answer; an unreachable cluster is not. Keeping these apart
   * is what stops a phone away from home being told it needs to log in.
   */
  mintRefused: boolean;
  /** The whoami, where one has been answered. */
  session?: CurrentSession;
  /** Whether the whoami has been answered at all. Absent and unanswered differ. */
  known: boolean;
}

/**
 * Reads the session facts into a decision a gate can act on.
 *
 * Deliberately pure and deliberately not a boolean: every caller must handle
 * the third state explicitly, and a `boolean` would let one forget.
 */
export function describeMediaAccess(facts: AccessFacts): MediaAccess {
  // Nothing has settled. Not an answer, and the single most important branch
  // here — see the note on `MediaAccess`.
  if (!facts.settled) return { kind: 'unknown' };

  // A node said no. That is definite, and it is the state a deployment that
  // requires accounts sits in permanently.
  if (facts.mintRefused) return { kind: 'denied', reason: 'no-session' };

  // Settled, no token, and nobody refused us: the cluster could not be reached.
  // Unreachable must never read as refused — offline is an ordinary condition
  // for a phone, and the local library is the right answer to it.
  if (!facts.hasToken) return { kind: 'unknown' };

  // A token, but the whoami has not come back yet. Still not an answer.
  if (!facts.known || !facts.session) return { kind: 'unknown' };

  if (hasRole(facts.session.roles, MEDIA_ROLE)) return { kind: 'granted' };
  return { kind: 'denied', reason: sessionLockedOut(facts.session.roles) ? 'no-roles' : 'no-role' };
}

/** Whether the cluster is worth asking for media at all. `unknown` is optimistic on purpose: the server is the real gate. */
export function mayRequestMedia(access: MediaAccess): boolean {
  return access.kind !== 'denied';
}
