// Logout orchestration.
//
// Kept free of React so it can be unit tested: the web workspace has no DOM
// test environment, and this is exactly the logic that decides whether a
// sign-out is reported as successful.
//
// The rule this module exists to enforce: a failed server-side revocation must
// never be presented as a completed sign-out, and local authentication state is
// cleared either way so protected data is not left on screen.

export interface LogoutResult {
  /** True only when the server confirmed this device's session was revoked. */
  serverRevoked: boolean;
  /** Message to show the user; null when sign-out completed on the server. */
  warning: string | null;
  /** The authenticated user state logout must leave behind: always signed out. */
  user: null;
}

export const LOGOUT_NOT_REVOKED_MESSAGE =
  'We could not complete sign-out on the server, so this session may still be active. You have been signed out of this browser. Please try again, or change your password to end every session.';

/**
 * Ask the server to revoke this device's session.
 *
 * Never throws: the caller has to clear local state regardless of the outcome.
 * A failure is returned as a warning so the UI can report it honestly.
 */
export async function performLogout(post: (path: string) => Promise<unknown>): Promise<LogoutResult> {
  try {
    await post('/auth/logout');
    return { serverRevoked: true, warning: null, user: null };
  } catch {
    // Covers a rejected request, a network failure, and the server's own
    // "could not complete sign-out" response.
    return { serverRevoked: false, warning: LOGOUT_NOT_REVOKED_MESSAGE, user: null };
  }
}
