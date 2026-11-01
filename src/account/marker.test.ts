import { describe, expect, it } from 'vitest';
import { describeAccount, offersLogin } from './marker';
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

  // `allow_anonymous: false`: the mint is refused, so no whoami ever answers.
  it('offers a login when the cluster refused a guest session', () => {
    const refused = { kind: 'denied', reason: 'no-session' } as const;
    expect(describeAccount({ known: false }, refused)).toEqual({ kind: 'required' });
    expect(describeAccount({ known: true, session: session({ username: 'anonymous' }) }, refused)).toEqual({ kind: 'required' });
    expect(offersLogin(describeAccount({ known: false }, refused))).toBe(true);
    // Only a refusal of the session itself; an unknown answer stays silent.
    expect(describeAccount({ known: false }, { kind: 'unknown' })).toEqual({ kind: 'unknown' });
    expect(describeAccount({ known: true, session: session({ username: 'anonymous' }) }, { kind: 'denied', reason: 'no-roles' })).toEqual({ kind: 'anonymous' });
  });

  it('keeps a named session over a refused mint', () => {
    expect(
      describeAccount({ known: true, session: session({ username: 'tom' }) }, { kind: 'denied', reason: 'no-session' }),
    ).toMatchObject({ kind: 'signedIn' });
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
