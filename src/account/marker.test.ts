import { describe, expect, it } from 'vitest';
import { describeAccount } from './marker';
import type { CurrentSession } from '@machafoundation/core';

const session = (fields: Partial<CurrentSession>): CurrentSession => ({
  roles: [],
  expires_unix_ms: 0,
  ...fields,
});

describe('describeAccount', () => {
  // The distinction the whole type exists for. An unanswered question must not
  // render as "nobody is signed in": that is a claim, and the cluster has not
  // made it.
  it('says nothing when the cluster has not answered', () => {
    expect(describeAccount({ known: false })).toEqual({ kind: 'unknown' });
    expect(describeAccount({ known: false, session: session({ username: 'tom' }) })).toEqual({ kind: 'unknown' });
  });

  // A node with sessions but no accounts answers the whoami with an id, roles
  // and timestamps and no user. There is nothing to log in to on one.
  it('separates a server that named no user from one that named the anonymous account', () => {
    expect(describeAccount({ known: true, session: session({}) })).toEqual({ kind: 'unstated' });
    expect(describeAccount({ known: true, session: session({ username: '   ' }) })).toEqual({ kind: 'unstated' });
    expect(describeAccount({ known: true, session: session({ username: 'anonymous' }) })).toEqual({ kind: 'anonymous' });
  });

  it('reads a signed-in account and its badge letter', () => {
    expect(describeAccount({ known: true, session: session({ username: 'tom' }) })).toEqual({
      kind: 'signedIn',
      username: 'tom',
      initial: 'T',
    });
  });

  it('does not split a name that starts outside the basic plane', () => {
    // `'\u{1D57D}om'[0]` is half a surrogate pair and renders as a replacement
    // character; the badge has to take a whole code point.
    expect(describeAccount({ known: true, session: session({ username: '\u{1D57D}om' }) })).toMatchObject({
      initial: '\u{1D57D}',
    });
    expect(describeAccount({ known: true, session: session({ username: 'émile' }) })).toMatchObject({ initial: 'É' });
  });
});
