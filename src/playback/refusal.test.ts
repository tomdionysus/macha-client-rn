import { describe, expect, it } from 'vitest';
import { endpointFailure, MachaApiError, MachaClusterRouteError, MachaPlaybackError, START_NO_PROGRESS_CODE } from '@machafoundation/core';
import { accountSessionLimitMessage, classifyCreateRefusal, createFailureMessage, seekRefusalMessage, spendsFailoverBudget } from './policy';

// Core raises `MachaPlaybackError`, not `MachaApiError`; both carry the same
// fields, which is why the classifier is duck-typed.
describe('the two error classes on the create path', () => {
  it('proves core\'s playback error is not the api error', () => {
    // An `instanceof MachaApiError` test would never match core's errors.
    expect(new MachaPlaybackError('refused', 400) instanceof MachaApiError).toBe(false);
  });
});

describe('classifyCreateRefusal', () => {
  it('degrades an instruction the node refused, whichever class carries it', () => {
    expect(classifyCreateRefusal(new MachaPlaybackError('unsupported transform', 400))).toBe('degrade');
    expect(classifyCreateRefusal(new MachaApiError('unsupported transform', 400))).toBe('degrade');
  });

  // The cap is the account's, identical on every node, so asking for less cannot help.
  it('names the account session cap and does not call it degradable', () => {
    const capped = new MachaPlaybackError(
      'account already holds 3 playback sessions (limit 3)',
      429,
      // The wire code is spelled out here to pin the server contract; production uses core's predicate.
      'account_session_limit',
      5_000,
    );
    expect(classifyCreateRefusal(capped)).toBe('account-session-limit');
  });

  // A node-wide limit is that node being full: core walks on, and it is not the account cap.
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
    // Core's envelope reads as a breakage when the node is working as designed.
    expect(message).not.toContain('request failed');
    // The server's limit and count are the only figures this client sees, so they are kept.
    expect(message).toContain('limit 3');
  });

  it('still says something useful when the node offered no detail', () => {
    expect(accountSessionLimitMessage(undefined)).toContain('Stop playback elsewhere');
  });

  it('quotes the server through the cluster wrapper, and not the node address with it', () => {
    // Built from the wrapped error, so neither prefix nor node address reaches the viewer.
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

// `MachaEndpointError` carries no `status` or `code`; both sit one level down
// in `cause`, so a classifier must look through it.
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
    // A hung failure report is worse than a less specific one.
    const a: { status?: number; cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(classifyCreateRefusal(a)).toBe('fatal');
  });
});

// An account cap is not a node failing, so it must not spend failover budget.
describe('spendsFailoverBudget', () => {
  it('does not spend the budget on the account cap', () => {
    const capped = new MachaPlaybackError('account already holds 3 sessions (limit 3)', 429, 'account_session_limit');
    expect(spendsFailoverBudget(capped)).toBe(false);
    // Also through core's wrapper, which is how it arrives.
    expect(spendsFailoverBudget(endpointFailure('e1', 'http://node.example', capped))).toBe(false);
  });

  it('spends it on everything the budget is actually for', () => {
    // A full node should cost an attempt: trying another is the right remedy.
    expect(spendsFailoverBudget(new MachaPlaybackError('node is full', 429, 'resource_limit'))).toBe(true);
    expect(spendsFailoverBudget(new MachaPlaybackError('broken', 500))).toBe(true);
    expect(spendsFailoverBudget(new Error('transport'))).toBe(true);
    expect(spendsFailoverBudget(undefined)).toBe(true);
  });
});

/** What a viewer reads when a title will not start: never `.message`, one plain sentence per failure kind, the server's reason in brackets. */
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
    // Node-wide `resource_limit` is not the account cap.
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

  it('says no server answered when every node was tried and none was reached (web `043fd81`)', () => {
    const exhausted = new MachaClusterRouteError(['a', 'b'], true, node(new TypeError('Network request failed')));
    expect(createFailureMessage(exhausted)).toBe(
      'No Macha server answered. Try again in a moment; if it keeps happening, check that the servers are running.',
    );
  });

  it('tells a signed-out viewer to log in, without the token sentence', () => {
    // The server's token sentence is true but useless to the viewer.
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

  it('says a start stopped progressing in the web\'s words, from core\'s code rather than its 504', () => {
    // Raised by core (`start=async`) with no server sentence; "could not start" would blame the server.
    const stalled = new MachaPlaybackError('Macha playback start made no progress for 17000 ms.', 504, START_NO_PROGRESS_CODE);
    expect(createFailureMessage(node(stalled))).toBe('The node stopped making progress starting this stream.');
  });

  it('still says something true when nothing is known', () => {
    expect(createFailureMessage(undefined)).toBe('This title could not be started. Try again.');
    expect(createFailureMessage(new Error('Macha endpoint x failed: something internal'))).toBe(
      'This title could not be started. Try again.',
    );
  });
});

/** What a viewer reads when a rebuilding seek was refused: the player has not moved and may be paused. */
describe('seekRefusalMessage', () => {
  const node = (inner: unknown) => endpointFailure('https://macnessa.macha.network', 'https://macnessa.macha.network', inner);
  const server = (sentence: string, status: number, code?: string) =>
    new MachaPlaybackError(`Macha playback request failed: ${sentence}`, status, code, undefined, undefined, sentence);

  it('says the jump did not happen, and quotes the node', () => {
    expect(seekRefusalMessage(node(server('timed out waiting for first fragmented-MP4 segment', 503)))).toBe(
      'Could not jump to that point just now, so playback stayed where it was. (timed out waiting for first fragmented-MP4 segment)',
    );
  });

  it('never shows core’s envelopes or the node address', () => {
    const message = seekRefusalMessage(node(server('video transcode limit reached', 429, 'resource_limit')));
    expect(message).not.toContain('Macha');
    expect(message).not.toContain('macnessa');
  });

  it('stands alone when nothing was stated', () => {
    expect(seekRefusalMessage(node(new TypeError('Network request failed')))).toBe(
      'Could not jump to that point just now, so playback stayed where it was.',
    );
  });
});
