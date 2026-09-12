chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[PrairieRun] Content script received message", message?.type);
  if (message?.type === "PRAIRIERUN_HOME_SCAN_RESULT") {
    window.PrairieRunHomePanel?.update(message.assignments || []);
    return false;
  }
  if (message?.type !== "PRAIRIERUN_READ_PAGE") return undefined;
  chrome.storage.local.get("prairierunSettings").then((stored) => {
    try {
      const adapter = window.PrairieLearnAdapter;
      if (!adapter) throw new Error("PrairieLearn adapter is unavailable on this page.");
      const threshold = Number(stored.prairierunSettings?.completionThreshold);
      const completionThreshold = Number.isFinite(threshold) ? Math.max(0, Math.min(100, threshold)) : 95;
      const currentType = adapter.pageType(location.href, document.title);
      sendResponse({ ok: true, data: {
        pageType: currentType,
        url: location.href,
        title: document.title,
        courseLinks: currentType === "home" ? adapter.getCourseLinks(document, location) : [],
        course: currentType === "course" ? adapter.getCourseIdentity(document, location) : null,
        assignments: currentType === "course" ? adapter.extractAssignments(document, location, completionThreshold) : [],
        assignment: currentType === "assignment" ? adapter.extractAssignmentDetail(document, location, completionThreshold) : null,
      }});
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Could not read this page." });
    }
  }).catch((error) => sendResponse({ ok: false, error: error?.message || "Could not read PrairieRun settings." }));
  return true;
});

if (window.PrairieLearnAdapter?.pageType(location.href, document.title) === "home") {
  console.log("[PrairieRun] PrairieLearn home content script ready", location.href);
  window.PrairieRunHomePanel?.mount();
  chrome.runtime.sendMessage({ type: "PRAIRIERUN_HOME_READY", url: location.href }).catch(() => undefined);
}
