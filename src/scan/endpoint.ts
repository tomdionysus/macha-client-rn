import { coerceEndpointUrl } from '../api/http';

// A scanned code is screened before `coerceEndpointUrl`, which is lenient for
// typed input and would turn e.g. `macha://pair?token=abc` into
// `http://macha:7438`, misreported later as an unreachable server.
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const HOST_AND_PORT = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

/**
 * The node address in a scanned code, or `''` if it is not one.
 *
 * Accepts an `http`/`https` URL, or a bare `host[:port]` with a port, a dot, or
 * `localhost`. A bare word is refused (it is indistinguishable from text on a
 * poster); single-label hosts can still be typed. IPv6 literals are not handled.
 */
export function readScannedEndpoint(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) return scheme === 'http' || scheme === 'https' ? coerceEndpointUrl(trimmed) : '';

  if (!HOST_AND_PORT.test(trimmed)) return '';
  const addressable = trimmed.includes(':') || trimmed.includes('.') || trimmed.toLowerCase() === 'localhost';
  return addressable ? coerceEndpointUrl(trimmed) : '';
}
