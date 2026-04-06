/**
 * Google OAuth scopes used for server-side Calendar sync (Clerk stores tokens;
 * backend reads them via GET /users/{id}/oauth_access_tokens/oauth_google).
 *
 * Clerk’s Google SSO screen does not list “Calendar” as a separate toggle.
 * You request this scope from the app (UserButton / SignIn) via additionalOAuthScopes.
 */
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly"

/** Pass to `<UserButton userProfileProps={{ additionalOAuthScopes: ... }} />`. */
export const clerkAdditionalGoogleCalendarScopes: { google: string[] } = {
  google: [GOOGLE_CALENDAR_READONLY_SCOPE],
}
