import { MachaConnectionError } from '@macha/core';

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
export { parseErrorEnvelope, type ParsedErrorEnvelope } from '@macha/core';

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

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Something went wrong.';
}
