// Accounts, roles and whoami, re-exported from core. Do not reimplement policy:
// roles are resolved by the server, `isSignedIn` is the only signed-in test,
// and `hasRole` is plain membership with no implied roles. Avoid comparing
// against `ANONYMOUS_USERNAME`; the server protects accounts via `mutable`.
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
