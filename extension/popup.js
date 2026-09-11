const scanButton = document.querySelector("#scan");
const statusElement = document.querySelector("#status");
const contextElement = document.querySelector("#context");
const showUndatedElement = document.querySelector("#show-undated");
const autoAddElement = document.querySelector("#auto-add");
const resetDataButton = document.querySelector("#reset-data");
let settings = { autoAddToCalendar: true, showUndatedAssignments: false };

function showStatus(text, error = false) {
  if (statusElement) { statusElement.textContent = text; statusElement.classList.toggle("error", error); return; }
  contextElement.textContent = text;
  contextElement.classList.toggle("error", error);
}
function applySettings(nextSettings = {}) {
  settings = { ...settings, ...nextSettings };
  showUndatedElement.checked = settings.showUndatedAssignments === true;
  autoAddElement.checked = settings.autoAddToCalendar !== false;
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
    if (response.sync?.state === "complete") showStatus(`Scan complete: ${response.sync.found || 0} assignments found.`);
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
      else showStatus(`Scan complete: ${response.count} assignments found.`);
      refreshState();
    }).catch((error) => { scanButton.disabled = false; showStatus(error.message, true); });
  });
});

refreshState();

showUndatedElement.addEventListener("change", async () => {
  settings.showUndatedAssignments = showUndatedElement.checked;
  await saveSettings();
  refreshState();
});

autoAddElement.addEventListener("change", async () => {
  settings.autoAddToCalendar = autoAddElement.checked;
  await saveSettings();
});

resetDataButton.addEventListener("click", async () => {
  if (!confirm("Clear PrairieRun assignments, sync state, calendar mappings, settings, and cached authorization?")) return;
  resetDataButton.disabled = true;
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  resetDataButton.disabled = false;
  applySettings({ autoAddToCalendar: true, showUndatedAssignments: false });
  showStatus("Test data cleared. Refresh PrairieLearn to scan again.");
});
