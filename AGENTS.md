# PrairieRun Agent Instructions

## Project Context

PrairieRun is a Chrome/Brave extension that scans PrairieLearn course pages,
stores normalized assignment data locally, and syncs eligible assignments to
Google Calendar.

The current product surface is the embedded PrairieRun panel on the
PrairieLearn home page plus the extension popup. The old standalone staging
page has been removed.

## Current Architecture

```text
PrairieLearn page
  -> content.js
      -> prairielearn-adapter.js  (page extraction)
      -> home-panel.js            (embedded display/edit surface)
      -> view-utils.js            (shared filtering/sorting/status helpers)

Popup -> background.js
           -> scans course assessment tabs
           -> stores normalized assignment state
           -> invokes calendar.js
           -> notifies the home panel

calendar.js -> Google Calendar API
```

`extension/background.js` imports `extension/calendar.js`; `calendar.js` is a
live dependency even though it is not loaded as a content script.

## Core Behavior Rules

- Automatic PrairieLearn scanning and automatic Google Calendar sync are the
  default behavior.
- The embedded home panel should stay directly below the PrairieLearn course
  links.
- Do not reintroduce the removed standalone staging page unless explicitly
  requested.
- Do not reintroduce per-assignment checkboxes, deselect-all controls, or manual
  selection/export UX unless explicitly requested.
- Only assignments with due dates are eligible for Google Calendar sync.
- Assignments without due dates are hidden by default, but users can reveal
  them and add/edit a due date.
- If a due date is added to a previously undated assignment, it becomes eligible
  for sync.
- Calendar events should be one-hour blocks ending at the assignment due date.
- Only sync new assignments or materially changed assignments.
- A score increase below the completion threshold is not a material calendar
  change by itself.
- Completion means score is strictly greater than 95 percent. Exactly 95 percent
  is not complete.
- Completed events should use grey. Incomplete events should retain their
  class/calendar color.
- Preserve duplicate prevention via stable PrairieRun identifiers in calendar
  event metadata/descriptions.

## UI Rules

- Assignment rows should not show redundant `unknown`, `incomplete`, or
  `complete` text labels when those states are already represented by dropdown
  grouping.
- Keep existing synced assignments collapsed according to the current panel
  rules.
- Keep new or materially changed assignments visible when user review is needed.
- Keep PrairieLearn assignment source links working.
- Preserve compact, scan-friendly UI. Avoid bringing back clutter removed in the
  cleanup pass.

## Files To Treat Carefully

- `extension/background.js`: scanner, state manager, auto-sync coordinator.
- `extension/calendar.js`: OAuth, calendar creation, duplicate markers, event
  creation/update, calendar colors.
- `extension/home-panel.js` and `extension/home-panel.css`: current embedded UI.
- `extension/prairielearn-adapter.js`: runtime PrairieLearn parser.
- `extension/view-utils.js`: shared home-panel helpers; `statusLabel` is live.
- `stage0/` and `capture-helper/`: development/testing assets. Do not delete
  them unless explicitly requested.

The runtime adapter and `stage0/prairielearn-adapter.js` are duplicated parser
implementations. Consolidating them is a future improvement, not a casual
cleanup.

## Documentation Discipline

- After every meaningful code or behavior change, update this `AGENTS.md` file
  if the change affects architecture, workflow, testing, project rules, or
  future-agent context.
- Also update `systemdesign.md` for architecture/dependency changes.
- Also update `ux.md` for user-facing behavior changes.
- Keep historical stage docs unless the user explicitly asks to archive or
  remove them.

## Commit Discipline

- Commit after every logical change.
- Keep commits focused and descriptive.
- Do not push unless the user explicitly asks.
- Do not revert user changes unless the user explicitly requests it.

## Verification

For extension changes, run checks proportional to the risk. Common baseline:

```bash
node --check extension/*.js stage0/*.js capture-helper/*.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json', 'utf8')); console.log('manifest ok')"
node stage0/test-adapter-core.js
node stage0/test-capture-bundle.js
```

When UI or sync behavior changes, also ask the user to reload the unpacked
extension and verify in Chrome/Brave because this environment cannot fully
exercise PrairieLearn login state or Google OAuth.
