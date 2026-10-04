import {
  MachaApiError,
  MachaClusterRouteError,
  MachaConnectionError,
  MachaEndpointError,
  MachaUsersApiError,
  SessionAuthError,
} from '@machafoundation/core';
import { describe, expect, it } from 'vitest';
import {
  downloadFailureMessage,
  loadFailureMessage,
  refreshFailureMessage,
  signInFailureMessage,
  signOutFailureMessage,
} from './failureMessages';

// Core's endpoint wrapper around its API error. Only `detail` is the server's;
// every `message` is core's log text.
function wrapped(inner: Error): MachaEndpointError {
  return new MachaEndpointError(
    `Macha endpoint https://macnessa.macha.network failed: ${inner.message}`,
    'https://macnessa.macha.network',
    'https://macnessa.macha.network',
    'transport',
    inner,
  );
}

const LOG_TEXT = /Macha endpoint|request failed|macnessa/;

describe('failure messages never show core\'s log text', () => {
  const catalogue500 = wrapped(new MachaApiError('Macha catalogue request failed: database is locked', 500, 'internal', 'database is locked'));
  const users401 = wrapped(new MachaUsersApiError('Macha users request failed: invalid credentials', 401, 'unauthorized', 'invalid credentials'));

  it.each([
    ['load', () => loadFailureMessage(catalogue500)],
    ['refresh', () => refreshFailureMessage(catalogue500)],
    ['sign-in', () => signInFailureMessage(users401)],
    ['sign-out', () => signOutFailureMessage(catalogue500)],
    ['download', () => downloadFailureMessage(catalogue500)],
  ])('%s', (_site, message) => {
    expect(message()).not.toMatch(LOG_TEXT);
  });

  it('quotes the server where it stated a reason', () => {
    expect(loadFailureMessage(catalogue500)).toContain('(database is locked)');
    expect(signInFailureMessage(new SessionAuthError('x', 403, 'anonymous_disabled', 'anonymous access is disabled'))).toContain(
      '(anonymous access is disabled)',
    );
  });

  it('says nothing of its own invention when the server said nothing', () => {
    const bare = wrapped(new MachaApiError('Macha catalogue request failed: 500 Internal Server Error', 500));
    expect(loadFailureMessage(bare)).not.toContain('(');
    expect(downloadFailureMessage(new Error('ENOSPC: no space left on device, write'))).not.toContain('ENOSPC');
  });
});

describe('failure messages are keyed on what happened', () => {
  it('claims "could not reach" only for a transport failure', () => {
    for (const error of [
      new MachaConnectionError('fetch failed'),
      wrapped(new MachaConnectionError('fetch failed')),
      new TypeError('Network request failed'),
    ]) {
      expect(loadFailureMessage(error)).toMatch(/Could not reach the server/);
    }
    // Core files a wrapped refusal under `transport` too; the status decides.
    expect(loadFailureMessage(wrapped(new MachaApiError('x', 403, 'forbidden')))).not.toMatch(/Could not reach/);
  });

  it('says no server answered when the route tried every node and reached none', () => {
    const exhausted = new MachaClusterRouteError(['a', 'b'], true, new MachaConnectionError('fetch failed'));
    expect(loadFailureMessage(exhausted)).toBe(
      'No Macha server answered. Try again in a moment; if it keeps happening, check that the servers are running.',
    );
  });

  it('reads the status through every wrapper', () => {
    const refused = new MachaClusterRouteError(['a'], false, wrapped(new MachaApiError('x', 401, 'unauthorized')));
    expect(loadFailureMessage(refused)).toMatch(/not logged in/);
    expect(loadFailureMessage(wrapped(new MachaApiError('x', 403, 'forbidden')))).toMatch(/not allowed/);
    expect(loadFailureMessage(wrapped(new MachaApiError('x', 429, 'rate_limited')))).toMatch(/busy/);
  });

  // Must not reveal whether the username exists.
  it('gives one sentence for any refused sign-in', () => {
    const wrongPassword = signInFailureMessage(new SessionAuthError('x', 401, 'unauthorized'));
    const unknownUser = signInFailureMessage(new SessionAuthError('y', 401, 'unauthorized'));
    expect(wrongPassword).toBe(unknownUser);
    expect(wrongPassword).toMatch(/username or password/);
  });

  it('says the phone is signed out when only the revoke failed', () => {
    expect(signOutFailureMessage(new MachaConnectionError('fetch failed'))).toMatch(/^Logged out on this device/);
  });
});
