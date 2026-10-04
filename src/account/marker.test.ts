import { describe, expect, it } from 'vitest';
import { describeAccount } from './marker';
import type { CurrentSession } from '@machafoundation/core';

const session = (fields: Partial<CurrentSession>): CurrentSession => ({
  roles: [],
  expires_unix_ms: 0,
  ...fields,
});

describe('describeAccount', () => {
  it('says nothing when the cluster has not answered', () => {
    expect(describeAccount({ known: false })).toEqual({ kind: 'unknown' });
    expect(describeAccount({ known: false, session: session({ username: 'tom' }) })).toEqual({ kind: 'unknown' });
  });

  // A node without accounts answers the whoami with no user.
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
    // `'\u{1D57D}om'[0]` would be half a surrogate pair.
    expect(describeAccount({ known: true, session: session({ username: '\u{1D57D}om' }) })).toMatchObject({
      initial: '\u{1D57D}',
    });
    expect(describeAccount({ known: true, session: session({ username: 'émile' }) })).toMatchObject({ initial: 'É' });
  });
});
