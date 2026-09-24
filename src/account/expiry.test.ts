import { describe, expect, it } from 'vitest';
import type { CurrentSession } from '@machafoundation/core';
import { EXPIRY_WARNING_MS, sessionEndedNotice, sessionExpiryNotice } from './expiry';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 24, 12);

function signedIn(expiresInMs: number): { session: CurrentSession; known: boolean } {
  return { known: true, session: { username: 'tom', roles: ['media_viewer'], expires_unix_ms: NOW + expiresInMs } };
}

/**
 * At 30 days core re-mints with no credentials, and a signed-in viewer becomes
 * anonymous mid-use with nothing said. The expiry is known in advance, so the
 * viewer is asked to log in again before it arrives.
 */
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

  // Anonymous sessions expire too, and are re-minted as the same nobody: there
  // is nothing to lose and nothing to log back in to.
  it('never warns a viewer who is not signed in', () => {
    const anonymous = { known: true, session: { username: 'anonymous', roles: [], expires_unix_ms: NOW + HOUR } };
    expect(sessionExpiryNotice(anonymous, NOW)).toBeUndefined();
    expect(sessionExpiryNotice({ known: false }, NOW)).toBeUndefined();
  });

  // Past its expiry the session has already been replaced; a warning about the
  // future would be describing the past.
  it('says nothing once the expiry has passed', () => {
    expect(sessionExpiryNotice(signedIn(-HOUR), NOW)).toBeUndefined();
  });
});

/**
 * After the fact: a named account's session was replaced by one that is not
 * signed in. Core records it in `lastIdentityChange` and says nothing about
 * why, because a 401 cannot tell an expiry from a revoke or a password change.
 * So neither does this.
 */
describe('sessionEndedNotice', () => {
  const anonymous = { known: true, session: { username: 'anonymous', roles: ['media_viewer' as const], expires_unix_ms: NOW + DAY } };

  it('tells a viewer whose login was replaced by an anonymous session', () => {
    const notice = sessionEndedNotice({ ...anonymous, identityChange: { from: 'tom', to: 'anonymous', at: NOW } });
    expect(notice?.title).toBe('You have been logged out');
    expect(notice?.detail).toContain('tom');
    expect(notice?.detail).not.toMatch(/expired/);
  });

  // Logging in is a change too, anonymous to named, and is not news.
  it('says nothing about a login, or when nobody named was signed in before', () => {
    expect(sessionEndedNotice({ ...signedIn(DAY), identityChange: { from: 'anonymous', to: 'tom', at: NOW } })).toBeUndefined();
    expect(sessionEndedNotice({ ...anonymous, identityChange: { to: 'anonymous', at: NOW } })).toBeUndefined();
    expect(sessionEndedNotice(anonymous)).toBeUndefined();
  });

  // Unknown is not "signed out": the cluster has not said who this is.
  it('claims nothing while the current session is unknown', () => {
    expect(sessionEndedNotice({ known: false, identityChange: { from: 'tom', to: 'anonymous', at: NOW } })).toBeUndefined();
  });
});
