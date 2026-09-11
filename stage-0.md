# PrairieRun — Stage 0: PrairieLearn Discovery and Parser Validation

## Goal

Confirm that PrairieRun can reliably identify classes, assignments, due dates, stable IDs, scores, and completion status from the actual PrairieLearn deployment before building the calendar workflow.

This stage is a technical discovery and validation step. It should not attempt to create Google Calendar events.

## Required inputs

- Exact PrairieLearn domain, including whether it is an institutional deployment.
- A test account or representative saved HTML pages from the target deployment.
- At least one class containing several assignments.
- Examples of assignments that are incomplete, completed, past due, missing a due date, and scored at or near 95% if available.
- Examples of any assignment types that should be included, such as homework, exams, quizzes, labs, or assessments.

Do not commit cookies, access tokens, personal names, grades, or other private student data to the repository. Fixtures should be sanitized or stored locally outside version control when necessary.

## Discovery checklist

### Authentication and navigation

- Confirm the extension can detect logged-in versus logged-out states.
- Confirm the scan can operate within an existing browser session without bypassing authentication.
- Identify whether navigation uses regular page loads, redirects, forms, or a client-side framework.
- Record the pages needed to discover all classes and assignments.
- Identify pagination, infinite scrolling, tabs, filters, and lazy-loaded assignment data.

### Class discovery

Document:

- The home-page selector or URL pattern for class links.
- Stable course/class identifier.
- Display name and term/section information.
- Whether archived or inactive classes appear.
- Whether a user can belong to multiple sections of the same course.

### Assignment discovery

For each assignment type, identify:

- Assignment link and canonical URL.
- Stable assignment/exam identifier.
- Title and description.
- Course relationship.
- Due date and time.
- Time zone or source of time-zone information.
- Open/closed/past status.
- Score, points, percentage, or completion indicator.
- Whether the fields are present on the class page, assignment page, or both.

### Completion and score behavior

Determine whether PrairieLearn exposes:

- Explicit completion status.
- A numeric score or percentage.
- Multiple attempts and which score should be used.
- Partial credit.
- Completion state only after submission or grading.
- Reopened/incomplete behavior after a previously completed assignment.
- Different status representations for different assignment types.

Record the exact source field and parsing rule for every supported state. If no reliable completion signal exists, the parser must return `unknown` rather than infer completion from a due date or page visit.

## Parser prototype

Create a small `prairielearnAdapter` prototype with functions such as:

```ts
isSupportedPage(document: Document, location: Location): boolean
getCourseLinks(document: Document): CourseLink[]
getCourseIdentity(document: Document, location: Location): CourseIdentity
getAssignmentLinks(document: Document): AssignmentLink[]
extractAssignment(
  document: Document,
  location: Location,
  course: CourseIdentity,
): ParsedAssignment
getNextPage(document: Document): string | undefined
```

The adapter should:

- Prefer stable semantic identifiers and canonical URLs over CSS position.
- Keep selectors in one module.
- Support fallback selectors where the deployment has more than one layout.
- Normalize whitespace, dates, URLs, scores, and status values.
- Return field-level warnings when a value is missing or ambiguous.
- Never silently discard an assignment because one optional field is absent.

## Fixture and test plan

Collect sanitized fixtures for:

- Logged-out home page.
- Logged-in home page with one or more classes.
- Class page with assignments.
- Assignment detail page with a due date.
- Assignment with no due date.
- Completed assignment.
- Incomplete assignment.
- Scores below 95%, exactly 95%, and above 95%.
- Assignment with multiple attempts if applicable.
- Closed, archived, or past assignment.
- Paginated or dynamically loaded assignment list.
- Unsupported or partially loaded page.

Write automated parser tests that assert:

- Every expected assignment is discovered exactly once.
- Stable IDs remain the same across rescans.
- Course identity is attached correctly.
- Dates preserve the correct time zone.
- Scores parse correctly at threshold boundaries.
- Unknown or ambiguous completion states remain `unknown`.
- Missing optional fields produce warnings, not dropped records.
- Repeated parsing is deterministic.

## Discovery output

At the end of Stage 0, produce:

1. A field-mapping table from PrairieLearn UI/data to the internal `Assignment` model.
2. A list of supported page types and assignment types.
3. The final selector/URL adapter configuration.
4. Sanitized parser fixtures and automated test results.
5. A list of known limitations and unsupported cases.
6. A recommendation for whether the 95% completion rule is safe for this deployment.
7. A scan-size estimate, including the maximum number of pages expected for a typical account.

## Go/no-go criteria for Stage 1

Proceed to Stage 1 only if:

- The target deployment and authentication flow are known.
- All required classes can be discovered from the home page or a documented alternate route.
- Assignment identity is stable enough for duplicate prevention.
- Due dates can be parsed for the supported assignment types.
- Completion/score behavior is understood, or unsupported completion states are explicitly marked `unknown`.
- Parser tests pass for the representative fixtures.
- The scan can be bounded, cancelled, and resumed without revisiting assignments indefinitely.

If these criteria fail, narrow Stage 1 to the subset of page and assignment types that are reliably supported rather than presenting incomplete scanning as universal coverage.

## Stage 0 is complete when

A local parser prototype can process representative pages from the actual PrairieLearn deployment and produce a deterministic assignment dataset with documented confidence for identity, due date, and completion fields. No Google Calendar integration work should be considered complete before this validation passes.

