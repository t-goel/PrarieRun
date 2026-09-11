# PrairieRun Cleanup Plan

This plan is intentionally not executed yet. The audit changed documentation
only; no source files, manifests, tests, or fixtures were removed.

## Phase 0: establish a safe baseline

1. Confirm the working tree is clean and commit the audit documentation.
2. Run the existing Stage 0 parser tests and record the current fixture mismatch
   in the issue log. Do not delete the fixture or test until its intended status
   is decided.
3. Manually verify the current end-to-end path: PrairieLearn scan, embedded
   home panel, automatic Calendar sync, no-date exclusion, due-date edit,
   duplicate prevention, class calendars, and completed-event grey coloring.

## Phase 1: remove confirmed dead runtime code

1. Remove `extension/staging.html`, `extension/staging.js`, and
   `extension/staging.css` only after confirming no supported workflow opens the
   standalone staging page.
2. Remove `currentDateKeys` and `isPending` from `extension/view-utils.js`.
3. Retain `statusLabel`; it is still used by the embedded home panel for
   unsynced/error badges.
4. Remove the unused `openWhenNew` argument from `runScan` and its call sites.
5. Remove the unused `newOrChanged` calculation and return field from
   `runScan`.
6. Remove the unused `.prr-sync--done`, `.prr-check-spacer`, and `.stats*`
   styles, along with the spacer markup if visual regression testing confirms it
   is unnecessary.
7. Simplify the popup's unreachable `#status` fallback or add an explicit status
   element if that fallback is still desired. The preferred cleanup is to use
   the existing `#context` element consistently.

## Phase 2: consolidate development and documentation assets

1. Decide whether Stage 0 capture regeneration is still needed. If it is not,
   archive or remove `capture-helper/`; otherwise label it clearly as a
   development-only utility.
2. Resolve the duplicate PrairieLearn adapter implementations. Prefer one
   canonical parser implementation with a testable interface rather than two
   independently maintained copies.
3. Repair or retire `stage0/test-capture-bundle.js` and its fixture based on the
   result of Phase 0; do not hide a failing test by deleting it.
4. Update or consolidate `extension/README.md` and
   `extension/google-calendar-setup.md` so they describe automatic sync and the
   embedded home panel rather than the removed staging/export-preview flow.
5. Archive or consolidate `stage-1.md`, `stage-2.md`, and `stage-3.md` once
   current requirements have been captured in `ux.md` and `systemdesign.md`.

## Phase 3: validation and commit discipline

For each cleanup change:

- make one logically grouped change;
- run parser tests and a manifest/load check;
- test the PrairieLearn home-page panel and popup in Chrome/Brave;
- verify no duplicate Calendar events are created;
- verify only new or materially changed assignments synchronize;
- verify a score exactly at 95% is not treated as completed, while a score over
  95% is;
- verify completed events use grey and incomplete events retain their class
  color;
- commit immediately with a focused message.

## Removal decision summary

Safe first candidates, pending validation: the three standalone staging files,
the identified unused helpers, parameters, and result fields, and the stale CSS
rules.

Conditional candidates: `capture-helper/`, historical stage documents, README
and setup documentation, and the duplicate Stage 0 adapter. These require an
explicit decision because they may still support development, testing, or
future parser maintenance.

Do not remove: the background scanner, calendar module, current content scripts,
home panel, active adapter, view-utils module as a whole, or the Stage 0 test
fixture until their live/test dependencies are resolved.
