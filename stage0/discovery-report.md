# Stage 0 Discovery Report

## Capture reviewed

- Bundle: `prairierun-stage-0-captures-2026-09-11.json`
- Domain: `https://us.prairielearn.com`
- Captures: 7
- Classes represented: CS 411, CS 441, and CS 498DK2

## Confirmed page routes

### Home page

The logged-in home page contains course links such as:

```text
/pl/course_instance/229304
/pl/course_instance/228445
/pl/course_instance/223990
```

The course instance ID is a stable course-level identifier within this deployment.

### Assessments page

Course assessment lists use:

```text
/pl/course_instance/{courseInstanceId}/assessments
```

Rows are represented by table rows. Useful fields include:

- `data-testid="assessment-set-badge"`: assessment group label such as `GA:1` or `Lec:01#1`.
- An assignment link using `/assessment/{assessmentId}/` or `/assessment_instance/{instanceId}/`.
- `data-testid="scorebar"`: visible score percentage.
- A third table cell containing an “until” display string.
- A button with `aria-label="Access details"` and a `data-bs-content` HTML table containing exact start/end timestamps and time-zone abbreviations.

### Assignment detail page

Assessment instances use:

```text
/pl/course_instance/{courseInstanceId}/assessment_instance/{instanceId}/
```

The page includes:

- `main h1` for the assignment title.
- `data-testid="scorebar"` for the current score.
- `data-testid="assessment-questions"` for question-level status.
- The same `Access details` popover and due/end information.

## Important structural finding: base assessments and instances

The assessment list can show both:

- A base assessment row with a **New instance** link, for example `/assessment/2724861/`.
- A numbered assessment instance row, for example `/assessment_instance/14526257/`.

These should not become two calendar events. The prototype adapter groups them using the assessment-set label, normalizing `Lec:01#1` to `Lec:01` and removing `instance #1` from the title. When both are present, the current instance supplies the score/source URL while the base assessment ID supplies the stable assignment key.

## Completion finding

The captured deployment exposes reliable numeric scores. Examples include 0%, 62%, 97%, and 100%. The detail page also exposes question-level statuses such as `complete` and `unanswered`.

The current implementation can safely derive a default completion state from the configured score threshold:

- Score at least 95%: `completed`.
- Score below 95%: `incomplete`.
- Missing score: `unknown`.

The explicit question-level status should remain supplemental until more assignment types are captured. Stage 2 should continue to allow manual override.

## Due-date finding

The visible text omits the year and may omit a time zone, for example:

```text
100% until 23:59, Fri, Sep 11
```

The `Access details` popover contains the stronger source of truth, for example:

```text
2026-09-11 23:59:59 (CDT)
```

The adapter therefore prefers the finite end timestamp from `data-bs-content` and retains both the local timestamp and source time-zone abbreviation. Calendar conversion should happen only after the source time zone is resolved.

## Edge-case decisions

- No assignment at exactly 95% was available. This is not a blocker; the parser's threshold behavior is covered by unit tests at 94.99%, 95%, and 100%.
- Closed or past assignments are out of scope for the current workflow and do not need a dedicated fixture.
- The updated bundle includes no-due-date assignments. For example, `Project Track 2` has a score bar of 0% but an empty due-date cell. The parser must retain it in staging with no due date and exclude it from default calendar export.
- Rows with no assignment link, such as a plain `Project Track 1` row, cannot be safely identified as exportable assignments and should be ignored until a link or stable ID is available.

## Remaining limitations

- The parser prototype is deployment-specific and still needs browser execution against the captured DOM.
- The exact semantics of a `Not started` row without a score are still represented as `unknown`, not automatically incomplete.
- The capture does not establish whether every desired assignment type uses the same score/due-date structure.

## Stage 0 status

**Promising, not fully complete.** The updated capture is sufficient to establish selectors, routes, score parsing, due-date extraction, no-due-date handling, and base/instance deduplication for the captured page types. Exact 95% and closed/past fixtures are not required. The remaining validation is browser execution against the captured DOM and confirmation of any additional assignment types that should be included.
