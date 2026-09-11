importScripts("calendar.js");

const ASSIGNMENTS_KEY = "prairierunAssignments";
const CALENDAR_SYNC_KEY = "prairierunCalendarSync";
const SYNC_KEY = "prairierunSyncStatus";
const SETTINGS_KEY = "prairierunSettings";
const defaultSettings = { prairieLearnOrigin: "https://us.prairielearn.com", completionThreshold: 95, defaultReminderMinutes: 10, autoAddToCalendar: true };
let scanInFlight = false;

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...defaultSettings, ...(stored[SETTINGS_KEY] || {}) };
}

function normalizeStoredAssignment(assignment, existing, now) {
  const previousSourceCompletion = existing?.sourceCompletionStatus || existing?.completionStatus;
  const completionChanged = Boolean(existing && assignment.completionStatus && previousSourceCompletion && previousSourceCompletion !== assignment.completionStatus);
  const isNew = !existing;
  const changed = isNew || completionChanged;
  const manuallyEnteredDueAt = existing?.manuallyEnteredDueAt || null;
  const dueAtLocal = manuallyEnteredDueAt || assignment.dueAtLocal || null;
  const manualCompletionStatus = existing?.manualCompletionStatus || null;
  return {
    ...existing, ...assignment, id: assignment.id, dueAtLocal, manuallyEnteredDueAt,
    score: assignment.score ?? existing?.score ?? null,
    sourceCompletionStatus: assignment.completionStatus || existing?.sourceCompletionStatus || "unknown",
    manualCompletionStatus,
    completionStatus: manualCompletionStatus || assignment.completionStatus || existing?.completionStatus || "unknown",
    sourceFingerprint: JSON.stringify({ title: assignment.title, dueAtLocal }),
    discoveredAt: existing?.discoveredAt || now, updatedAt: now,
    syncState: changed ? (isNew ? "new" : "changed") : (existing?.syncState === "error" ? "error" : "synced"),
    selected: changed && dueAtLocal ? (existing?.selected !== false) : Boolean(existing?.selected && dueAtLocal),
  };
}

async function saveScanResult(assignments) {
  const stored = await chrome.storage.local.get(ASSIGNMENTS_KEY);
  const previous = new Map((stored[ASSIGNMENTS_KEY] || []).map((item) => [item.id, item]));
  const now = new Date().toISOString();
  const detectedIds = new Set();
  const merged = assignments.map((item) => {
    const existing = previous.get(item.id);
    const previousSourceCompletion = existing?.sourceCompletionStatus || existing?.completionStatus;
    const completionChanged = Boolean(existing && item.completionStatus && previousSourceCompletion && previousSourceCompletion !== item.completionStatus);
    if (!existing || completionChanged) detectedIds.add(item.id);
    return normalizeStoredAssignment(item, existing, now);
  });
  const scannedIds = new Set(merged.map((item) => item.id));
  const stale = (stored[ASSIGNMENTS_KEY] || []).filter((item) => !scannedIds.has(item.id)).map((item) => ({ ...item, syncState: "stale", selected: false }));
  await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: [...merged, ...stale] });
  return { merged, detectedIds };
}

async function setSyncStatus(status) { await chrome.storage.local.set({ [SYNC_KEY]: status }); }

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Timed out loading PrairieLearn.")); }, 30000);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function readPage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "PRAIRIERUN_READ_PAGE" }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!response?.ok) reject(new Error(response?.error || "Could not read the PrairieLearn page."));
      else resolve(response.data);
    });
  });
}

async function scanCourse(url, progress, index, total) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    const data = await readPage(tab.id);
    if (data.pageType !== "course") throw new Error(`Expected a course page but received ${data.pageType}.`);
    await setSyncStatus({ state: "scanning", current: `Scanning ${data.course?.courseName || url}`, completed: index, total, found: progress.found });
    return data.assignments || [];
  } finally { await chrome.tabs.remove(tab.id).catch(() => undefined); }
}

