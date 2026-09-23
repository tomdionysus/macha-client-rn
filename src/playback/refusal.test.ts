import { describe, expect, it } from 'vitest';
import { endpointFailure, MachaPlaybackError } from '@machafoundation/core';
import { MachaApiError } from '../api/errors';
import { accountSessionLimitMessage, classifyCreateRefusal, createFailureMessage, spendsFailoverBudget } from './policy';

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

/**
 * What a viewer reads when a title will not start.
 *
 * **Before 2026-09-23 this was `describeError`, which is `.message`** — so
 * every create refusal but the account cap reached the screen as core's log
 * line: *"Macha endpoint https://macnessa.macha.network failed: Macha
 * playback request failed: ..."*, both envelopes and the node's address.
 *
 * Tom's rule, 2026-09-23: it depends on the error, it must be something a
 * person can understand, and it must be honest. So one sentence per kind of
 * failure, saying what is known, and the server's own reason in brackets
 * where it gave one.
 */
describe('createFailureMessage', () => {
  const node = (inner: unknown) => endpointFailure('https://macnessa.macha.network', 'https://macnessa.macha.network', inner);
  const server = (sentence: string, status: number, code?: string) =>
    new MachaPlaybackError(`Macha playback request failed: ${sentence}`, status, code, undefined, undefined, sentence);

  it('never shows core’s envelopes or the node address', () => {
    const message = createFailureMessage(node(server('timed out waiting for first fragmented-MP4 segment', 503, 'playback_pipeline_start_failed')));
    expect(message).not.toContain('Macha');
    expect(message).not.toContain('macnessa');
    expect(message).not.toContain('failed:');
  });

  it('says the server could not start the stream, and quotes why', () => {
    expect(createFailureMessage(node(server('timed out waiting for first fragmented-MP4 segment', 503)))).toBe(
      'The server could not start this stream. Try again in a moment. (timed out waiting for first fragmented-MP4 segment)',
    );
  });

  it('says a full node is busy, not that the account is at its limit', () => {
    // Node-wide `resource_limit` is a different scope from the account cap;
    // telling the viewer their own account is full would be a lie.
    expect(createFailureMessage(node(server('video transcode limit reached', 429, 'resource_limit')))).toBe(
      'The server is busy with other streams right now. Try again in a few minutes. (video transcode limit reached)',
    );
  });

  it('keeps the account-cap sentence for the account cap', () => {
    const capped = server('account already holds 32 sessions (limit 32)', 429, 'account_session_limit');
    expect(createFailureMessage(node(capped))).toContain('Stop playback elsewhere');
  });

  it('says the server could not be reached when nothing answered', () => {
    expect(createFailureMessage(node(new TypeError('Network request failed')))).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('tells a signed-out viewer to log in, without the token sentence', () => {
    // "a valid session bearer token is required" is true and useless.
    expect(createFailureMessage(node(server('a valid session bearer token is required', 401, 'unauthorized')))).toBe(
      'You are not logged in. Log in and try again.',
    );
  });

  it('tells a viewer without permission which account problem it is', () => {
    expect(createFailureMessage(node(server('playback role required', 403, 'forbidden')))).toBe(
      'This account is not allowed to play this. Log in with an account that is.',
    );
  });

  it('says a missing title is missing', () => {
    expect(createFailureMessage(node(server('item not found', 404, 'not_found')))).toBe(
      'This title is no longer on the server. (item not found)',
    );
  });

  it('says a refused request plainly when every fallback was refused too', () => {
    expect(createFailureMessage(node(server('unsupported transform', 400)))).toBe(
      'The server could not prepare this title for this device. (unsupported transform)',
    );
  });

  it('still says something true when nothing is known', () => {
    expect(createFailureMessage(undefined)).toBe('This title could not be started. Try again.');
    expect(createFailureMessage(new Error('Macha endpoint x failed: something internal'))).toBe(
      'This title could not be started. Try again.',
    );
  });
});
