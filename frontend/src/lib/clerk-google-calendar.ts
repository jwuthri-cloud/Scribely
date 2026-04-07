/**
 * Google OAuth scopes used for server-side Calendar sync (Clerk stores tokens;
 * backend reads them via GET /users/{id}/oauth_access_tokens/oauth_google).
 *
 * Clerk’s Google SSO screen does not list “Calendar” as a separate toggle.
 * Request this scope via `additionalOAuthScopes` on `<UserButton userProfileProps />` and
 * `openUserProfile({ additionalOAuthScopes })` (see WorkspaceShell, calendar page). Also add
 * `https://www.googleapis.com/auth/calendar.readonly` under Clerk Dashboard → User & authentication
 * → Social connections → Google → Authorized scopes (and the same scope in Google Cloud OAuth).
 */
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly"

/** Pass to `<UserButton userProfileProps={{ additionalOAuthScopes: ... }} />`. */
export const clerkAdditionalGoogleCalendarScopes: { google: string[] } = {
  google: [GOOGLE_CALENDAR_READONLY_SCOPE],
}
