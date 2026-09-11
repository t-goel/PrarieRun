if (!globalThis.PrairieRunCalendar) importScripts("calendar.js");

const ASSIGNMENTS_KEY = "prairierunAssignments";
const SYNC_KEY = "prairierunSyncStatus";
const SETTINGS_KEY = "prairierunSettings";
const BACKGROUND_CALENDAR_SYNC_KEY = "prairierunCalendarSync";
const DEBUG_LOG_KEY = "prairierunDebugLog";
const defaultSettings = { prairieLearnOrigin: "https://us.prairielearn.com", completionThreshold: 95, defaultReminderMinutes: 10, notificationLeadMinutes: 240, showUndatedAssignments: false };
let scanInFlight = false;
const debugEntries = [];

function debugLog(message, details) {
  const entry = { at: new Date().toISOString(), message, ...(details === undefined ? {} : { details }) };
  debugEntries.push(entry);
  if (debugEntries.length > 100) debugEntries.shift();
  console.log(`[PrairieRun] ${message}`, details ?? "");
  try {
    const pending = chrome.storage.local.set({ [DEBUG_LOG_KEY]: debugEntries });
    pending?.catch?.(() => undefined);
  } catch (_error) {
    // Logging must never interrupt scanning.
  }
}

debugLog("Background service worker loaded");

function localDateKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isCurrentAssignment(assignment) {
  const dueDate = String(assignment?.dueAtLocal || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!dueDate) return false;
  const today = new Date();
  return dueDate >= localDateKey(today);
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...defaultSettings, ...(stored[SETTINGS_KEY] || {}) };
}

function normalizeStoredAssignment(assignment, existing, now, syncedCompletion) {
  const referenceCompletion = syncedCompletion || existing?.completionStatus;
  const completionChanged = Boolean(existing && assignment.completionStatus && referenceCompletion && referenceCompletion !== assignment.completionStatus);
  const isNew = !existing;
  const changed = isNew || completionChanged;
  const existingClean = { ...(existing || {}) };
  delete existingClean.manualCompletionStatus;
  delete existingClean.sourceCompletionStatus;
  const manuallyEnteredDueAt = existing?.manuallyEnteredDueAt || null;
  const dueAtLocal = manuallyEnteredDueAt || assignment.dueAtLocal || null;
  return {
    ...existingClean, ...assignment, id: assignment.id, dueAtLocal, manuallyEnteredDueAt,
    score: assignment.score ?? existing?.score ?? null,
    completionStatus: assignment.completionStatus || existing?.completionStatus || "unknown",
    sourceFingerprint: JSON.stringify({ title: assignment.title, dueAtLocal }),
    discoveredAt: existing?.discoveredAt || now, updatedAt: now,
    syncState: changed ? (isNew ? "new" : "changed") : (existing?.syncState === "error" ? "error" : "synced"),
  };
}

async function saveScanResult(assignments) {
  const stored = await chrome.storage.local.get([ASSIGNMENTS_KEY, BACKGROUND_CALENDAR_SYNC_KEY]);
  const previous = new Map((stored[ASSIGNMENTS_KEY] || []).map((item) => [item.id, item]));
  const calendarSync = stored[BACKGROUND_CALENDAR_SYNC_KEY] || {};
  const now = new Date().toISOString();
  const detectedIds = new Set();
  const merged = assignments.map((item) => {
    const existing = previous.get(item.id);
    const syncedCompletion = calendarSync[item.id]?.completionStatus;
    const referenceCompletion = syncedCompletion || existing?.completionStatus;
    const completionChanged = Boolean(existing && item.completionStatus && referenceCompletion && referenceCompletion !== item.completionStatus);
    if (!existing || completionChanged) detectedIds.add(item.id);
    return normalizeStoredAssignment(item, existing, now, syncedCompletion);
  });
  const scannedIds = new Set(merged.map((item) => item.id));
  const stale = (stored[ASSIGNMENTS_KEY] || []).filter((item) => !scannedIds.has(item.id)).map((item) => ({ ...item, syncState: "stale" }));
  await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: [...merged, ...stale] });
  return { merged, detectedIds };
}

