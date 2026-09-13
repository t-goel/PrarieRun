# PrairieRun System Design and Dead-Code Audit

## Scope

This document reflects the repository after the cleanup completed on
2026-09-11. The original audit findings are preserved below, with each item
marked by its current disposition. Future agent-facing project rules live in
`AGENTS.md`.

## Current runtime architecture

```text
PrairieLearn page
  └─ content.js
      ├─ prairielearn-adapter.js  (page extraction)
      ├─ home-panel.js             (embedded display/edit surface)
      └─ view-utils.js             (shared filtering/sorting/status helpers)

Popup ──> background.js
             ├─ scans course assessment tabs
             ├─ stores normalized assignment state
             ├─ invokes calendar.js (via oauth-config.js + auth-utils.js)
             ├─ owns Google Connect/Disconnect/status (PRAIRIERUN_AUTH_*)
             └─ notifies the home panel

calendar.js ──> Google Calendar API
```

The popup and the home-panel footer are thin auth clients: they send
`PRAIRIERUN_AUTH_STATUS` / `PRAIRIERUN_AUTH_CONNECT` /
`PRAIRIERUN_AUTH_DISCONNECT` to the background worker, which delegates to
`calendar.js`. Tokens live only in `chrome.storage.session`. On Calendar 401
the cached token is cleared once and the export retried with a fresh token.
`auth-utils.js` classifies `redirect_uri_mismatch` / `invalid_client` /
cancelled / expired distinctly (unit-tested in `stage0/test-auth-errors.js`).

The manifest loads the content scripts on PrairieLearn and loads
`background.js` as the service worker. `background.js` imports `calendar.js`, so
the calendar module is a live dependency even though it is not listed in the
manifest's content-script array.

## Findings

| Item | Evidence | Assessment | Proposed action |
|---|---|---|---|
| `extension/staging.html` | No manifest entry, popup link, background tab creation, or current UI link referenced it | Dead/unreachable legacy UI | Removed |
| `extension/staging.js` | Only loaded by `staging.html`; duplicated home-panel rendering/edit behavior | Dead as part of the current product path | Removed |
| `extension/staging.css` | Only referenced by `staging.html` | Dead with the legacy page removed | Removed |
| `PrairieRunView.currentDateKeys` | Exported but no call sites found | Unused helper | Removed |
| `PrairieRunView.isPending` | Exported but no call sites found after selection removal | Unused helper | Removed |
| `PrairieRunView.statusLabel` | Called by `home-panel.js` for unsynced/error badges | Live helper | Retain |
| `runScan` parameter `openWhenNew` | Passed by callers and logged, but never controlled behavior | Dead parameter | Removed |
| `runScan` result field `newOrChanged` | Constructed and returned; callers used only `assignments` or ignored the result | Dead result data | Removed |
| `home-panel.css` `.prr-sync--done` | No matching current markup | Dead style | Removed |
| `home-panel.css` `.prr-check-spacer` | Only a zero-width placeholder from the removed checkbox layout | Obsolete layout shim | Removed with spacer markup |
| `popup.css` `.stats*` rules | No `.stats` markup in current `popup.html` | Dead styles | Removed |
| `popup.js` `#status` branch | Current popup has `#context`, not `#status` | Defensive branch with no current DOM target | Removed; `#context` is used consistently |
| `extension/prairielearn-adapter.js` and `stage0/prairielearn-adapter.js` | Two parser implementations exist; one is runtime and one is test-only | Duplication risk, not immediately dead | Consolidate around one canonical parser/test boundary |
| `extension/README.md` and `extension/google-calendar-setup.md` | Describe the former staging/export-preview workflow | Documentation drift | Update or consolidate; do not treat as runtime dead code |

## Files that should not be removed in the first cleanup pass

- `extension/background.js`: live scanner, state, and automatic-sync coordinator.
- `extension/calendar.js`: imported by the background service worker and owns
  OAuth, calendar creation, duplicate markers, event updates, and colors.
- `extension/home-panel.js`, `home-panel.css`, `content.js`, and
  `prairielearn-adapter.js`: current embedded PrairieLearn surface and its data
  path.
- `extension/view-utils.js`: still needed by the home panel even after the
  staging page is removed; only its unused exports should be reconsidered.
- `stage0/test-adapter-core.js`, `stage0/test-capture-bundle.js`, the capture
  JSON fixture, and `capture-helper/`: development/testing assets. They are not
  shipped runtime code. The capture bundle test has been aligned with the
  current one-course fixture.

## Historical documentation

`stage-0.md` through `stage-3.md` and portions of `ux.md` contain historical
planning language for staging, selection, and manual export. They are not code
dependencies. Consolidation or archival remains optional now that current
behavior is represented in the system design and cleanup checklist.

## Agent instructions

`AGENTS.md` is the current repo-level instruction file for OpenAI/Codex agents.
Update it after meaningful changes that affect architecture, behavior, testing,
workflow, or future-agent context.
