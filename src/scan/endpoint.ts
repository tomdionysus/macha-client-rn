import { coerceEndpointUrl } from '../api/http';

/**
 * What a scanned code has to look like before it is treated as a node address.
 *
 * `coerceEndpointUrl` exists for the connect screen's text field, where every
 * keystroke was typed by someone who meant to type an address. A camera has no
 * such guarantee: it will happily read a wifi credential, a URL for somebody's
 * website, or a payload from a scheme this client does not own. Handed
 * `macha://pair?token=abc`, the coercion returns `http://macha:7438` — a
 * syntactically perfect endpoint that no node has ever answered on — and the
 * viewer is then told the server is unreachable, which is both true and the
 * wrong diagnosis entirely.
 *
 * So a scanned code is screened before it is coerced, and anything that is not
 * recognisably an address is rejected as a code rather than adopted as a node.
 */
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const HOST_AND_PORT = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

/**
 * The node address encoded in a scanned code, or `''` when the code is not one.
 *
 * Accepts an `http`/`https` URL, or a bare `host[:port]` that is addressable on
 * its face — it carries a port, or a dot, or is `localhost`. A bare word is
 * refused: `Macha` is a valid LAN hostname and also what a poster says, and
 * there is no way to tell them apart from a camera frame. Someone whose node
 * genuinely answers to a single-label name can still type it.
 *
 * IPv6 literals are not handled; nothing on this project has produced one, and
 * guessing at the bracket syntax without a case to check it against would be
 * inventing a format rather than reading one.
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
