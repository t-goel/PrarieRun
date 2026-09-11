const scanButton = document.querySelector("#scan");
const statusElement = document.querySelector("#status");
const contextElement = document.querySelector("#context");

function showStatus(text, error = false) { statusElement.textContent = text; statusElement.classList.toggle("error", error); }
function refreshState() {
  chrome.runtime.sendMessage({ type: "PRAIRIERUN_GET_STATE" }, (response) => {
    if (!response?.ok) return;
    const assignments = response.assignments || [];
    const eligible = assignments.filter((item) => ["new", "changed"].includes(item.syncState) && item.dueAtLocal);
    document.querySelector("#new-count").textContent = String(eligible.length);
    document.querySelector("#staged-count").textContent = String(assignments.length);
    if (response.sync?.state === "scanning") showStatus(`${response.sync.current || "Scanning…"} (${response.sync.found || 0} found)`);
    if (response.sync?.state === "complete") showStatus(`Scan complete: ${response.sync.found || 0} assignments found.`);
    if (response.sync?.state === "error") showStatus(response.sync.current || "Scan failed.", true);
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  contextElement.textContent = tab?.url?.startsWith("https://us.prairielearn.com/") ? "PrairieLearn detected." : "Open us.prairielearn.com to scan assignments.";
});

scanButton.addEventListener("click", () => {
  scanButton.disabled = true; showStatus("Starting scan…");
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.runtime.sendMessage({ type: "PRAIRIERUN_START_SCAN", tabId: tab?.id }, (response) => {
      scanButton.disabled = false;
      if (chrome.runtime.lastError || !response?.ok) showStatus(response?.error || chrome.runtime.lastError?.message || "Scan failed.", true);
      else showStatus(`Scan complete: ${response.count} assignments found.`);
      refreshState();
    });
  });
});

document.querySelector("#open-staging").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("staging.html") }));
refreshState();
