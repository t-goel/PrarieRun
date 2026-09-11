(function () {
const CALENDAR_MAPPINGS_KEY = "prairierunCalendarMappings";
const CALENDAR_SYNC_KEY = "prairierunCalendarSync";
const CALENDAR_TOKEN_KEY = "prairierunCalendarToken";
const CALENDAR_COLOR_KEY = "prairierunCalendarColors";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function getCalendarToken() {
  const cached = await chrome.storage.session.get(CALENDAR_TOKEN_KEY);
  if (cached[CALENDAR_TOKEN_KEY]?.accessToken && cached[CALENDAR_TOKEN_KEY].expiresAt > Date.now() + 60_000) {
    return cached[CALENDAR_TOKEN_KEY].accessToken;
  }
  const redirectUri = chrome.identity.getRedirectURL("oauth2");
  const params = new URLSearchParams({
    client_id: "284599557855-m80j0r9kf52uou6n232ekslrrrpmdc9r.apps.googleusercontent.com",
    response_type: "token",
    redirect_uri: redirectUri,
    scope: "https://www.googleapis.com/auth/calendar",
    include_granted_scopes: "true",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: false });
  } catch (_silentError) {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  }
  if (!responseUrl) throw new Error("Google authorization was cancelled.");
  const fragment = new URL(responseUrl).hash.slice(1);
  const result = new URLSearchParams(fragment);
  if (result.get("error")) throw new Error(`Google authorization failed: ${result.get("error_description") || result.get("error")}`);
  const token = result.get("access_token");
  if (!token) throw new Error("Google did not return an access token.");
  const expiresIn = Number(result.get("expires_in")) || 3600;
  await chrome.storage.session.set({ [CALENDAR_TOKEN_KEY]: { accessToken: token, expiresAt: Date.now() + expiresIn * 1000 } });
  return token;
}

async function calendarRequest(path, options = {}, token, attempt = 0) {
  try {
    const response = await fetch(`${CALENDAR_API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    const body = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      return calendarRequest(path, options, token, attempt + 1);
    }
    throw new Error(`Google Calendar request failed (${response.status}): ${body.slice(0, 240)}`);
  } catch (error) {
    const message = String(error?.message || "");
    if (attempt < 2 && !message.startsWith("Google Calendar request failed (4") && !message.startsWith("Google Calendar request failed (5")) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      return calendarRequest(path, options, token, attempt + 1);
    }
    throw error;
  }
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

function eventResource(assignment, calendarId, colorId) {
  const end = eventDateTime(assignment.dueAtLocal, assignment.timezone);
  const endDate = new Date(end);
  const startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
  return {
    summary: `[${assignment.courseName}] ${assignment.title}`,
    description: `PrairieLearn source: ${assignment.sourceUrl}`,
    start: { dateTime: startDate.toISOString(), timeZone: "UTC" },
    end: { dateTime: endDate.toISOString(), timeZone: "UTC" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
    ...(colorId ? { colorId } : {}),
    extendedProperties: { private: { prairieRun: "1", assignmentId: assignment.id, sourceUrl: assignment.sourceUrl, calendarId } },
  };
}

function colorDistanceToGrey(color) {
  const match = String(color || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const values = [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16));
  return Math.max(...values) - Math.min(...values);
}

async function getColorPlan(token, courseKeys) {
  const stored = await chrome.storage.local.get(CALENDAR_COLOR_KEY);
  const saved = stored[CALENDAR_COLOR_KEY] || {};
  const colors = await calendarRequest("/colors", {}, token);
  const eventColors = colors.event || {};
  const colorIds = Object.keys(eventColors);
  const greyColorId = colorIds.sort((a, b) => colorDistanceToGrey(eventColors[a].background) - colorDistanceToGrey(eventColors[b].background))[0];
  const classColorIds = colorIds.filter((id) => id !== greyColorId);
  const classColors = { ...saved.classColors };
  courseKeys.forEach((key, index) => { if (!classColors[key] && classColorIds.length) classColors[key] = classColorIds[index % classColorIds.length]; });
  await chrome.storage.local.set({ [CALENDAR_COLOR_KEY]: { classColors, greyColorId } });
  return { classColors, greyColorId };
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
  const courseKeys = [...new Set(assignments.map((assignment) => assignment.courseInstanceId || assignment.courseName))];
  const colorPlan = await getColorPlan(token, courseKeys);
  for (const assignment of assignments) {
    if (!assignment.dueAtLocal) { results.push({ assignment, status: "skipped", reason: "Missing due date" }); continue; }
    try {
      const courseKey = assignment.courseInstanceId || assignment.courseName;
      const calendar = mappings[courseKey] ? calendars.find((item) => item.id === mappings[courseKey]) : await getOrCreateClassCalendar(assignment.courseName, calendars, token);
      if (!calendar) throw new Error(`Could not find a calendar for ${assignment.courseName}.`);
      mappings[courseKey] = calendar.id;
      const classColorId = colorPlan.classColors[courseKey];
      // Always verify the marked event. A user may have deleted it directly in
      // Google Calendar while the local sync record still has its old event ID.
      let event = await findMarkedEvent(assignment, calendar.id, token);
      const colorId = assignment.completionStatus === "completed"
        ? colorPlan.greyColorId
        : assignment.completionStatus === "unknown" && event?.id
          ? null
          : classColorId;
      const resource = eventResource(assignment, calendar.id, colorId);
      let status;
      if (event?.id) { await calendarRequest(`/calendars/${encodeURIComponent(calendar.id)}/events/${encodeURIComponent(event.id)}`, { method: "PATCH", body: JSON.stringify(resource) }, token); status = "updated"; }
      else { event = await calendarRequest(`/calendars/${encodeURIComponent(calendar.id)}/events`, { method: "POST", body: JSON.stringify(resource) }, token); status = "added"; }
      sync[assignment.id] = { assignmentId: assignment.id, calendarId: calendar.id, googleEventId: event.id, lastSyncedAt: new Date().toISOString(), eventFingerprint: assignment.sourceFingerprint, completionStatus: assignment.completionStatus, syncStatus: "synced" };
      results.push({ assignment, calendar, status, eventId: event.id });
    } catch (error) {
      results.push({ assignment, status: "failed", reason: error?.message || "Unknown Calendar API error" });
    }
  }
  await chrome.storage.local.set({ [CALENDAR_MAPPINGS_KEY]: mappings, [CALENDAR_SYNC_KEY]: sync });
  return results;
}

globalThis.PrairieRunCalendar = { exportAssignments };
})();
