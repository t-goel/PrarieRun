# PrairieRun Stage 0 Capture Helper

This is a local-only, unpacked Chrome extension for collecting representative PrairieLearn page snapshots while the user is already logged in.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `capture-helper` directory.
5. Pin **PrairieRun Stage 0 Capture Helper** to the toolbar.

## Capture representative pages

On each page, open the extension and click **Capture current page**. Recommended pages:

- Logged-in home page with class links.
- A class page with several assignments.
- An assignment page with a due date and time.
- A completed assignment.
- An assignment with a score below 95%, exactly 95%, and above 95% if available.
- An assignment without a due date.
- A closed or past assignment if those should be included.

Click **Download fixture bundle** when finished. The helper downloads one JSON file containing sanitized DOM snapshots and structural metadata.

## Privacy

The helper does not request passwords or cookies and does not upload data. It stores captures in `chrome.storage.local` and downloads them only when you click the download button. Page text and links may still contain private course information, so review and sanitize the bundle before sharing it.

## Current limitation

The helper captures one active page at a time. It does not crawl through classes automatically yet; that should be added only after the Stage 0 page structure and parser fields have been validated.
