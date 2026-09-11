# PrairieRun Stage 1

## Current functionality

- Scans the logged-in `us.prairielearn.com` home page and discovered course assessment pages.
- Extracts assignments, course names, scores, source URLs, due timestamps, and time zones.
- Merges base assessments and numbered assessment instances.
- Stores assignments locally in Chrome.
- Shows a compact staging area grouped by class.
- Selects only new/changed assignments with due dates by default.
- Keeps missing-date assignments visible but excluded from bulk selection.
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

## OAuth limitation

The local scan, staging, and event-preview flows are implemented. Real Google Calendar export still needs a Google Cloud OAuth client ID registered for this extension. The current preview explains that setup is required rather than pretending to export.
