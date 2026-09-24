import {
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

export function serverUnreachable(detail?: string): MachaConnectionError {
  return new MachaConnectionError(detail ? `${SERVER_UNREACHABLE_MESSAGE} (${detail})` : SERVER_UNREACHABLE_MESSAGE);
}

/** A Macha node answered, but not with what was asked for. */
export class MachaApiError extends Error {
  readonly name = 'MachaApiError';
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly retryAfterMs?: number,
    /**
     * Why the node failed, where it says so — `source_unsupported`,
     * `source_unreadable`, `source_read_timed_out`.
     *
     * Carried because core's `retryableEndpointFailure` reads it off the error
     * and lets it outrank the status. `source_unsupported` is a fact about the
     * bytes, and every node holds the same bytes, so it must end a cluster walk
     * rather than collect three identical refusals. Dropping this field would
     * leave a 5xx looking node-local and spend the viewer's time proving it
     * isn't.
     */
    readonly reason?: string,
  ) {
    super(message);
  }
}

/**
 * Error-envelope parsing is core's: same two accepted body shapes, same
 * `message`/`code`/`reason` extraction, including the `reason` this client
 * needs for `retryableEndpointFailure` to tell a node-local failure from a
 * fact about the file.
 */
export { parseErrorEnvelope, type ParsedErrorEnvelope } from '@machafoundation/core';

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError';
}

/**
 * Whether a failure says something about the *endpoint* rather than about the
 * request. Caller cancellation and ordinary 4xx answers do not: only transport
 * failures and 5xx do, and only those may move the registry off a node.
 */
export function isEndpointFailure(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof MachaConnectionError) return true;
  if (error instanceof MachaApiError) return error.status === undefined || error.status >= 500;
  return true;
}

/**
 * Whether a node refused this viewer, rather than failing to answer.
 *
 * 401 is "no usable session" and 403 is "your roles do not permit this". Both
 * are the node working exactly as intended, and neither is a sentence worth
 * putting in front of a person: "a valid session bearer token is required" is
 * true, accurate, and useless to whoever is holding the phone.
 *
 * It matters that this is not `isEndpointFailure`. That asks whether to move
 * off a node; this asks whether the cluster has refused *us*, which every node
 * will answer identically because sessions and roles are replicated. A caller
 * with a local library should serve it and let the account notice explain why
 * the rest is missing.
 */
export function isAuthRefusal(error: unknown): boolean {
  // Read through core's accessor, never by class. This tested `instanceof` the
  // `MachaApiError` above until 2026-09-24 — a class nothing in the app throws:
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
