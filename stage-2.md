# PrairieRun — Stage 2: Completion Status and Calendar Colors

## Goal

On each extension run, detect assignment completion changes and update already-synced Google Calendar events while preserving their title, date, reminder, description, and user edits.

## Completion rules

PrairieRun should support three states:

- `completed`
- `incomplete`
- `unknown`

Completion should be determined in this order:

1. If PrairieLearn explicitly reports the assignment as complete, mark it completed.
2. If PrairieLearn exposes a numeric score or percentage and the score is **strictly above 95%**, mark it completed by default.
3. If the score is 95% or below, mark it incomplete.
4. If no reliable status or score exists, mark it unknown.

The 95% threshold must be configurable in Settings, with 95% as the default. The extension should display whether completion came from an explicit PrairieLearn status, the score threshold, or a manual override.

## Staging-area controls

In customized selection mode, each assignment should have a completion control:

- **Completed**
- **Incomplete**
- **Unknown / use PrairieLearn status**

Changing the control creates a manual override. Show a small indicator such as **Manual status** and provide **Reset to PrairieLearn status**.

Manual overrides should be preserved across rescans until the user resets them. A manual override affects the calendar color but does not alter PrairieLearn data.

Completion changes should appear in the staging summary as:

- “3 assignments completed since last scan”
- “1 assignment reopened”
- “2 assignments need completion review”

## Calendar color rules

- Each class calendar keeps its own class color.
- Incomplete assignments use the class calendar/event color.
- Completed assignments use grey.
- No red color is used for incomplete assignments.
- Unknown assignments keep the class color and are not treated as completed.

If event-level grey coloring is unavailable, preserve the class calendar color and show completion status in the staging area. Do not change the calendar color itself because that would affect every assignment in the class.

Resolve available Google Calendar colors through the API rather than hard-coding numeric color IDs. Apply only a color patch when completion status changes.

## Completion synchronization

For each previously synced assignment:

1. Scan and calculate the current completion state.
2. Compare it with the last stored state.
3. If it changed to completed, patch the existing Google Calendar event color to grey.
4. If it changed back to incomplete, restore the class color.
5. If it is unknown, leave the existing event color unchanged.
6. Update local sync metadata without creating a new event.

For Stage 2, a completion-state change also counts as an assignment change even when the score has not increased. A higher score or a newly completed assignment should be included in the next reconciliation pass, provided the assignment has a due date.

Completion color updates should happen during the scan/export reconciliation flow and should not require the assignment to be newly selected. The user should see these updates in the export preview before they are applied.

Add a setting to disable automatic completion-color updates while still displaying completion status locally.

## Stage 2 verification

- Test explicit PrairieLearn completion indicators.
- Test score values at 94.99%, 95%, and 100%.
- Test missing, malformed, and partial scores.
- Test manual completion overrides and reset behavior.
- Test completed → incomplete transitions.
- Test unknown status does not change calendar colors.
- Test event color updates preserve all other event fields.
- Test repeated scans are idempotent.

## Stage 2 exit criteria

The extension reliably identifies completion using PrairieLearn status or the configurable 95% threshold, allows manual correction in staging, and changes existing completed events to grey without overwriting user event edits or creating duplicates.