async function setSyncStatus(status) { await chrome.storage.local.set({ [SYNC_KEY]: status }); }

function waitForTabComplete(tabId) {
  debugLog("Waiting for tab to finish loading", { tabId });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) { debugLog("Tab load failed", { tabId, error: error.message }); reject(error); }
      else { debugLog("Tab finished loading", { tabId }); resolve(); }
    };
    const timeout = setTimeout(() => finish(new Error("Timed out loading PrairieLearn.")), 30000);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) { finish(new Error(chrome.runtime.lastError.message)); return; }
      if (tab?.status === "complete") { finish(); return; }
    });
  });
}

function readPage(tabId) {
  debugLog("Requesting page data", { tabId });
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "PRAIRIERUN_READ_PAGE" }, (response) => {
      if (chrome.runtime.lastError) {
        const error = new Error(chrome.runtime.lastError.message);
        debugLog("Page data request failed", { tabId, error: error.message });
        reject(error);
      } else if (!response?.ok) {
        const error = new Error(response?.error || "Could not read the PrairieLearn page.");
        debugLog("Page returned an error", { tabId, error: error.message });
        reject(error);
      } else {
        debugLog("Page data received", { tabId, pageType: response.data?.pageType, assignmentCount: response.data?.assignments?.length || 0 });
        resolve(response.data);
      }
    });
  });
}

async function readPageWhenReady(tabId) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await readPage(tabId);
    } catch (error) {
      lastError = error;
      debugLog("Retrying page read", { tabId, attempt: attempt + 1, error: error.message });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("Could not read the PrairieLearn page.");
}

async function scanCourse(url, progress, index, total) {
  debugLog("Opening course tab", { url, index: index + 1, total });
  const tab = await chrome.tabs.create({ url, active: false });
  debugLog("Course tab created", { tabId: tab.id, url });
  try {
    await waitForTabComplete(tab.id);
    const data = await readPageWhenReady(tab.id);
    if (data.pageType !== "course") {
      debugLog("Unexpected page type in course tab", { tabId: tab.id, pageType: data.pageType, url });
      throw new Error(`Expected a course page but received ${data.pageType}.`);
    }
    debugLog("Course assignments extracted", { tabId: tab.id, count: data.assignments?.length || 0 });
    await setSyncStatus({ state: "scanning", current: `Scanning ${data.course?.courseName || url}`, completed: index, total, found: progress.found });
    return data.assignments || [];
  } finally { await chrome.tabs.remove(tab.id).catch(() => undefined); }
}

async function startScan(sourceTabId) {
  debugLog("Scan started", { sourceTabId });
  await setSyncStatus({ state: "scanning", current: "Reading PrairieLearn home page…", completed: 0, total: 1, found: 0 });
  const home = await readPage(sourceTabId);
  debugLog("Source page classified", { sourceTabId, pageType: home.pageType, courseLinkCount: home.courseLinks?.length || 0, assignmentCount: home.assignments?.length || 0 });
  if (home.pageType === "course") {
    const result = await saveScanResult(home.assignments || []);
    await setSyncStatus({ state: "complete", completed: 1, total: 1, found: result.merged.length, current: "Scan complete" });
    return result;
  }
  if (home.pageType !== "home") throw new Error("Open the PrairieLearn home page or a class assessment page before scanning.");
  const settings = await getSettings();
  const courseLinks = (home.courseLinks || []).filter((link) => link.href?.startsWith(settings.prairieLearnOrigin));
  debugLog("Course links filtered", { discovered: home.courseLinks?.length || 0, usable: courseLinks.length, origin: settings.prairieLearnOrigin });
  if (!courseLinks.length) throw new Error("No PrairieLearn classes were found. Confirm that you are logged in.");
  const allAssignments = [];
  for (let index = 0; index < courseLinks.length; index += 1) {
    const url = `${courseLinks[index].href.replace(/\/$/, "")}/assessments`;
    const assignments = await scanCourse(url, { found: allAssignments.length }, index, courseLinks.length);
    allAssignments.push(...assignments);
    await setSyncStatus({ state: "scanning", current: `Scanned ${index + 1} of ${courseLinks.length} classes`, completed: index + 1, total: courseLinks.length, found: allAssignments.length });
  }
  const result = await saveScanResult(allAssignments);
  debugLog("Scan results saved", { assignmentCount: result.merged.length, detectedCount: result.detectedIds.size });
  await setSyncStatus({ state: "complete", completed: courseLinks.length, total: courseLinks.length, found: result.merged.length, current: "Scan complete" });
  return result;
}

