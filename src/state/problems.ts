import type { MediaAccess } from '../account/access';

/**
 * What is standing between this device and the cluster's media, as a list
 * rather than a flag.
 *
 * One boolean cannot carry this. "Offline" was doing the work of at least four
 * different situations — no network, a node that will not answer, a cluster
 * that wants an account, an account that may not view — and they are not the
 * same to whoever is holding the phone: two of them pass on their own and two
 * need somebody to do something.
 *
 * Deliberately no "no internet". This client already decided to ignore
 * `isInternetReachable`, because a LAN with no route to the internet is a
 * perfectly good home for a Macha cluster, and re-deriving it here would put
 * that mistake back by a different door.
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
  // Granted nothing at all, which is a different remedy from the line above:
  // either this cluster serves registered users only, or a signed-in session
  // was replaced by an anonymous one. Both are answered by signing in, and
  // telling this viewer to ask an administrator for a role sends someone whose
  // session merely lapsed looking for the wrong person.
  'account-no-roles': {
    title: 'This session cannot do anything',
    detail: 'Log in again to see the library — this session was granted no permissions. Your downloads still play.',
  },
};

const problem = (kind: ProblemKind): Problem => ({ kind, ...PROBLEMS[kind] });

/**
 * Everything currently wrong, root causes only.
 *
 * A consequence is not a second problem: with no network, "cannot reach your
 * cluster" is true and says nothing the first line did not, so it is left out.
 * An account refusal *is* reported alongside an unreachable cluster, because
 * that one does not resolve itself when the network comes back and the viewer
 * should not be told twice, in two sittings, about two different things.
 */
export function describeProblems(facts: ProblemFacts): Problem[] {
  // Nothing else is knowable, and nothing else is worth saying: there is no
  // cluster to be unreachable or to refuse us yet.
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

/**
 * Whether media the cluster serves can be relied on right now.
 *
 * The question Continue Watching has to ask. It used to ask "are we offline",
 * which is only one of the ways the answer is no — a cluster that refuses this
 * viewer is perfectly reachable and still cannot play them anything, so the
 * rail went on offering items that fail when tapped.
 */
export function clusterMediaUnavailable(problems: readonly Problem[]): boolean {
  return problems.length > 0;
}

export interface EmptyLibraryCopy {
  title: string;
  detail?: string;
}

/**
 * What an empty shelf should say, which is not one sentence.
 *
 * "No films in this catalogue yet" is a claim about the *catalogue*, and this
 * client is only entitled to make it when it can actually see one. Refused, or
 * showing the device's own library because no node answered, the shelf is empty
 * for a reason that has nothing to do with what the cluster holds — and saying
 * otherwise tells a viewer their library is empty when it is full.
 *
 * `noun` is plural and lower case: "films", "series", "albums".
 */
export function describeEmptyLibrary(noun: string, problems: readonly Problem[]): EmptyLibraryCopy {
  const kinds = new Set(problems.map((problem) => problem.kind));

  // Access first, and deliberately ahead of an outage: it is the one the viewer
  // can do something about, and unlike an outage it does not pass on its own.
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

  // Nothing is wrong, so the catalogue really is empty and we may say so.
  return {
    title: `No ${noun} in this catalogue yet`,
    detail: 'Items appear here as the node indexes your library.',
  };
}
