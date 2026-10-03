# Cashflow Hub migration

Work in progress; index.html still uses Apps Script. Do not switch it yet.

## Database preparation

Steps 1–3 already created the owner policies and imported 8,888 active records and
13 deleted records. Run step-4-mutations.sql in the Cashflow Hub SQL Editor
(project mssrsogwxvxyyjnavdiu). This enables authenticated owner saves, soft deletes,
restores and a transactional sync outbox. The final queries should still show
8,888 active and 13 deleted records unless new data has been imported.

cfh-store.mjs is the client adapter, not yet connected to the existing app.
cfh-read-api.mjs supports all seven dashboard/history routes using the original
Code.gs calculations in legacy-rules.mjs. cfh-entry-plan.mjs prepares existing
entry forms and Konek2Card action rows. cfh-snapshot.mjs persists complete tab
histories in IndexedDB and refreshes them in the background.
Starting balances must be loaded from the private konek_balance_seed setting;
they are not published in this repository. Use the private combined Step 4 file
provided in ChatGPT to install that setting together with the mutation SQL.
Each save uses a client-generated request ID. Keep the prepared request when retrying
an uncertain response; reusing it cannot create another transaction. A new transaction
gets a new request ID. Saves acknowledge the database commit without waiting for Sheets.
History starts with ten matching records and uses a stable timestamp/ID cursor.
The compatibility history routes retain the current UI's numeric cursor format
over the cached snapshot. The database adapter uses timestamp/ID pagination.
Deleting and restoring use record IDs and revisions rather than sheet row numbers.

## Remaining cutover work

1. Wire the existing dashboard calculations and all seven entry forms to the adapter.
2. Add persistent owner login. The publishable key is public; owner RLS protects rows.
3. Build the Sheets worker and reverse sync. Store the secret key only in Apps Script
   Script Properties. Never put it in index.html or this repository.
4. Add stable record IDs and revision metadata to sheet records. Preserve manual
   widths, gap columns and current formatting. Explicit deletes go through archive.
5. Serialize each record's queued revisions; apply only newer revisions in Sheets.
   Complete jobs using their lease token. Resolve a revision conflict before writing.
6. Reconcile changes made after the workbook export, test every form and restore/delete
   flow, then change the live app. Keep the old deployment for rollback.

## Validation

Run node --test supabase/tests/migration.test.mjs. The tests use synthetic data.
Private workbook validation also checked all seven dashboards and history routes
against the current source; no financial record fixtures are published here.
Live database writes and Sheets sync still require end-to-end verification.
The legacy Printing totalMoney field reads H4 independently of the app's month
selector; its sheet-backed reference needs reconciliation during sync/cutover.

The connector currently exposes Product Tracking, not Cashflow Hub. Database SQL
must be run in the Cashflow Hub project's SQL Editor until the correct account is
available here. Never run these changes in Product Tracking.
