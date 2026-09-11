chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PRAIRIERUN_READ_PAGE") return undefined;
  try {
    const adapter = window.PrairieLearnAdapter;
    if (!adapter) throw new Error("PrairieLearn adapter is unavailable on this page.");
    const currentType = adapter.pageType(location.href, document.title);
    sendResponse({ ok: true, data: {
      pageType: currentType,
      url: location.href,
      title: document.title,
      courseLinks: currentType === "home" ? adapter.getCourseLinks(document, location) : [],
      course: currentType === "course" ? adapter.getCourseIdentity(document, location) : null,
      assignments: currentType === "course" ? adapter.extractAssignments(document, location) : [],
      assignment: currentType === "assignment" ? adapter.extractAssignmentDetail(document, location) : null,
    }});
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || "Could not read this page." });
  }
  return true;
});
