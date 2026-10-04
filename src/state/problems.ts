import type { MediaAccess } from '../account/access';

/**
 * What stands between this device and the cluster's media. A list, not a flag:
 * some pass on their own, others need the viewer to act. There is no "no
 * internet": a LAN without internet is a fine home for a cluster.
 */
export type ProblemKind =
  | 'no-endpoints'
  | 'network-down'
  | 'cluster-unreachable'
  | 'account-required'
  | 'account-cannot-view'
  | 'account-no-roles';

export interface Problem {
  kind: ProblemKind;
  /** One line, in the viewer's terms. */
  title: string;
  /** What it means for them now — including what still works. */
  detail: string;
}

export interface ProblemFacts {
  /** Whether any node address is configured at all. */
  endpointsConfigured: boolean;
  /** The device itself reports no network. Not the same as the cluster being unreachable. */
  networkDown: boolean;
  /** No node answered, on a device that believes it has a network. */
  clusterUnreachable: boolean;
  access: MediaAccess;
}

const PROBLEMS: Record<ProblemKind, Omit<Problem, 'kind'>> = {
  'no-endpoints': {
    title: 'No Macha node configured',
    detail: 'Add the address of a node in your cluster to see your library.',
  },
  'network-down': {
    title: 'This device has no network',
    detail: 'Your downloads still play. The library returns when the network does.',
  },
  'cluster-unreachable': {
    title: 'Cannot reach your cluster',
    detail: 'The network is fine, but no node answered. Your downloads still play.',
  },
  'account-required': {
    title: 'This cluster needs an account',
    detail: 'Log in to see the library. Your downloads are yours and still play.',
  },
  'account-cannot-view': {
    title: 'This account cannot view media',
    detail: 'Ask for the media viewer role, or log in as someone who has it. Your downloads still play.',
  },
  // No roles at all: the remedy is signing in, not asking for a role.
  'account-no-roles': {
    title: 'This session cannot do anything',
    detail: 'Log in again to see the library — this session was granted no permissions. Your downloads still play.',
  },
};

const problem = (kind: ProblemKind): Problem => ({ kind, ...PROBLEMS[kind] });

/**
 * Everything currently wrong, root causes only: no network hides "cannot reach
 * your cluster", but an account refusal is reported alongside an outage since
 * it outlasts it.
 */
export function describeProblems(facts: ProblemFacts): Problem[] {
  if (!facts.endpointsConfigured) return [problem('no-endpoints')];

  const problems: Problem[] = [];
  if (facts.networkDown) problems.push(problem('network-down'));
  else if (facts.clusterUnreachable) problems.push(problem('cluster-unreachable'));

  if (facts.access.kind === 'denied') {
    const kind =
      facts.access.reason === 'no-session'
        ? 'account-required'
        : facts.access.reason === 'no-roles'
          ? 'account-no-roles'
          : 'account-cannot-view';
    problems.push(problem(kind));
  }
  return problems;
}

/** Whether cluster media is unusable right now, by outage or by refusal. */
export function clusterMediaUnavailable(problems: readonly Problem[]): boolean {
  return problems.length > 0;
}

export interface EmptyLibraryCopy {
  title: string;
  detail?: string;
}

/**
 * What an empty shelf should say. Blames the catalogue only when it can
 * actually be seen. `noun` is plural and lower case: "films", "series".
 */
export function describeEmptyLibrary(noun: string, problems: readonly Problem[]): EmptyLibraryCopy {
  const kinds = new Set(problems.map((problem) => problem.kind));

  // Access before an outage: it is actionable and does not pass on its own.
  if (kinds.has('account-cannot-view')) {
    return {
      title: `This account cannot view ${noun}`,
      detail: 'Ask for the media viewer role, or log in as someone who has it.',
    };
  }
  if (kinds.has('account-required')) {
    return {
      title: `Log in to see ${noun}`,
      detail: 'This cluster needs an account. Your downloads stay available either way.',
    };
  }

  if (kinds.has('no-endpoints')) {
    return {
      title: `No Macha node configured`,
      detail: `Add the address of a node in your cluster to see your ${noun}.`,
    };
  }

  // Showing the device's own library, so the shelf describes the device.
  if (kinds.has('network-down') || kinds.has('cluster-unreachable')) {
    return {
      title: `No ${noun} downloaded`,
      detail: 'Download these while you are on your network and they will be here when you are not.',
    };
  }

  return {
    title: `No ${noun} in this catalogue yet`,
    detail: 'Items appear here as the node indexes your library.',
  };
}
