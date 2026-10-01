import {
  MachaClusterRouteError,
  MachaConnectionError,
  playbackFailureCode,
  playbackFailureStatus,
  SessionNotStartedError,
  unreachableEndpointFailure,
} from '@machafoundation/core';

export const SERVER_UNREACHABLE_MESSAGE =
  'Cannot reach a Macha node. Check the address and that the node is running.';

/**
 * Transport-level failure: DNS, refused connection, TLS, or a request deadline.
 *
 * Core's class rather than our own, because `retryableEndpointFailure` and
 * `unreachableEndpointFailure` test for it by identity. A local look-alike is
 * classified as an unknown object instead of a transport failure, which reads
 * as "not retryable" and would strand a walk on the first unreachable node.
 */
export { MachaConnectionError };

/**
 * Whether a node refused this viewer, rather than failing to answer.
 *
 * 401 is "no usable session" and 403 is "your roles do not permit this". Both
 * are the node working exactly as intended, and neither is a sentence worth
 * putting in front of a person: "a valid session bearer token is required" is
 * true, accurate, and useless to whoever is holding the phone.
 *
 * This asks whether the cluster has refused *us*, not whether to move off a
 * node — every node will answer identically, because sessions and roles are
 * replicated. A caller
 * with a local library should serve it and let the account notice explain why
 * the rest is missing.
 */
export function isAuthRefusal(error: unknown): boolean {
  // Read through core's accessor, never by class. This tested `instanceof` a
  // local `MachaApiError` until 2026-09-24 — a class nothing in the app threw:
  // a refusal arrives as core's own `MachaApiError`, sometimes inside a
  // `MachaEndpointError`, so the branch that serves a refused viewer their
  // downloads could not fire.
  const status = playbackFailureStatus(error);
  return status === 401 || status === 403;
}

/**
 * Whether nothing answered at all — the cluster, not the request, is the
 * problem.
 *
 * **Fields, not identity.** A walk that exhausts the cluster throws core's
 * `MachaClusterRouteError`, which is not a `MachaConnectionError`; a pinned or
 * mutation failure is a `MachaEndpointError` of kind `transport`. Until
 * 2026-09-24 `MediaApi` tested `instanceof MachaConnectionError`, which only
 * the bare class passes, so the offline fallback fired in its tests and never
 * in the app. Core's `unreachableEndpointFailure` reads the route error's own
 * `unreachable` field since core `f3cf74c`, raised from here.
 *
 * Claimed only when no layer stated a status **or** a code:
 * `endpointFailure` files a 401 or 403 under `transport` too, and calling a
 * refusal a connection problem would be the dishonest version.
 */
export function isUnreachable(error: unknown): boolean {
  if (playbackFailureStatus(error) !== undefined || playbackFailureCode(error) !== undefined) return false;
  return unreachableEndpointFailure(error);
}

/**
 * Every node the route could try was tried, and none was reached: refused a
 * connection, gone, or slower than core waits for one. Core's own field says
 * so (`MachaClusterRouteError.unreachable`); the web asks it the same way.
 */
export function noNodeAnswered(error: unknown): boolean {
  return error instanceof MachaClusterRouteError && error.unreachable;
}

/** The web's sentence for it (web `043fd81`): usually a passing slowness, so try again comes first. */
export const NO_NODE_ANSWERED_TEXT =
  'No Macha server answered. Try again in a moment; if it keeps happening, check that the servers are running.';

/**
 * Whether the request was never made because the session manager is not
 * running — "could not ask", which is neither a refusal nor an outage.
 *
 * Walks `cause`, because it is thrown inside each endpoint's operation and so
 * arrives wrapped by the walk like any other failure. It extends
 * `MachaConnectionError`, so the walk also calls it unreachable; branch on
 * this first.
 */
export function isSessionNotStarted(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof SessionNotStartedError) return true;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
