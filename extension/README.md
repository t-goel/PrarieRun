# PrairieRun Stage 1

## Current functionality

- Scans the logged-in `us.prairielearn.com` home page and discovered course assessment pages.
- Automatically scans when the logged-in PrairieLearn home page is opened and opens the staging area when new or changed assignments are found.
- Automatically adds actionable assignments to Google Calendar when staging is opened from a scan.
- Extracts assignments, course names, scores, source URLs, due timestamps, and time zones.
- Merges base assessments and numbered assessment instances.
- Stores assignments locally in Chrome.
- Shows a compact staging area grouped by class.
- Shows assignments due today or later; older assignments remain untouched in Google Calendar.
- Shows the next three uncompleted assignments, with additional upcoming work and completed work in separate dropdowns.
- Uses PrairieLearn completion status directly; completion overrides are not supported.
- Sorts incomplete assignments first and puts completed assignments in a dropdown.
- Schedules a system notification for uncompleted assignments; the default lead time is four hours and can be changed in the extension popup. Completed assignments do not notify.
- Keeps undated assignments hidden by default, with an extension setting to reveal them.
- Shows a green `✓ Synced` state and per-assignment sync buttons when automatic sync is disabled.
- Lets the user add or edit a due date in customized staging mode.
- Previews one-hour calendar blocks ending at the due time.

## Load and test

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension` directory.
5. Log in to `https://us.prairielearn.com/`.
6. Open the extension popup and click **Scan all classes**.
7. Open the staging area and review the grouped assignments.

## Google Calendar export

The extension is configured for the PrairieRun development OAuth client and can request Calendar access from the export preview. On the first export, Chrome will ask the signed-in Google account for consent. Export creates or reuses a `PrairieLearn — {class}` calendar and stores a private assignment marker plus Google event ID for duplicate-safe updates.

For a different extension ID or a published build, create a matching Chrome Extension OAuth client and update `manifest.json` before loading the extension.
