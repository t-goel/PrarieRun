const scanButton = document.querySelector("#scan");
const contextElement = document.querySelector("#context");
const notificationLeadElement = document.querySelector("#notification-lead-hours");
const completionThresholdElement = document.querySelector("#completion-threshold");
const timezoneElement = document.querySelector("#timezone");
const resetDataButton = document.querySelector("#reset-data");
let settings = { notificationLeadMinutes: 240, completionThreshold: 95 };

function showStatus(text, error = false) {
  contextElement.textContent = text;
  contextElement.classList.toggle("error", error);
}
function applySettings(nextSettings = {}) {
  settings = { ...settings, ...nextSettings };
  const minutes = Number(settings.notificationLeadMinutes);
  notificationLeadElement.value = Number.isFinite(minutes) ? String(minutes / 60) : "4";
  completionThresholdElement.value = Number.isFinite(Number(settings.completionThreshold)) ? String(settings.completionThreshold) : "95";
  timezoneElement.value = settings.timezone || "CST";
}
function saveSettings() {
  return chrome.storage.local.set({ prairierunSettings: settings });
}
function sendRuntimeMessage(message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("PrairieRun background scanner did not respond. Reload the extension and try again."));
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    } catch (error) {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });
}
function refreshState() {
  console.log("[PrairieRun] Popup refreshing state");
  sendRuntimeMessage({ type: "PRAIRIERUN_GET_STATE" }).then((response) => {
    if (!response?.ok) return;
    applySettings(response.settings);
    if (response.sync?.state === "scanning") showStatus(`${response.sync.current || "Scanning…"} (${response.sync.found || 0} found)`);
    if (response.sync?.state === "error") showStatus(response.sync.current || "Scan failed.", true);
  }).catch((error) => showStatus(error.message, true));
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  contextElement.textContent = tab?.url?.startsWith("https://us.prairielearn.com/") ? "PrairieLearn detected." : "Open us.prairielearn.com to scan assignments.";
});

scanButton.addEventListener("click", () => {
  console.log("[PrairieRun] Popup scan button clicked");
  scanButton.disabled = true; showStatus("Starting scan…");
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    sendRuntimeMessage({ type: "PRAIRIERUN_START_SCAN", tabId: tab?.id }, 45000).then((response) => {
      scanButton.disabled = false;
      if (!response?.ok) showStatus(response?.error || "Scan failed.", true);
      else contextElement.textContent = "PrairieLearn detected.";
      refreshState();
    }).catch((error) => { scanButton.disabled = false; showStatus(error.message, true); });
  });
});

refreshState();

notificationLeadElement.addEventListener("change", async () => {
  const hours = Number(notificationLeadElement.value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
    notificationLeadElement.value = String(settings.notificationLeadMinutes / 60);
    return;
  }
  settings.notificationLeadMinutes = Math.round(hours * 60);
  await saveSettings();
});

timezoneElement.addEventListener("change", async () => {
  settings.timezone = timezoneElement.value;
  await saveSettings();
});

completionThresholdElement.addEventListener("change", async () => {
  const threshold = Number(completionThresholdElement.value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    completionThresholdElement.value = String(settings.completionThreshold);
    return;
  }
  settings.completionThreshold = Math.round(threshold);
  await saveSettings();
  contextElement.textContent = "Refreshing assignments…";
});

resetDataButton.addEventListener("click", async () => {
  if (!confirm("Clear PrairieRun assignments, sync state, calendar mappings, settings, and cached authorization?")) return;
  resetDataButton.disabled = true;
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  resetDataButton.disabled = false;
  applySettings({ notificationLeadMinutes: 240, completionThreshold: 95, timezone: "CST" });
  showStatus("Test data cleared. Refresh PrairieLearn to scan again.");
});
