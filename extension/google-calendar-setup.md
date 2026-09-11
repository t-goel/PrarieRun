# Google Calendar setup for PrairieRun

PrairieLearn scanning and the embedded assignment panel can be tested without Google OAuth. To enable automatic Calendar synchronization:

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen for the test account.
4. Create a Chrome Extension OAuth client using the unpacked extension ID shown in `chrome://extensions`.
5. Add the OAuth client ID and exact `chromiumapp.org` redirect URI to the extension's OAuth flow configuration.
6. Reload the extension and open PrairieLearn. A scan runs automatically; the first actionable assignment synchronization will request consent.

Required scope for the automatic synchronization flow:

```text
https://www.googleapis.com/auth/calendar
```

Do not commit client secrets or tokens. Chrome extension OAuth uses the public client ID; the user's Google password and refresh credentials must never be stored by PrairieRun.

PrairieRun caches the temporary Google access token in Chrome's session storage and first attempts silent authorization. You normally should not be prompted on every export. The token expires periodically, so Google may still ask for authorization again after expiration, after clearing extension data, or if Brave blocks the Google sign-in session. In Brave, allow cookies for `accounts.google.com` and `googleapis.com` if prompts recur.
