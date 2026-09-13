# Google Calendar setup for PrairieRun

PrairieLearn scanning and the embedded assignment panel work without Google OAuth. Calendar sync needs a Google Cloud (GCP) project you own with the Calendar API enabled.

Decision: use a new PrairieRun GCP project owned by the current maintainer (not the original author's project). End users never touch this setup; they install the extension and click Connect.

## One-time owner setup (do this once)

1. Create a new GCP project (e.g. `prairierun`).
2. Enable the Google Calendar API (APIs & Services → Library).
3. Configure the OAuth consent screen:
   - App name, support email, homepage URL, privacy policy URL (required for verification).
   - Scope: `https://www.googleapis.com/auth/calendar` (full calendar scope — required for per-class calendar creation via `calendars.insert` + `calendarList.list`; the narrower `calendar.events` scope cannot create calendars).
   - Stay in Testing mode while developing; move to Production + verification before inviting real users.
4. Create an OAuth client: APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type: Chrome Extension. Enter the extension ID from `chrome://extensions`.
5. Put the client ID in one place: `extension/oauth-config.js` (`PrairieRunOAuthConfig.clientId`). That is the only per-project code change. No secret belongs in the repo; the client ID is public. Never commit tokens.
6. Reload the extension (`chrome://extensions` → Reload) and open PrairieLearn. The first sync requests consent.

## Testing mode vs Production (important for real users)

- Testing mode: only Google accounts you add under "Test users" can consent, and grants expire after ~7 days (re-consent is normal). Good for the two developers, unusable for real users.
- Production (verified): any Google account can connect and grants persist. Requires sensitive-scope review for the `calendar` scope, brand verification, and a privacy policy. Plan this before inviting non-technical users.

## Two developers, one client (fix for redirect_uri_mismatch)

Each `Load unpacked` install has its own extension ID, and the redirect URI looks like `https://<extension-id>.chromiumapp.org/oauth2`. If that URI isn't registered on the OAuth client, Google fails with `redirect_uri_mismatch`.

Preferred fix (one time): share one stable extension ID via manifest `key` pinning:

1. One developer copies the `key` value from their installed manifest (or packs once to generate a `.pem`, keeping the `.pem` private and out of git).
2. Add that `key` to `extension/manifest.json` and commit it (the `key` is public; the `.pem` stays private — see `extension/key.pem` staying gitignored).
3. Both developers reload: `chrome://extensions` now shows the same ID, so the single Chrome-extension OAuth client covers both checkouts.

Fallback (no shared key): create one Chrome-extension OAuth client per developer extension ID inside the same GCP project. Each checkout then sets its own client ID in `extension/oauth-config.js` as a local-only change (don't commit the other dev's ID). Prefer the shared `key` so both checkouts use the one committed client ID.

When a mismatch still happens, the popup shows a human-readable error with the exact redirect URI and a Copy button ("Having trouble connecting?"). Paste that URI into the client's allowed list, reload, and Connect again.

## End-user flow (nothing to configure)

1. Install the extension (production build already contains the production client ID).
2. Click the extension icon → Connect Google Calendar (or use Connect in the PrairieRun panel on PrairieLearn).
3. Grant Calendar access with their own Google account.
4. Status shows `Connected, expires <time>`. The token lives only in session/memory and silently reuses until expiry; re-prompts happen only on expiry, revocation, or Disconnect — not every export.
5. Disconnect any time from the popup or panel: this revokes the token at `https://oauth2.googleapis.com/revoke` and clears the cached session token.
6. Cancellation (`authorization cancelled`) is reported as "Sign-in was cancelled, click Connect to try again" — distinct from configuration errors.

## Brave note

In Brave, allow cookies for `accounts.google.com` and `googleapis.com` if sign-in prompts recur.

## Scope justification (for verification)

PrairieRun keeps the full `calendar` scope because it creates one calendar per class (`POST /calendars`), lists writable calendars, reads event colors, and inserts/updates/deletes events with duplicate-prevention markers. Narrowing to `calendar.events` later would mean giving up per-class calendars (sync to one user-picked calendar instead) and re-testing creation, lookup, colors, and dedup.