async function startScan(sourceTabId) {
  await setSyncStatus({ state: "scanning", current: "Reading PrairieLearn home page…", completed: 0, total: 1, found: 0 });
  const home = await readPage(sourceTabId);
  if (home.pageType === "course") {
    const result = await saveScanResult(home.assignments || []);
    await setSyncStatus({ state: "complete", completed: 1, total: 1, found: result.merged.length, current: "Scan complete" });
    return result;
  }
  if (home.pageType !== "home") throw new Error("Open the PrairieLearn home page or a class assessment page before scanning.");
  const settings = await getSettings();
  const courseLinks = (home.courseLinks || []).filter((link) => link.href?.startsWith(settings.prairieLearnOrigin));
  if (!courseLinks.length) throw new Error("No PrairieLearn classes were found. Confirm that you are logged in.");
  const allAssignments = [];
  for (let index = 0; index < courseLinks.length; index += 1) {
    const url = `${courseLinks[index].href.replace(/\/$/, "")}/assessments`;
    const assignments = await scanCourse(url, { found: allAssignments.length }, index, courseLinks.length);
    allAssignments.push(...assignments);
    await setSyncStatus({ state: "scanning", current: `Scanned ${index + 1} of ${courseLinks.length} classes`, completed: index + 1, total: courseLinks.length, found: allAssignments.length });
  }
  const result = await saveScanResult(allAssignments);
  await setSyncStatus({ state: "complete", completed: courseLinks.length, total: courseLinks.length, found: result.merged.length, current: "Scan complete" });
  return result;
}

async function notifyHomeTab(tabId, assignments, detectedIds, autoAdd) {
  const settings = await getSettings();
  let exportResults = [];
  if (autoAdd && settings.autoAddToCalendar) {
    const syncStored = await chrome.storage.local.get(CALENDAR_SYNC_KEY);
    const calendarSync = syncStored[CALENDAR_SYNC_KEY] || {};
    const eligible = assignments.filter((item) => item.dueAtLocal && (
      (detectedIds.has(item.id) && ["new", "changed"].includes(item.syncState))
      || (["completed", "incomplete"].includes(item.completionStatus) && calendarSync[item.id]?.colorStatus !== item.completionStatus)
    ));
    if (eligible.length) exportResults = await PrairieRunCalendar.exportAssignments(eligible);
    exportResults.forEach((result) => {
      const item = assignments.find((entry) => entry.id === result.assignment.id);
      if (item && ["added", "updated"].includes(result.status)) { item.syncState = "synced"; item.selected = false; }
      if (item && result.status === "failed") { item.syncState = "error"; item.errorMessage = result.reason; item.selected = true; }
    });
    if (exportResults.length) await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments });
  }
  chrome.tabs.sendMessage(tabId, { type: "PRAIRIERUN_HOME_SCAN_RESULT", assignments, detectedIds: [...detectedIds], exportResults }).catch(() => undefined);
}

async function runScan(sourceTabId, openWhenNew) {
  if (scanInFlight) return { assignments: [], skipped: true };
  scanInFlight = true;
  try {
    const scan = await startScan(sourceTabId);
    const assignments = scan.merged;
    const newOrChanged = assignments.filter((item) => scan.detectedIds.has(item.id));
    await notifyHomeTab(sourceTabId, assignments, new Set(newOrChanged.map((item) => item.id)), openWhenNew);
    return { assignments, newOrChanged };
  } finally {
    scanInFlight = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PRAIRIERUN_START_SCAN") {
    runScan(message.tabId || sender.tab?.id, false).then((result) => sendResponse({ ok: true, count: result.assignments.length })).catch(async (error) => { await setSyncStatus({ state: "error", current: error.message }); sendResponse({ ok: false, error: error.message }); });
    return true;
  }
  if (message?.type === "PRAIRIERUN_HOME_READY" && sender.tab?.id) {
    runScan(sender.tab.id, true).catch(async (error) => { await setSyncStatus({ state: "error", current: error.message }); });
    return true;
  }
  if (message?.type === "PRAIRIERUN_EXPORT_SELECTED" && sender.tab?.id) {
    const selected = (message.assignments || []).filter((item) => ["new", "changed", "error"].includes(item.syncState) && item.dueAtLocal);
    PrairieRunCalendar.exportAssignments(selected).then(async (results) => {
      const stored = await chrome.storage.local.get(ASSIGNMENTS_KEY);
      const current = stored[ASSIGNMENTS_KEY] || [];
      results.forEach((result) => {
        const item = current.find((entry) => entry.id === result.assignment.id);
        if (item && ["added", "updated"].includes(result.status)) { item.syncState = "synced"; item.selected = false; }
        if (item && result.status === "failed") { item.syncState = "error"; item.errorMessage = result.reason; item.selected = true; }
      });
      await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: current });
      sendResponse({ ok: true, results, assignments: current });
    }).catch((error) => sendResponse({ ok: false, error: error?.message || "Calendar export failed." }));
    return true;
  }
  if (message?.type === "PRAIRIERUN_GET_STATE") {
    chrome.storage.local.get([ASSIGNMENTS_KEY, SYNC_KEY, SETTINGS_KEY]).then((stored) => sendResponse({ ok: true, assignments: stored[ASSIGNMENTS_KEY] || [], sync: stored[SYNC_KEY] || { state: "idle" }, settings: { ...defaultSettings, ...(stored[SETTINGS_KEY] || {}) } }));
    return true;
  }
});
