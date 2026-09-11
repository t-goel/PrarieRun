# PrairieRun — Stage 1: Core Scan, Staging, and Calendar Export

## Goal

Build a usable Chrome extension that scans a logged-in PrairieLearn account, stages assignments in a compact review area, and exports only new or changed assignments to separate Google Calendars for each class.

## Scope

### Chrome extension foundation

- Manifest V3 extension written in TypeScript.
- Service worker for scan coordination, storage, tab navigation, and export jobs.
- PrairieLearn content script for page detection and assignment extraction.
- Popup with **Scan all classes** and **Open staging area**.
- Staging dashboard as an extension page.
- Chrome Storage API for local assignment and sync metadata.

### PrairieLearn scanning

1. Confirm the user is logged in; never bypass authentication.
2. Find class links on the PrairieLearn home page.
3. Visit each class page in a controlled tab flow.
4. Extract assignment title, class identity, source URL, due date/time, and source status.
5. Bound the scan with visited-URL tracking, a page limit, cancellation, and resumable progress.
6. Merge assignments using a stable ID based on a PrairieLearn assignment ID or canonical URL, not title alone.

The first implementation must target one known PrairieLearn deployment. Keep selectors in a dedicated adapter so other deployments can be added later.

### Compact staging area

- Group assignments by class.
- Default synchronization includes only assignments that are **new or changed** since the last successful sync and have a due date.
- For Stage 1, “changed” means PrairieLearn reports a higher score than the last scan. Completion-state changes are handled by Stage 2.
- Already-synced assignments remain visible but are not exported again.
- Assignments without due dates remain in staging but are excluded from calendar export by default.
- Primary action: **Sync assignments**.
- The staging area shows assignment details and due-date edits without per-assignment selection controls.
- A user can enter a due date/time for a missing-date assignment in staging. Once a valid date is entered, it becomes eligible for synchronization.

### Separate Google Calendar per class

- Fetch writable calendars after OAuth authorization.
- Let the user map each PrairieLearn class to a Google Calendar.
- Offer **Create calendar for this class** with a name such as `PrairieLearn — CS 225`.
- Make class-to-calendar mapping visible in staging and export preview.
- Allow the user to change a mapping later, but require confirmation before moving existing events.
- Keep one fallback default calendar for classes without an explicit mapping.

### Event creation and duplicate protection

Store an assignment-to-event record containing:

```ts
type CalendarSync = {
  assignmentId: string;
  calendarId: string;
  googleEventId: string;
  sourceFingerprint: string;
  lastSyncedAt: string;
  syncStatus: "synced" | "error" | "deleted";
  errorMessage?: string;
};
```

Every created event must include a private marker containing `assignmentId` and the PrairieRun version marker. Before creating an event:

1. Check local sync state.
2. If local state is missing, query the destination calendar for the private marker.
3. Update a matching event instead of creating a duplicate.
4. Make retries idempotent.

Use partial Google Calendar updates so user edits are not overwritten unnecessarily.

### Event format

- Title: `[Course] Assignment title`.
- Timed event when PrairieLearn provides a due date/time: start one hour before the due time and end at the due time.
- Date-only assignments remain excluded by default until the user supplies a due time in staging.
- Configurable reminder, defaulting to 10 minutes.
- Description includes the PrairieLearn source link.

The one-hour block is the calendar event itself. The reminder is separate and configurable.

The one-hour block is the calendar event itself. The reminder is separate and configurable.

## Data model requirements

```ts
type Assignment = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  sourceUrl: string;
  dueAt?: string;
  dueDateOnly?: string;
  timezone?: string;
  sourceFingerprint: string;
  lastKnownScore?: number;
  manuallyEnteredDueAt?: string;
  discoveredAt: string;
  updatedAt: string;
  syncState: "new" | "changed" | "synced" | "stale" | "error";
};
```

## Stage 1 verification

- Parser fixtures for the target PrairieLearn deployment.
- Stable-ID and merge tests.
- Tests proving a repeated export creates no duplicate events.
- Tests for new/changed-only synchronization, where changed means a completion-state change.
- Tests proving assignments without due dates stay excluded by default and become eligible after a staging-area due date is entered.
- Tests proving timed events start exactly one hour before the due time and end at the due time.
- Calendar mapping and calendar-creation tests using a dedicated Google account.
- Manual tests for missing due dates, deleted events, OAuth denial, interrupted scans, and time zones.

## Stage 1 exit criteria

A user can scan all supported classes, review new and changed assignments, map each class to its own Google Calendar, and export without duplicate events while keeping existing events and staged data safe.
