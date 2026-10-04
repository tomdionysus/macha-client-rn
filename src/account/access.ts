import { hasRole, sessionLockedOut, type CurrentSession, type UserRole } from '@machafoundation/core';

/** The role a node requires for reads and playback (server: `Service::required_role`). */
export const MEDIA_ROLE: UserRole = 'media_viewer';

/**
 * Whether this client may ask the cluster for media. `unknown` ("nobody has
 * answered yet") must behave as "not yet", never "no", or a cold start against
 * a slow cluster sends a privileged viewer to the login screen. Only `denied`
 * may gate anything.
 */
export type MediaAccess =
  | { kind: 'unknown' }
  | { kind: 'granted' }
  | { kind: 'denied'; reason: DenialReason };

/**
 * Why the cluster will not serve media:
 *
 * - `no-session`: the node refused to mint (403 `anonymous_disabled`: anonymous
 *   access off, or the anonymous account has no roles).
 * - `no-role`: the session lacks `media_viewer`; the remedy is asking for it.
 * - `no-roles`: the session carries no roles at all (a registered-users-only
 *   cluster, or a signed-in session lapsed to anonymous); the remedy is to sign
 *   in. Decided by core's `sessionLockedOut`, which never reads `undefined` as
 *   locked out.
 */
export type DenialReason = 'no-session' | 'no-role' | 'no-roles';

export interface AccessFacts {
  /** Whether the session lifecycle has finished trying; before that, nothing below is evidence. */
  settled: boolean;
  /** Whether a bearer token actually exists right now. */
  hasToken: boolean;
  /** Whether a node refused a mint, as opposed to a transport failure, which says nothing. */
  mintRefused: boolean;
  /** The whoami, where one has been answered. */
  session?: CurrentSession;
  /** Whether the whoami has been answered at all. Absent and unanswered differ. */
  known: boolean;
}

/** Reads the session facts into a decision; not a boolean, so callers must handle `unknown`. */
export function describeMediaAccess(facts: AccessFacts): MediaAccess {
  if (!facts.settled) return { kind: 'unknown' };
  if (facts.mintRefused) return { kind: 'denied', reason: 'no-session' };
  // No token and no refusal: unreachable, which is not a refusal.
  if (!facts.hasToken) return { kind: 'unknown' };
  if (!facts.known || !facts.session) return { kind: 'unknown' };

  if (hasRole(facts.session.roles, MEDIA_ROLE)) return { kind: 'granted' };
  return { kind: 'denied', reason: sessionLockedOut(facts.session.roles) ? 'no-roles' : 'no-role' };
}

/** Whether the cluster is worth asking for media. Optimistic on `unknown`: the server is the real gate. */
export function mayRequestMedia(access: MediaAccess): boolean {
  return access.kind !== 'denied';
}
