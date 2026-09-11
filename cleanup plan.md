# PrairieRun Cleanup Plan

This file records the cleanup completed on 2026-09-11. The app behavior was
kept the same, except redundant visible assignment state labels were removed
from course rows because the rows are already grouped by dropdown sections.

## Phase 0: establish a safe baseline - complete

1. Confirm the working tree is clean and commit the audit documentation.
2. Run the existing Stage 0 parser tests and repair the stale fixture assertion
   so the updated one-course capture bundle is represented correctly.
3. Manually verify the current end-to-end path: PrairieLearn scan, embedded
   home panel, automatic Calendar sync, no-date exclusion, due-date edit,
   duplicate prevention, class calendars, and completed-event grey coloring.

## Phase 1: remove confirmed dead runtime code - complete

1. Removed `extension/staging.html`, `extension/staging.js`, and
   `extension/staging.css` after confirming no supported workflow opens the
   standalone staging page.
2. Removed `currentDateKeys` and `isPending` from `extension/view-utils.js`.
3. Retained `statusLabel`; it is still used by the embedded home panel for
   unsynced/error badges.
4. Removed the unused `openWhenNew` argument from `runScan` and its call sites.
5. Removed the unused `newOrChanged` calculation and return field from
   `runScan`.
6. Removed the unused `.prr-sync--done`, `.prr-check-spacer`, and `.stats*`
   styles, along with the spacer markup if visual regression testing confirms it
   is unnecessary.
7. Simplified the popup's unreachable `#status` fallback and uses the existing
   `#context` element consistently.

## Phase 2: consolidate development and documentation assets - partially complete

1. Decide whether Stage 0 capture regeneration is still needed. If it is not,
   archive or remove `capture-helper/`; otherwise label it clearly as a
   development-only utility.
2. Resolve the duplicate PrairieLearn adapter implementations. Prefer one
   canonical parser implementation with a testable interface rather than two
   independently maintained copies.
3. Repaired `stage0/test-capture-bundle.js` so it matches the updated fixture.
4. Updated `extension/README.md` and
   `extension/google-calendar-setup.md` so they describe automatic sync and the
   embedded home panel rather than the removed staging/export-preview flow.
5. Archive or consolidate `stage-1.md`, `stage-2.md`, and `stage-3.md` once
   current requirements have been captured in `ux.md` and `systemdesign.md`.

## Phase 3: validation and commit discipline - complete

Each cleanup change was made as a focused commit. Final verification included
JavaScript syntax checks, manifest parsing, Stage 0 parser tests, Stage 0
capture-bundle tests, and source searches for removed runtime symbols/files.

Manual browser verification remains the only part that cannot be fully proven
from this environment after cleanup. The user previously verified automatic
sync, duplicate prevention, and no-date exclusion in Brave.

## Removal decision summary

Completed removals: the three standalone staging files, the identified unused
helpers, parameters, result fields, stale CSS rules, stale popup fallback, and
redundant visible completion labels in assignment rows.

Conditional candidates: `capture-helper/`, historical stage documents, README
and setup documentation, and the duplicate Stage 0 adapter. README and setup
documentation were updated; the remaining candidates require an explicit
decision because they may still support development, testing, or future parser
maintenance.

Do not remove: the background scanner, calendar module, current content scripts,
home panel, active adapter, view-utils module as a whole, or the Stage 0 test
fixture until their live/test dependencies are resolved.
