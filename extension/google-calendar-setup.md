# Google Calendar setup for PrairieRun

Stage 1's scan and staging workflow can be tested without Google OAuth. To enable real export:

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen for the test account.
4. Create a Chrome Extension OAuth client using the unpacked extension ID shown in `chrome://extensions`.
5. Add the OAuth client ID and Calendar scope to `manifest.json`.
6. Implement the token request and Calendar API calls in the export action.

Required scope for the planned export flow:

```text
https://www.googleapis.com/auth/calendar
```

Do not commit client secrets or tokens. Chrome extension OAuth uses the public client ID; the user's Google password and refresh credentials must never be stored by PrairieRun.
