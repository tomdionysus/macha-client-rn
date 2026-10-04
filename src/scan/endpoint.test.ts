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

  // Plain coercion would turn these into plausible endpoints no node answers on.
  it('refuses a scheme this client does not own', () => {
    expect(readScannedEndpoint('macha://pair?token=abc')).toBe('');
    expect(readScannedEndpoint('mailto:tom@example.com')).toBe('');
  });

  it('refuses a bare word', () => {
    expect(readScannedEndpoint('Macha')).toBe('');
  });

  it('refuses the codes a camera meets by accident', () => {
    expect(readScannedEndpoint('WIFI:S:home;T:WPA;P:hunter2;;')).toBe('');
    expect(readScannedEndpoint('BEGIN:VCARD\nFN:Tom\nEND:VCARD')).toBe('');
    expect(readScannedEndpoint('')).toBe('');
  });

  it('collapses machine-produced shapes to an origin', () => {
    expect(readScannedEndpoint('HTTP://HOST:7438/')).toBe('http://host:7438');
    expect(readScannedEndpoint('http://a:7438//')).toBe('http://a:7438');
    expect(readScannedEndpoint('http://a:7438/api/')).toBe('http://a:7438');
    expect(readScannedEndpoint('http://A.Local')).toBe('http://a.local:7438');
  });

  // The connect screen's probe decides whether it is really a node.
  it('accepts any http origin, leaving the probe to disprove it', () => {
    expect(readScannedEndpoint('https://example.com/some/page')).toBe('https://example.com');
  });
});
