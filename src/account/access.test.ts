import { describe, expect, it } from 'vitest';
import { describeMediaAccess, mayRequestMedia, type AccessFacts } from './access';
import type { CurrentSession } from '@machafoundation/core';

const session = (fields: Partial<CurrentSession>): CurrentSession => ({
  roles: [],
  expires_unix_ms: 0,
  ...fields,
});

/** A settled lifecycle holding a token, which is the ordinary case. */
const facts = (overrides: Partial<AccessFacts> = {}): AccessFacts => ({
  settled: true,
  hasToken: true,
  mintRefused: false,
  known: true,
  ...overrides,
});

describe('describeMediaAccess', () => {
  it('grants a session carrying the media role', () => {
    expect(describeMediaAccess(facts({ session: session({ roles: ['media_viewer'] }) }))).toEqual({ kind: 'granted' });
  });

  // Roles are capabilities, not a ladder.
  it('does not let another role stand in for the media role', () => {
    expect(describeMediaAccess(facts({ session: session({ roles: ['manager', 'manage_users'] }) }))).toEqual({
      kind: 'denied',
      reason: 'no-role',
    });
  });

  it('denies a session that carries no roles at all, and says so distinctly', () => {
    // The remedy differs from `no-role`: sign in, not ask an admin for a role.
    expect(describeMediaAccess(facts({ session: session({ roles: [] }) }))).toEqual({
      kind: 'denied',
      reason: 'no-roles',
    });
  });

  it('denies when a node refused to mint a session', () => {
    expect(describeMediaAccess(facts({ mintRefused: true, hasToken: false, known: false }))).toEqual({
      kind: 'denied',
      reason: 'no-session',
    });
  });

  // Reading any of these as denied would put a privileged viewer on a login screen.
  describe('does not mistake silence for refusal', () => {
    it('while the session lifecycle is still running', () => {
      expect(describeMediaAccess(facts({ settled: false, hasToken: false, known: false }))).toEqual({ kind: 'unknown' });
    });

    it('when a mint failed in transport rather than being refused', () => {
      expect(describeMediaAccess(facts({ hasToken: false, known: false }))).toEqual({ kind: 'unknown' });
    });

    it('when a token exists but the whoami has not come back', () => {
      expect(describeMediaAccess(facts({ known: false }))).toEqual({ kind: 'unknown' });
      expect(describeMediaAccess(facts({ known: true, session: undefined }))).toEqual({ kind: 'unknown' });
    });

    it('even though the lifecycle has settled and holds a token', () => {
      expect(describeMediaAccess(facts({ settled: true, hasToken: true, known: false }))).toEqual({ kind: 'unknown' });
    });
  });

  it('prefers a stated refusal over an unanswered whoami', () => {
    expect(describeMediaAccess(facts({ mintRefused: true, hasToken: false, known: false, session: undefined }))).toEqual({
      kind: 'denied',
      reason: 'no-session',
    });
  });
});

describe('mayRequestMedia', () => {
  it('asks the cluster unless it has actually been refused', () => {
    expect(mayRequestMedia({ kind: 'granted' })).toBe(true);
    expect(mayRequestMedia({ kind: 'unknown' })).toBe(true);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-role' })).toBe(false);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-roles' })).toBe(false);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-session' })).toBe(false);
  });
});

