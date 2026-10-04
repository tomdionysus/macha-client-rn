import { describe, expect, it } from 'vitest';
import type { CurrentSession } from '@machafoundation/core';
import { EXPIRY_WARNING_MS, sessionEndedNotice, sessionExpiryNotice } from './expiry';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 24, 12);

function signedIn(expiresInMs: number): { session: CurrentSession; known: boolean } {
  return { known: true, session: { username: 'tom', roles: ['media_viewer'], expires_unix_ms: NOW + expiresInMs } };
}

describe('sessionExpiryNotice', () => {
  it('says nothing while the login has longer than the warning window left', () => {
    expect(sessionExpiryNotice(signedIn(EXPIRY_WARNING_MS + HOUR), NOW)).toBeUndefined();
  });

  it('warns inside the window, saying how long is left', () => {
    expect(sessionExpiryNotice(signedIn(2 * DAY + HOUR), NOW)?.title).toBe('Your login expires in 3 days');
    expect(sessionExpiryNotice(signedIn(5 * HOUR + 1), NOW)?.title).toBe('Your login expires in 6 hours');
    expect(sessionExpiryNotice(signedIn(20 * 60 * 1000), NOW)?.title).toBe('Your login expires in less than an hour');
    expect(sessionExpiryNotice(signedIn(HOUR), NOW)?.title).toBe('Your login expires in 1 hour');
    expect(sessionExpiryNotice(signedIn(DAY), NOW)?.title).toBe('Your login expires in 1 day');
  });

  it('never warns a viewer who is not signed in', () => {
    const anonymous = { known: true, session: { username: 'anonymous', roles: [], expires_unix_ms: NOW + HOUR } };
    expect(sessionExpiryNotice(anonymous, NOW)).toBeUndefined();
    expect(sessionExpiryNotice({ known: false }, NOW)).toBeUndefined();
  });

  it('says nothing once the expiry has passed', () => {
    expect(sessionExpiryNotice(signedIn(-HOUR), NOW)).toBeUndefined();
  });
});

describe('sessionEndedNotice', () => {
  const anonymous = { known: true, session: { username: 'anonymous', roles: ['media_viewer' as const], expires_unix_ms: NOW + DAY } };

  it('tells a viewer whose login was replaced by an anonymous session', () => {
    const notice = sessionEndedNotice({ ...anonymous, identityChange: { from: 'tom', to: 'anonymous', at: NOW } });
    expect(notice?.title).toBe('You have been logged out');
    expect(notice?.detail).toContain('tom');
    expect(notice?.detail).not.toMatch(/expired/);
  });

  it('says nothing about a login, or when nobody named was signed in before', () => {
    expect(sessionEndedNotice({ ...signedIn(DAY), identityChange: { from: 'anonymous', to: 'tom', at: NOW } })).toBeUndefined();
    expect(sessionEndedNotice({ ...anonymous, identityChange: { to: 'anonymous', at: NOW } })).toBeUndefined();
    expect(sessionEndedNotice(anonymous)).toBeUndefined();
  });

  it('claims nothing while the current session is unknown', () => {
    expect(sessionEndedNotice({ known: false, identityChange: { from: 'tom', to: 'anonymous', at: NOW } })).toBeUndefined();
  });
});
