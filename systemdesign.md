# PrairieRun System Design and Dead-Code Audit

## Scope

This is a read-only audit of the repository as it exists on 2026-09-11. No
runtime source, manifest, test, or fixture files were changed for this audit.
The authoritative cleanup work is listed in `cleanup plan.md`.

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
             ├─ invokes calendar.js
             └─ notifies the home panel

calendar.js ──> Google Calendar API
```

The manifest loads the content scripts on PrairieLearn and loads
`background.js` as the service worker. `background.js` imports `calendar.js`, so
the calendar module is a live dependency even though it is not listed in the
manifest's content-script array.

## Findings

| Item | Evidence | Assessment | Proposed action |
|---|---|---|---|
| `extension/staging.html` | No manifest entry, popup link, background tab creation, or current UI link references it | Dead/unreachable legacy UI | Remove with the staging module after validation |
| `extension/staging.js` | Only loaded by `staging.html`; duplicates home-panel rendering/edit behavior | Dead as part of the current product path | Remove with `staging.html` |
| `extension/staging.css` | Only referenced by `staging.html` | Dead if the legacy page is removed | Remove with the staging page |
| `PrairieRunView.currentDateKeys` | Exported but no call sites found | Unused helper | Remove from the module and export |
| `PrairieRunView.isPending` | Exported but no call sites found after selection removal | Unused helper | Remove from the module and export |
| `PrairieRunView.statusLabel` | Called by `home-panel.js` for unsynced/error badges | Live helper | Retain |
| `runScan` parameter `openWhenNew` | Passed by callers and logged, but never controls behavior | Dead parameter | Remove parameter and related logging |
| `runScan` result field `newOrChanged` | Constructed and returned; callers use only `assignments` or ignore the result | Dead result data | Remove the local calculation and returned field |
| `home-panel.css` `.prr-sync--done` | No matching current markup | Dead style | Remove |
| `home-panel.css` `.prr-check-spacer` | Only a zero-width placeholder from the removed checkbox layout | Obsolete layout shim | Remove markup and rule if layout remains unchanged |
| `popup.css` `.stats*` rules | No `.stats` markup in current `popup.html` | Dead styles | Remove |
| `popup.js` `#status` branch | Current popup has `#context`, not `#status` | Defensive branch with no current DOM target | Simplify after confirming no alternate popup is shipped |
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
  shipped runtime code. The capture bundle test currently has a fixture/test
  mismatch, so it should be repaired or explicitly retired before removal.

## Historical documentation

`stage-0.md` through `stage-3.md` and portions of `ux.md` contain historical
planning language for staging, selection, and manual export. They are not code
dependencies. Consolidation or archival is safe only after the current behavior
is represented in the system design and the cleanup checklist is completed.
