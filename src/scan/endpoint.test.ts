import { describe, expect, it } from 'vitest';
import { readScannedEndpoint } from './endpoint';

describe('readScannedEndpoint', () => {
  it('reads a full URL as it stands', () => {
    expect(readScannedEndpoint('http://192.168.1.20:7438')).toBe('http://192.168.1.20:7438');
    expect(readScannedEndpoint('https://macha.example.com')).toBe('https://macha.example.com');
  });

  it('fills in the scheme and the default port for a bare address', () => {
    expect(readScannedEndpoint('192.168.1.20:7438')).toBe('http://192.168.1.20:7438');
    expect(readScannedEndpoint('macha.local')).toBe('http://macha.local:7438');
  });

  it('ignores the whitespace a printed code picks up', () => {
    expect(readScannedEndpoint('  192.168.1.20:7438\n')).toBe('http://192.168.1.20:7438');
  });

  // The three the plain coercion gets wrong, measured against it before this
  // module existed: `macha://pair?token=abc` and `Macha` both become
  // `http://macha:7438`, and `mailto:tom@example.com` becomes
  // `http://example.com:7438`. Each is a real-looking endpoint no node answers
  // on, and the connect attempt that follows reports an unreachable server
  // rather than a code that was never an address.
  it('refuses a scheme this client does not own', () => {
    expect(readScannedEndpoint('macha://pair?token=abc')).toBe('');
    expect(readScannedEndpoint('mailto:tom@example.com')).toBe('');
  });

  it('refuses a bare word', () => {
    expect(readScannedEndpoint('Macha')).toBe('');
  });

  // These the coercion already rejected. Held anyway: they are what a camera
  // actually meets, and the screening in front of it must not start letting
  // them past.
  it('refuses the codes a camera meets by accident', () => {
    expect(readScannedEndpoint('WIFI:S:home;T:WPA;P:hunter2;;')).toBe('');
    expect(readScannedEndpoint('BEGIN:VCARD\nFN:Tom\nEND:VCARD')).toBe('');
    expect(readScannedEndpoint('')).toBe('');
  });

  // A printed code is machine-produced and carries shapes nobody types. Pinned
  // because the core session raised normalisation drift as a risk for scanned
  // payloads specifically: every one of these collapses to a lowercase origin,
  // because the coercion this ends in returns `new URL(...).origin`.
  it('collapses machine-produced shapes to an origin', () => {
    expect(readScannedEndpoint('HTTP://HOST:7438/')).toBe('http://host:7438');
    expect(readScannedEndpoint('http://a:7438//')).toBe('http://a:7438');
    expect(readScannedEndpoint('http://a:7438/api/')).toBe('http://a:7438');
    expect(readScannedEndpoint('http://A.Local')).toBe('http://a.local:7438');
  });

  // Nothing in the payload distinguishes a node from any other web server, so
  // this is deliberately let through: the reachability probe on the connect
  // screen is what decides, and it asks the node rather than guessing.
  it('accepts any http origin, leaving the probe to disprove it', () => {
    expect(readScannedEndpoint('https://example.com/some/page')).toBe('https://example.com');
  });
});
