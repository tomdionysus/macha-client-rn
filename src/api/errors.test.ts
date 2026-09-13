import { describe, expect, it } from 'vitest';
import { MachaApiError, MachaConnectionError, isAuthRefusal } from './errors';

describe('isAuthRefusal', () => {
  // The two the cluster answers with when it will not serve this viewer. Every
  // node answers the same way, because sessions and roles are replicated.
  it('recognises a refusal of who we are', () => {
    expect(isAuthRefusal(new MachaApiError('a valid session bearer token is required', 401))).toBe(true);
    expect(isAuthRefusal(new MachaApiError("this action requires the 'media_viewer' role", 403))).toBe(true);
  });

  // A node that could not answer has said nothing about who we are, and the
  // offline path already owns that case — treating it as a refusal here would
  // hide a genuine outage behind an account message.
  it('does not treat a failure to answer as a refusal', () => {
    expect(isAuthRefusal(new MachaConnectionError())).toBe(false);
    expect(isAuthRefusal(new MachaApiError('gone', 404))).toBe(false);
    expect(isAuthRefusal(new MachaApiError('broken', 500))).toBe(false);
    expect(isAuthRefusal(new MachaApiError('no status'))).toBe(false);
    expect(isAuthRefusal(new Error('something'))).toBe(false);
    expect(isAuthRefusal(undefined)).toBe(false);
  });
});
