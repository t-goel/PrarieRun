const CALENDAR_MAPPINGS_KEY = "prairierunCalendarMappings";
const CALENDAR_SYNC_KEY = "prairierunCalendarSync";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function getCalendarToken() {
  const result = await chrome.identity.getAuthToken({ interactive: true });
  if (!result?.token) throw new Error("Google did not return an authorization token.");
  return result.token;
}

async function calendarRequest(path, options = {}, token) {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar request failed (${response.status}): ${body.slice(0, 240)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function listWritableCalendars(token) {
  const result = await calendarRequest("/users/me/calendarList?minAccessRole=writer&showHidden=false", {}, token);
  return result.items || [];
}

async function getOrCreateClassCalendar(courseName, calendars, token) {
  const summary = `PrairieLearn — ${courseName || "Class"}`;
  const existing = calendars.find((calendar) => calendar.summary === summary);
  if (existing) return existing;
  const created = await calendarRequest("/calendars", { method: "POST", body: JSON.stringify({ summary, description: `Assignments imported from PrairieLearn for ${courseName || "this class"}` }) }, token);
  calendars.push(created);
  return created;
}

function timezoneOffset(timezone) {
  return ({ CST: "-06:00", CDT: "-05:00", EST: "-05:00", EDT: "-04:00", MST: "-07:00", MDT: "-06:00", PST: "-08:00", PDT: "-07:00" })[timezone] || null;
}

function eventDateTime(local, timezone) {
  const value = String(local || "").replace(" ", "T");
  const offset = timezoneOffset(timezone);
  if (offset && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return `${value}${offset}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid due date: ${local}`);
  return date.toISOString();
}

function eventResource(assignment, calendarId) {
  const end = eventDateTime(assignment.dueAtLocal, assignment.timezone);
  const endDate = new Date(end);
  const startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
  return {
    summary: `[${assignment.courseName}] ${assignment.title}`,
    description: `PrairieLearn source: ${assignment.sourceUrl}`,
    start: { dateTime: startDate.toISOString(), timeZone: "UTC" },
    end: { dateTime: endDate.toISOString(), timeZone: "UTC" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
    extendedProperties: { private: { prairieRun: "1", assignmentId: assignment.id, sourceUrl: assignment.sourceUrl, calendarId } },
  };
}

async function findMarkedEvent(assignment, calendarId, token) {
  const params = new URLSearchParams({ maxResults: "10", showDeleted: "false", singleEvents: "true" });
  params.append("privateExtendedProperty", "prairieRun=1");
  params.append("privateExtendedProperty", `assignmentId=${assignment.id}`);
  const result = await calendarRequest(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {}, token);
  return (result.items || []).find((event) => event.extendedProperties?.private?.assignmentId === assignment.id) || null;
}

async function exportAssignments(assignments) {
  if (!assignments.length) throw new Error("Select at least one assignment with a due date.");
  const token = await getCalendarToken();
  const calendars = await listWritableCalendars(token);
  const stored = await chrome.storage.local.get([CALENDAR_MAPPINGS_KEY, CALENDAR_SYNC_KEY]);
  const mappings = stored[CALENDAR_MAPPINGS_KEY] || {};
  const sync = stored[CALENDAR_SYNC_KEY] || {};
  const results = [];
  for (const assignment of assignments) {
    if (!assignment.dueAtLocal) { results.push({ assignment, status: "skipped", reason: "Missing due date" }); continue; }
    const courseKey = assignment.courseInstanceId || assignment.courseName;
    const calendar = mappings[courseKey] ? calendars.find((item) => item.id === mappings[courseKey]) : await getOrCreateClassCalendar(assignment.courseName, calendars, token);
    if (!calendar) throw new Error(`Could not find a calendar for ${assignment.courseName}.`);
    mappings[courseKey] = calendar.id;
    const resource = eventResource(assignment, calendar.id);
    const known = sync[assignment.id];
    let event = known?.googleEventId ? { id: known.googleEventId } : await findMarkedEvent(assignment, calendar.id, token);
    let status;
    if (event?.id) { await calendarRequest(`/calendars/${encodeURIComponent(calendar.id)}/events/${encodeURIComponent(event.id)}`, { method: "PATCH", body: JSON.stringify(resource) }, token); status = "updated"; }
    else { event = await calendarRequest(`/calendars/${encodeURIComponent(calendar.id)}/events`, { method: "POST", body: JSON.stringify(resource) }, token); status = "added"; }
    sync[assignment.id] = { assignmentId: assignment.id, calendarId: calendar.id, googleEventId: event.id, lastSyncedAt: new Date().toISOString(), eventFingerprint: assignment.sourceFingerprint, syncStatus: "synced" };
    results.push({ assignment, calendar, status, eventId: event.id });
  }
  await chrome.storage.local.set({ [CALENDAR_MAPPINGS_KEY]: mappings, [CALENDAR_SYNC_KEY]: sync });
  return results;
}

window.PrairieRunCalendar = { exportAssignments };
