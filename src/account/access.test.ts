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

  // Roles are capabilities rather than a ladder, so nothing else implies this
  // one. A manager who is not also a viewer genuinely may not read the
  // catalogue, and the server says so.
  it('does not let another role stand in for the media role', () => {
    expect(describeMediaAccess(facts({ session: session({ roles: ['manager', 'manage_users'] }) }))).toEqual({
      kind: 'denied',
      reason: 'no-role',
    });
  });

  it('denies a session that carries no roles at all, and says so distinctly', () => {
    // Changed from `no-role` on 2026-09-21, on Tom's instruction to all three
    // clients. An empty array is not "the wrong role": it is a session granted
    // nothing, which core says means either a registered-users-only cluster
    // (removing `media_viewer` from the anonymous account is how that is
    // configured, server 0.38.4) or a signed-in viewer degraded to anonymous
    // by a credential-less re-mint. Both are answered by signing in, and
    // neither by asking an administrator for a role — so the two denials must
    // not share a message.
    //
    // The television observation that prompted the instruction was retracted
    // the same evening: it had not verified which control it pressed, and an
    // anonymous role-less session is also what exists *before* signing in, so
    // its 403 was equally consistent with the sign-in never happening. **The
    // rule survives the evidence for it** — the remedy distinction is right
    // whether or not any device has demonstrated the degradation — but it is
    // not cited here as a measurement, because it is not one.
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

  // The branch this type exists for, and the one a two-state gate gets wrong.
  // Each of these would read as "denied" to an implementation that treated
  // absent roles as refusal, and each would put a fully privileged viewer on a
  // login screen.
  describe('does not mistake silence for refusal', () => {
    it('while the session lifecycle is still running', () => {
      expect(describeMediaAccess(facts({ settled: false, hasToken: false, known: false }))).toEqual({ kind: 'unknown' });
    });

    it('when a mint failed in transport rather than being refused', () => {
      // Offline. The cluster has said nothing, so neither do we — this is what
      // keeps a phone away from home out of the login screen.
      expect(describeMediaAccess(facts({ hasToken: false, known: false }))).toEqual({ kind: 'unknown' });
    });

    it('when a token exists but the whoami has not come back', () => {
      expect(describeMediaAccess(facts({ known: false }))).toEqual({ kind: 'unknown' });
      expect(describeMediaAccess(facts({ known: true, session: undefined }))).toEqual({ kind: 'unknown' });
    });

    // A settled lifecycle that produced a token still says nothing about roles
    // until the whoami lands. Reading the absent session as "no roles" is the
    // same error wearing a different hat.
    it('even though the lifecycle has settled and holds a token', () => {
      expect(describeMediaAccess(facts({ settled: true, hasToken: true, known: false }))).toEqual({ kind: 'unknown' });
    });
  });

  // A refusal outranks a missing whoami: the node has already answered the only
  // question that matters, so waiting for a second answer would strand the gate.
  it('prefers a stated refusal over an unanswered whoami', () => {
    expect(describeMediaAccess(facts({ mintRefused: true, hasToken: false, known: false, session: undefined }))).toEqual({
      kind: 'denied',
      reason: 'no-session',
    });
  });
});

describe('mayRequestMedia', () => {
  // Optimistic on unknown, deliberately. The server is the real gate; this only
  // decides whether asking is worth the round trip, and refusing to ask while
  // we do not know is how an app locks out the people it should serve.
  it('asks the cluster unless it has actually been refused', () => {
    expect(mayRequestMedia({ kind: 'granted' })).toBe(true);
    expect(mayRequestMedia({ kind: 'unknown' })).toBe(true);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-role' })).toBe(false);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-roles' })).toBe(false);
    expect(mayRequestMedia({ kind: 'denied', reason: 'no-session' })).toBe(false);
  });
});

