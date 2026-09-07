export const SERVER_UNREACHABLE_MESSAGE =
  'Cannot reach a Macha node. Check the address and that the node is running.';

/** Transport-level failure: DNS, refused connection, TLS, or a request deadline. */
export class MachaConnectionError extends Error {
  readonly name = 'MachaConnectionError';
}

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
  ) {
    super(message);
  }
}

interface ErrorEnvelope {
  message: string;
  code?: string;
}

/**
 * Macha error bodies are `{ "error": { "code", "message" } }` on current nodes
 * and a flat `{ "message" }` on older ones. Both are accepted; anything else
 * falls back to the caller's HTTP-status text.
 */
export function parseErrorEnvelope(body: unknown, fallback: string): ErrorEnvelope {
  if (!body || typeof body !== 'object') return { message: fallback };
  const record = body as Record<string, unknown>;
  const nested = record.error;
  const source = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : record;
  const message = typeof source.message === 'string' && source.message.trim() ? source.message.trim() : undefined;
  const code = typeof source.code === 'string' && source.code.trim() ? source.code.trim() : undefined;
  if (!message && typeof nested === 'string' && nested.trim()) return { message: nested.trim(), code };
  return { message: message ?? fallback, code };
}

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
