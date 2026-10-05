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
 * Must be core's class: core's failover tests for it by identity, and a local
 * look-alike would be treated as not retryable.
 */
export { MachaConnectionError };

/**
 * Whether the cluster refused this viewer (401 no usable session, 403 roles do
 * not permit), rather than failing to answer. Every node answers alike, since
 * sessions and roles are replicated, so this is not a reason to fail over.
 */
export function isAuthRefusal(error: unknown): boolean {
  // Core's accessor, not a class test: the status may sit inside a wrapper.
  const status = playbackFailureStatus(error);
  return status === 401 || status === 403;
}

/**
 * Whether nothing answered at all. Reads core's fields rather than
 * `instanceof`, since route and endpoint errors wrap the transport failure.
 * False whenever any layer stated a status or code: core files 401/403 under
 * `transport` too, and a refusal is not a connection problem.
 */
export function isUnreachable(error: unknown): boolean {
  if (playbackFailureStatus(error) !== undefined || playbackFailureCode(error) !== undefined) return false;
  return unreachableEndpointFailure(error);
}

/** Every node the route could try was tried and none was reached. */
export function noNodeAnswered(error: unknown): boolean {
  return error instanceof MachaClusterRouteError && error.unreachable;
}

/** A transport failure while browsing or playing; the connect screen says `SERVER_UNREACHABLE_MESSAGE`. */
export const UNREACHABLE_TEXT = 'Could not reach the server. Check your connection and try again.';

/** Usually a passing slowness, so "try again" comes first. Matches the web client. */
export const NO_NODE_ANSWERED_TEXT =
  'No Macha server answered. Try again in a moment; if it keeps happening, check that the servers are running.';

/**
 * Whether the request was never made because the session manager is not
 * running: neither a refusal nor an outage. Walks `cause`, as the route wraps
 * it. It extends `MachaConnectionError`, so check this before `isUnreachable`.
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
