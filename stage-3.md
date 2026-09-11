# PrairieRun — Stage 3: Hardening and Follow-up Features

## Goal

Make the extension resilient across PrairieLearn layouts and real-world calendar/account changes without expanding the core user flow unnecessarily.

## Features

- Support additional PrairieLearn deployments through adapter configurations.
- Improve diagnostics for unsupported markup and partial scans.
- Resume interrupted scans and recover from browser restarts.
- Handle pagination, dynamic content, stale assignments, and renamed classes.
- Add explicit stale-assignment review without automatically deleting calendar events.
- Support calendar remapping and optional event migration with confirmation.
- Add retry queues and exponential backoff for Calendar API failures.
- Add a diagnostic export for parser and sync problems.
- Add accessibility, keyboard navigation, and screen-reader progress announcements.
- Add privacy controls, disconnect/revoke flow, and clear-local-data action.

## Follow-up options

- Import or reconcile pre-existing non-PrairieRun events using an explicit user decision.
- Advanced bulk edits for reminders, durations, and due-date transformations.
- Optional scheduled scan reminders.
- Course-specific event templates.
- Firefox/other-browser compatibility if Chrome-only APIs become a limitation.

## Stage 3 verification

- Test across supported PrairieLearn deployments.
- Test daylight-saving transitions and time-zone changes.
- Test deleted/recreated Google events and revoked permissions.
- Test clearing extension data without deleting calendar events.
- Test large assignment sets and browser restart recovery.

