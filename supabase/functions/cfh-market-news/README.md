# Cashflow Hub company announcements

Public PSE EDGE announcement metadata is exposed through this JWT-protected Edge Function. No paid provider key is required. The endpoint reads no private database data; entitlement calculations stay in the app.

Sources: PSE EDGE company autocomplete, company dividend schedule, and latest company announcements. News contains the latest 50 disclosures within the requested 90-day window; titles open their original official disclosure. Company schedule parsing accepts only unambiguous PHP cash rates for common shares or the exact requested security. Unsupported rates, dates, preferred securities and changed page formats are never guessed.

The app checks on entry/resume and approximately every ten minutes while the portfolio section is active, with a five-minute upstream cache. It does not run a background notification service while the app is closed. Saved news and expected schedules are retained offline. Successful schedule refreshes replace future dates for checked companies; failed companies retain cached results.

Eligible shares are recorded purchases dated before ex-date, separated by broker. Purchases on ex-date and future-dated purchases are excluded. Pre-ex-date quantities are provisional. Amounts are gross estimates before tax, never automatically marked received or credited to cash. Actual net receipts require explicit confirmation and use the existing synced dividend ledger. Automatically discovered future payouts are matched against existing records to avoid duplicates. Past unseen payments are not backfilled.


Deployment packages index.ts and ../../cfh-market-announcements.mjs together with their directory structure preserved. JWT verification must remain enabled.
