import { describe, expect, it } from 'vitest';
import { endpointFailure, MachaPlaybackError } from '@machafoundation/core';
import { MachaApiError } from '../api/errors';
import { accountSessionLimitMessage, classifyCreateRefusal, spendsFailoverBudget } from './policy';

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
      // The wire code, spelled here deliberately: a test is the right place to
      // hold the server's contract, and core's predicate is what production
      // uses so no source file restates it.
      'account_session_limit',
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
      new MachaPlaybackError(
        'Macha playback request failed: account already holds 3 sessions (limit 3)',
        429,
        'account_session_limit',
        undefined,
        undefined,
        'account already holds 3 sessions (limit 3)',
      ),
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

  it('quotes the server through the cluster wrapper, and not the node address with it', () => {
    // The cap is found through `endpointFailure` (see below), so the message
    // is built from the wrapped error too. Taking off one known prefix left
    // the other, and the node's address, in front of the viewer.
    const inner = new MachaPlaybackError(
      'Macha playback request failed: account already holds 3 sessions (limit 3)',
      429,
      'account_session_limit',
      undefined,
      undefined,
      'account already holds 3 sessions (limit 3)',
    );
    const message = accountSessionLimitMessage(endpointFailure('endpoint-1', 'http://node.example', inner));
    expect(message).toContain('(account already holds 3 sessions (limit 3))');
    expect(message).not.toContain('endpoint-1');
    expect(message).not.toContain('Macha');
  });
});

// Core wraps a node's refusal in `MachaEndpointError` before it leaves the
// resolver, and that wrapper carries no `status` and no `code` of its own —
// both sit one link down in `cause`. A classifier that reads only the
// outermost object sees neither and calls everything fatal, which is the same
// defect as the `instanceof` test, one layer out.
describe('a refusal wrapped by the cluster layer', () => {
  const wrapped = (inner: unknown) => endpointFailure('endpoint-1', 'http://node.example', inner);

  it('finds the account cap through the wrapper', () => {
    const capped = new MachaPlaybackError('account already holds 3 sessions (limit 3)', 429, 'account_session_limit');
    expect(classifyCreateRefusal(wrapped(capped))).toBe('account-session-limit');
  });

  it('finds a degradable instruction refusal through the wrapper', () => {
    expect(classifyCreateRefusal(wrapped(new MachaPlaybackError('unsupported transform', 400)))).toBe('degrade');
  });

  it('still does not mistake a wrapped node-wide limit for the account cap', () => {
    expect(classifyCreateRefusal(wrapped(new MachaPlaybackError('node is full', 429, 'resource_limit')))).toBe('fatal');
  });

  it('survives a cause cycle rather than hanging on one', () => {
    // A viewer waiting on a hung failure report is strictly worse than one
    // told slightly less — core's rule, and this walk has to hold it too.
    const a: { status?: number; cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(classifyCreateRefusal(a)).toBe('fatal');
  });
});

// The failover budget exists to stop a broken title cycling nodes. An account
// cap is not a node failing, so spending recovery budget on it leaves a later
// genuine failure with none — the client-side mirror of core charging every
// healthy node it walked for an account-scoped refusal.
describe('spendsFailoverBudget', () => {
  it('does not spend the budget on the account cap', () => {
    const capped = new MachaPlaybackError('account already holds 3 sessions (limit 3)', 429, 'account_session_limit');
    expect(spendsFailoverBudget(capped)).toBe(false);
    // And through core's wrapper, which is how it actually arrives.
    expect(spendsFailoverBudget(endpointFailure('e1', 'http://node.example', capped))).toBe(false);
  });

  it('spends it on everything the budget is actually for', () => {
    // A node-wide limit is a node that really is full: trying another one is
    // the right remedy and it should cost an attempt.
    expect(spendsFailoverBudget(new MachaPlaybackError('node is full', 429, 'resource_limit'))).toBe(true);
    expect(spendsFailoverBudget(new MachaPlaybackError('broken', 500))).toBe(true);
    expect(spendsFailoverBudget(new Error('transport'))).toBe(true);
    expect(spendsFailoverBudget(undefined)).toBe(true);
  });
});
