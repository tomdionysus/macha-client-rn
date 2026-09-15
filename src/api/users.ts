// Accounts, roles and whoami are core's, and this file is a re-export rather
// than an implementation on purpose.
//
// `UsersApi` is the interface, `MachaUsersApi` talks to one node, and
// `ClusterUsersApi` routes reads across the cluster while executing mutations
// once — the same read/write split every other cluster API here already uses.
// Nothing about accounts is reimplemented locally: roles are resolved by the
// server when a session is minted, `isSignedIn` is the only test for whether a
// viewer chose to be anyone, and `hasRole` is a membership test with no
// implication in it. A client that decides a `manager` can obviously also
// import is reimplementing policy the server already decided.
//
// `ANONYMOUS_USERNAME` is exported for completeness and should almost never be
// compared against: `isSignedIn` is the supported question, and the root and
// anonymous accounts are protected by the server's `mutable` block rather than
// by their names.
export {
  ANONYMOUS_USERNAME,
  ClusterUsersApi,
  MachaUsersApi,
  MachaUsersApiError,
  USER_ROLES,
  hasRole,
  isSignedIn,
  type CurrentSession,
  type MachaUser,
  type PasswordPolicy,
  type UserRole,
  type UsersApi,
  type UsersApiErrorCode,
} from '@machafoundation/core';
