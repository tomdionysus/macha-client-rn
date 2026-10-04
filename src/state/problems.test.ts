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
    expect(kinds(facts({ endpointsConfigured: false, networkDown: true, access: { kind: 'denied', reason: 'no-session' } }))).toEqual([
      'no-endpoints',
    ]);
  });

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

  // A refusal outlives the outage, so it must not be hidden by it.
  it('reports an account refusal alongside an outage', () => {
    expect(kinds(facts({ networkDown: true, access: { kind: 'denied', reason: 'no-role' } }))).toEqual([
      'network-down',
      'account-cannot-view',
    ]);
  });

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
  it('is true for a refusal, not only for an outage', () => {
    expect(clusterMediaUnavailable(describeProblems(facts()))).toBe(false);
    expect(clusterMediaUnavailable(describeProblems(facts({ clusterUnreachable: true })))).toBe(true);
    expect(clusterMediaUnavailable(describeProblems(facts({ access: { kind: 'denied', reason: 'no-role' } })))).toBe(true);
    expect(clusterMediaUnavailable(describeProblems(facts({ access: { kind: 'unknown' } })))).toBe(false);
  });
});

describe('describeEmptyLibrary', () => {
  const copy = (f: ProblemFacts) => describeEmptyLibrary('films', describeProblems(f));

  it('only blames the catalogue when it can actually see one', () => {
    expect(copy(facts()).title).toBe('No films in this catalogue yet');
    expect(copy(facts({ access: { kind: 'denied', reason: 'no-role' } })).title).toBe('This account cannot view films');
    expect(copy(facts({ access: { kind: 'denied', reason: 'no-session' } })).title).toBe('Log in to see films');
    expect(copy(facts({ clusterUnreachable: true })).title).toBe('No films downloaded');
    expect(copy(facts({ networkDown: true })).title).toBe('No films downloaded');
    expect(copy(facts({ endpointsConfigured: false })).title).toBe('No Macha node configured');
  });

  it('says the ordinary thing while access is merely unknown', () => {
    expect(copy(facts({ access: { kind: 'unknown' } })).title).toBe('No films in this catalogue yet');
  });

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
  // Typically a signed-in session replaced by an anonymous one.
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
