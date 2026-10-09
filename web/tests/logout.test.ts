// Regression tests for frontend logout handling (web/src/state/logout.ts).
//
// The bug: the frontend swallowed a failed server-side sign-out and presented it
// as a successful logout, leaving the user believing the session was revoked.
//
// The invariants pinned here:
//   - only a confirmed server response counts as a completed sign-out;
//   - a failure produces a visible warning, never silent success;
//   - local authentication state is cleared either way, so protected data is
//     never left on screen;
//   - the call never throws, so signing out locally cannot be blocked by a
//     server or network failure.

import { describe, it, expect } from 'vitest';
import { performLogout, LOGOUT_NOT_REVOKED_MESSAGE } from '../src/state/logout';

describe('performLogout', () => {
  it('reports a confirmed server-side revocation and leaves no user behind', async () => {
    const calls: string[] = [];
    const result = await performLogout(async (path) => {
      calls.push(path);
      return { ok: true };
    });

    expect(calls).toEqual(['/auth/logout']);
    expect(result.serverRevoked).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.user).toBeNull();
  });

  it('does not present a failed revocation as a successful logout', async () => {
    const result = await performLogout(async () => {
      throw new Error('Request failed (503)');
    });

    expect(result.serverRevoked).toBe(false);
    expect(result.warning).toBe(LOGOUT_NOT_REVOKED_MESSAGE);
    expect(result.warning).toMatch(/could not complete sign-out/i);
    expect(result.warning).not.toMatch(/\bsuccess/i);
  });

  it('clears local authentication state even when the request fails', async () => {
    const result = await performLogout(async () => {
      throw new TypeError('Failed to fetch');
    });

    // Protected data must not stay on screen, and no stale user may be restored.
    expect(result.user).toBeNull();
    expect(result.warning).toBeTruthy();
  });

  it('never throws, even when the failure is not an Error', async () => {
    await expect(performLogout(async () => { throw new Error('boom'); })).resolves.toMatchObject({
      serverRevoked: false,
    });
    await expect(performLogout(async () => { throw 'not-an-error'; })).resolves.toMatchObject({
      serverRevoked: false,
      user: null,
    });
  });
});
