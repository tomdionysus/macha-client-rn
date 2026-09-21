import { describe, expect, it } from 'vitest';
import { MachaPlaybackError } from '@machafoundation/core';
import { MachaApiError } from '../api/errors';
import { accountSessionLimitMessage, ACCOUNT_SESSION_LIMIT_CODE, classifyCreateRefusal } from './policy';

// Core's resolver raises its own `MachaPlaybackError`, not this client's
// `MachaApiError`. That is the whole reason this classifier is duck-typed:
// two classes carry the same four fields, and core itself reads `code` and
// `reason` off the object rather than testing identity.
describe('the two error classes on the create path', () => {
  it('proves core\'s playback error is not this client\'s api error', () => {
    // `createSession` tested `error instanceof MachaApiError` before deciding
    // whether to degrade. Core throws the other class, so that branch could
    // never be taken and every refusal was fatal.
    expect(new MachaPlaybackError('refused', 400) instanceof MachaApiError).toBe(false);
  });
});

describe('classifyCreateRefusal', () => {
  it('degrades an instruction the node refused, whichever class carries it', () => {
    expect(classifyCreateRefusal(new MachaPlaybackError('unsupported transform', 400))).toBe('degrade');
    expect(classifyCreateRefusal(new MachaApiError('unsupported transform', 400))).toBe('degrade');
  });

  // The new outcome from the REST-resource change. The cap is a fact about the
  // account, identical on every node, and it is not about the instruction — so
  // asking for less would not help and must not be tried.
  it('names the account session cap and does not call it degradable', () => {
    const capped = new MachaPlaybackError(
      'account already holds 3 playback sessions (limit 3)',
      429,
      ACCOUNT_SESSION_LIMIT_CODE,
      5_000,
    );
    expect(classifyCreateRefusal(capped)).toBe('account-session-limit');
  });

  // A node-wide limit is a different scope with a different remedy: core walks
  // and charges, correctly, because that node really is full. It must not be
  // reported to the viewer as their own account being at its limit.
  it('does not mistake a node-wide limit for the account cap', () => {
    expect(classifyCreateRefusal(new MachaPlaybackError('node is full', 429, 'resource_limit'))).toBe('fatal');
  });

  it('treats anything else as fatal', () => {
    expect(classifyCreateRefusal(new MachaPlaybackError('gone', 404))).toBe('fatal');
    expect(classifyCreateRefusal(new MachaPlaybackError('broken', 500))).toBe('fatal');
    expect(classifyCreateRefusal(new Error('something'))).toBe('fatal');
    expect(classifyCreateRefusal(undefined)).toBe('fatal');
  });
});

describe('accountSessionLimitMessage', () => {
  it('leads with what the viewer can do, not with a failure', () => {
    const message = accountSessionLimitMessage(
      new MachaPlaybackError('Macha playback request failed: account already holds 3 sessions (limit 3)', 429),
    );
    expect(message).toContain('Stop playback elsewhere');
    // Core's wrapper reads as a breakage and the node is working as designed.
    expect(message).not.toContain('request failed');
    // The server states the limit and the count; they are the only figures
    // this client can see, so they are kept rather than discarded.
    expect(message).toContain('limit 3');
  });

  it('still says something useful when the node offered no detail', () => {
    expect(accountSessionLimitMessage(undefined)).toContain('Stop playback elsewhere');
  });
});
