# Independent Notes

Notes retain the existing `cfh_notes_v1` localStorage records. New fields are optional, so existing text, pin state, colors and dates remain readable. Notes are independent of Google Keep and are not synced across devices.

The A1 create menu offers image attachment, freehand drawing, audio attachment, checklist and text. Image files are resized to at most 1600px; attachments use IndexedDB so audio is not stored as oversized JSON. Individual uploads are limited to 25 MB. Audio opens the system audio-file picker; microphone recording is not implemented.

B1 navigation includes Notes, Reminders, editable labels, Archive, Deleted, Settings and Help. Reminder dates are displayed in the app, with no scheduled OS notification. The UI labels this distinction. Notes move to Deleted rather than immediately disappearing; restoration retains their content and attachments. Permanent deletion requires explicit confirmation.

Existing search, sort and equal-height grid/list views are preserved. Modal surfaces lock the page. Android Back closes the active Notes surface before handing control back to the existing app behavior.
