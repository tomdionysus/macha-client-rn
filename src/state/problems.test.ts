import { describe, expect, it } from 'vitest';
import { clusterMediaUnavailable, describeEmptyLibrary, describeProblems, type ProblemFacts } from './problems';

const facts = (overrides: Partial<ProblemFacts> = {}): ProblemFacts => ({
  endpointsConfigured: true,
  networkDown: false,
  clusterUnreachable: false,
  access: { kind: 'granted' },
  ...overrides,
});

const kinds = (f: ProblemFacts) => describeProblems(f).map((problem) => problem.kind);

describe('describeProblems', () => {
  it('says nothing when nothing is wrong', () => {
    expect(describeProblems(facts())).toEqual([]);
  });

  it('reports an unconfigured client and nothing else', () => {
    // There is no cluster yet, so it cannot be unreachable or refuse us, and
    // saying so would be inventing two more problems out of one.
    expect(kinds(facts({ endpointsConfigured: false, networkDown: true, access: { kind: 'denied', reason: 'no-session' } }))).toEqual([
      'no-endpoints',
    ]);
  });

  // The distinction one boolean could not carry: both used to read "offline",
  // and only one of them is anything the viewer can act on.
  it('separates a device with no network from a cluster that will not answer', () => {
    expect(kinds(facts({ networkDown: true }))).toEqual(['network-down']);
    expect(kinds(facts({ clusterUnreachable: true }))).toEqual(['cluster-unreachable']);
  });

  it('does not report an unreachable cluster as a second problem when the network is down', () => {
    expect(kinds(facts({ networkDown: true, clusterUnreachable: true }))).toEqual(['network-down']);
  });

  it('distinguishes a cluster wanting an account from an account that may not view', () => {
    expect(kinds(facts({ access: { kind: 'denied', reason: 'no-session' } }))).toEqual(['account-required']);
    expect(kinds(facts({ access: { kind: 'denied', reason: 'no-role' } }))).toEqual(['account-cannot-view']);
  });

  // An account refusal outlives the outage, so it is not a consequence of one
  // and must not be swallowed by it — otherwise it appears only later, as a
  // surprise, once the network is back.
  it('reports an account refusal alongside an outage', () => {
    expect(kinds(facts({ networkDown: true, access: { kind: 'denied', reason: 'no-role' } }))).toEqual([
      'network-down',
      'account-cannot-view',
    ]);
  });

  // The branch the whole three-state access model exists to protect. Silence is
  // not a problem to report, or every cold start would raise one.
  it('reports nothing while access is merely unknown', () => {
    expect(kinds(facts({ access: { kind: 'unknown' } }))).toEqual([]);
  });

  it('gives every problem something a person can read', () => {
    for (const problem of describeProblems(facts({ networkDown: true, access: { kind: 'denied', reason: 'no-role' } }))) {
      expect(problem.title.length).toBeGreaterThan(0);
      expect(problem.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('clusterMediaUnavailable', () => {
  // Continue watching asked "are we offline", which is one of four ways the
  // answer is no. A refused cluster answers every request promptly and can
  // still play this viewer nothing.
  it('is true for a refusal, not only for an outage', () => {
    expect(clusterMediaUnavailable(describeProblems(facts()))).toBe(false);
    expect(clusterMediaUnavailable(describeProblems(facts({ clusterUnreachable: true })))).toBe(true);
    expect(clusterMediaUnavailable(describeProblems(facts({ access: { kind: 'denied', reason: 'no-role' } })))).toBe(true);
    expect(clusterMediaUnavailable(describeProblems(facts({ access: { kind: 'unknown' } })))).toBe(false);
  });
});

describe('describeEmptyLibrary', () => {
  const copy = (f: ProblemFacts) => describeEmptyLibrary('films', describeProblems(f));

  // The claim this client is only sometimes entitled to make. Saying it while
  // refused tells a viewer their library is empty when it is full.
  it('only blames the catalogue when it can actually see one', () => {
    expect(copy(facts()).title).toBe('No films in this catalogue yet');
    expect(copy(facts({ access: { kind: 'denied', reason: 'no-role' } })).title).toBe('This account cannot view films');
    expect(copy(facts({ access: { kind: 'denied', reason: 'no-session' } })).title).toBe('Log in to see films');
    expect(copy(facts({ clusterUnreachable: true })).title).toBe('No films downloaded');
    expect(copy(facts({ networkDown: true })).title).toBe('No films downloaded');
    expect(copy(facts({ endpointsConfigured: false })).title).toBe('No Macha node configured');
  });

  // Unknown access is not a refusal, so the ordinary sentence stands. Anything
  // else would accuse the cluster on every cold start.
  it('says the ordinary thing while access is merely unknown', () => {
    expect(copy(facts({ access: { kind: 'unknown' } })).title).toBe('No films in this catalogue yet');
  });

  // An outage passes on its own; a role does not. The actionable one wins.
  it('prefers the account refusal over a concurrent outage', () => {
    expect(copy(facts({ networkDown: true, access: { kind: 'denied', reason: 'no-role' } })).title).toBe(
      'This account cannot view films',
    );
  });

  it('uses whatever noun the shelf holds', () => {
    const problems = describeProblems(facts({ access: { kind: 'denied', reason: 'no-role' } }));
    expect(describeEmptyLibrary('series', problems).title).toBe('This account cannot view series');
    expect(describeEmptyLibrary('albums', problems).title).toBe('This account cannot view albums');
  });
});

describe('a session granted no roles at all', () => {
  // Tom's instruction, 2026-09-21: say plainly when a session holds nothing.
  // The distinction is the advice, not the mechanism — "ask for the role" is
  // the wrong thing to tell someone whose signed-in session was replaced by an
  // anonymous one, which is how this arises.
  const facts = {
    endpointsConfigured: true,
    networkDown: false,
    clusterUnreachable: false,
    access: { kind: 'denied', reason: 'no-roles' },
  } as const;

  it('tells the viewer to log in again rather than to find an administrator', () => {
    const [only] = describeProblems(facts);
    expect(only.kind).toBe('account-no-roles');
    expect(only.detail).toContain('Log in again');
    expect(only.detail).not.toContain('media viewer role');
  });

  it('still says the downloads play, because they do', () => {
    expect(describeProblems(facts)[0].detail).toContain('downloads still play');
  });

  it('leaves the wrong-role message alone', () => {
    const [only] = describeProblems({ ...facts, access: { kind: 'denied', reason: 'no-role' } });
    expect(only.kind).toBe('account-cannot-view');
    expect(only.detail).toContain('media viewer role');
  });
});
