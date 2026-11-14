# Direct card due-date sync

This owner-only function reads the revisioned Cashflow Hub calendar and syncs
the upcoming 90 days to each configured provider independently. It owns only
events it creates, with stable IDs per card and statement cycle. Keep the
destination calendars dedicated to Cashflow Hub. Amounts appear in event details.
The phone's native Cashflow Hub reminders still work separately.

Configure one or both providers in the Cashflow Hub Supabase project's Edge
Function secrets. Do not paste any passwords or tokens into chat, commit them,
or add them as frontend environment variables.

- **iCloud:** Create a dedicated iCloud calendar and generate a revocable
  app-specific password in your Apple Account. Use authenticated CalDAV
  discovery in a trusted client to identify the writable calendar collection
  URL (not a public sharing URL). Set `CFH_ICLOUD_CALENDAR_URL` (ending in
  `/`), `CFH_ICLOUD_EMAIL`, and `CFH_ICLOUD_APP_PASSWORD`.
- **Google:** Enable Calendar API in your Google Cloud project, create an OAuth
  client, and authorize offline access with the
  `https://www.googleapis.com/auth/calendar.events.owned` scope using the
  account that owns the dedicated calendar. Set `CFH_GOOGLE_CLIENT_ID`,
  `CFH_GOOGLE_CLIENT_SECRET`, `CFH_GOOGLE_REFRESH_TOKEN`, and
  `CFH_GOOGLE_CALENDAR_ID`. OAuth apps left in External Testing generally
  receive refresh tokens that expire after seven days for calendar access.

After adding the secrets, open Cashflow Hub Calendar and choose Sync now.
Check that each provider shows "synced". Test with a small amount change, then
mark that bill paid and confirm the corresponding events disappear. If either
provider rejects its credentials, the other can still sync. A provider can be
disconnected by removing its secrets and revoking its authorization; previously
written events remain in the dedicated destination calendar.

For deployment, include `index.ts`, `providers.mjs`, and the shared
`../cfh-push/kernel.ts`. If uploading a flat bundle, place the shared kernel
alongside the entry point and rewrite that relative import to `./kernel.ts`.
The function validates the bearer token using Supabase Auth and checks the
account ID itself.
