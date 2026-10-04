import { describe, expect, it } from 'vitest';
import { MachaApiError, MachaConnectionError } from '@machafoundation/core';
import { isAuthRefusal } from './errors';

describe('isAuthRefusal', () => {
  it('recognises a refusal of who we are', () => {
    expect(isAuthRefusal(new MachaApiError('a valid session bearer token is required', 401))).toBe(true);
    expect(isAuthRefusal(new MachaApiError("this action requires the 'media_viewer' role", 403))).toBe(true);
  });

  // Treating an outage as a refusal would hide it behind an account message.
  it('does not treat a failure to answer as a refusal', () => {
    expect(isAuthRefusal(new MachaConnectionError())).toBe(false);
    expect(isAuthRefusal(new MachaApiError('gone', 404))).toBe(false);
    expect(isAuthRefusal(new MachaApiError('broken', 500))).toBe(false);
    expect(isAuthRefusal(new MachaApiError('no status'))).toBe(false);
    expect(isAuthRefusal(new Error('something'))).toBe(false);
    expect(isAuthRefusal(undefined)).toBe(false);
  });
});
