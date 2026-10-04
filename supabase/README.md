# Cashflow Hub migration

Work in progress; index.html still uses Apps Script. Do not switch it yet.

## Database preparation

Steps 1–3 already created the owner policies and imported 8,888 active records and
13 deleted records. Run step-4-mutations.sql in the Cashflow Hub SQL Editor
(project mssrsogwxvxyyjnavdiu). This enables authenticated owner saves, soft deletes,
restores and a transactional sync outbox. The final queries should still show
8,888 active and 13 deleted records unless new data has been imported.

The branch index.html supports an opt-in `?database=supabase` preview with owner login. The default URL remains on Apps Script. `cfh-browser.mjs` connects the existing request transport to the read/write adapters; no unsupported request falls back to the old database.
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

## Sheets sync setup (not activated)

Run `step-5-sheet-edits.sql` in the Cashflow Hub project. Add
`Cashflow-Sheets-Sync.gs` as a separate file in the existing Apps Script project.
Set `CFH_SUPABASE_SECRET` (backend secret/service role key) and
`CFH_SPREADSHEET_ID` in Script Properties. Do not put the key in source code.
Pause legacy writes and run `cfhBootstrapSync`. It validates every active row
against the import before mapping IDs in cell notes. If data changed, reconcile
the import first; do not bypass the check. Then run `cfhInstallSyncTrigger`.
The worker drains ten jobs each minute; app saves do not wait for it.
Existing ledger edits sync back with revision checks. New sheet rows currently
must be entered through the app. Manual row deletion is not a sync command.
Use app deletion and the archive restore checkbox instead. Keep existing
legacy restore triggers disabled during migration to avoid two writers.

Before live cutover: test on a separate workbook, reconcile new transactions,
finish Monthly Interest support and financial guards, wire background change
notifications to visible histories, replace the Printing H4 static reference,
and verify signed-in requests against the actual Cashflow Hub project.
The opt-in branch preview is development code, not a completed migration.