function applyExportResults(results, assignments) {
  results.forEach((result) => {
    const item = assignments.find((entry) => entry.id === result.assignment.id);
    if (!item) return;
    if (["added", "updated"].includes(result.status)) { item.syncState = "synced"; item.errorMessage = null; }
    if (result.status === "failed") { item.syncState = "error"; item.errorMessage = result.reason; }
  });
}

async function notifyHomeTab(tabId, assignments, detectedIds) {
  let exportResults = [];
  const eligible = assignments.filter((item) => detectedIds.has(item.id) && item.dueAtLocal && isCurrentAssignment(item));
  if (eligible.length) {
    debugLog("Automatically synchronizing Calendar assignments", { count: eligible.length });
    exportResults = await PrairieRunCalendar.exportAssignments(eligible);
    applyExportResults(exportResults, assignments);
    await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments });
  }
  chrome.tabs.sendMessage(tabId, { type: "PRAIRIERUN_HOME_SCAN_RESULT", assignments, exportResults }).catch(() => undefined);
}

async function runScan(sourceTabId, openWhenNew) {
  if (scanInFlight) { debugLog("Scan ignored because another scan is already running"); return { assignments: [], skipped: true }; }
  scanInFlight = true;
  debugLog("Scan lock acquired", { sourceTabId, openWhenNew });
  try {
    const scan = await startScan(sourceTabId);
    const assignments = scan.merged;
    const newOrChanged = assignments.filter((item) => scan.detectedIds.has(item.id));
    await notifyHomeTab(sourceTabId, assignments, scan.detectedIds);
    return { assignments, newOrChanged };
  } finally {
    scanInFlight = false;
    debugLog("Scan lock released");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PRAIRIERUN_START_SCAN") {
    debugLog("Popup requested scan", { tabId: message.tabId || sender.tab?.id });
    runScan(message.tabId || sender.tab?.id, false).then((result) => sendResponse({ ok: true, count: result.assignments.length })).catch(async (error) => { await setSyncStatus({ state: "error", current: error.message }); sendResponse({ ok: false, error: error.message }); });
    return true;
  }
  if (message?.type === "PRAIRIERUN_HOME_READY" && sender.tab?.id) {
    debugLog("PrairieLearn home reported ready", { tabId: sender.tab.id });
    runScan(sender.tab.id, true).catch(async (error) => { await setSyncStatus({ state: "error", current: error.message }); });
    return true;
  }
  if (message?.type === "PRAIRIERUN_ASSIGNMENT_UPDATED" && sender.tab?.id) {
    const assignment = message.assignment;
    if (!assignment?.id || !assignment.dueAtLocal || !["new", "changed", "error"].includes(assignment.syncState)) {
      sendResponse({ ok: true, skipped: true });
      return true;
    }
    PrairieRunCalendar.exportAssignments([assignment]).then(async (results) => {
      const stored = await chrome.storage.local.get(ASSIGNMENTS_KEY);
      const current = stored[ASSIGNMENTS_KEY] || [];
      applyExportResults(results, current);
      await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: current });
      sendResponse({ ok: true, results, assignments: current });
    }).catch((error) => sendResponse({ ok: false, error: error?.message || "Automatic calendar synchronization failed." }));
    return true;
  }
  if (message?.type === "PRAIRIERUN_GET_STATE") {
    chrome.storage.local.get([ASSIGNMENTS_KEY, SYNC_KEY, SETTINGS_KEY]).then((stored) => sendResponse({ ok: true, assignments: stored[ASSIGNMENTS_KEY] || [], sync: stored[SYNC_KEY] || { state: "idle" }, settings: { ...defaultSettings, ...(stored[SETTINGS_KEY] || {}) } }));
    return true;
  }
});
