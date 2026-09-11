(function () {
  if (window.PrairieRunHomePanel) return;
  const PANEL_ID = "prairierun-home-panel";
  const SETTINGS_KEY = "prairierunSettings";
  const ASSIGNMENTS_KEY = "prairierunAssignments";
  let assignments = [];
  let settings = { showUndatedAssignments: false };
  let panel;

  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
  function dueLabel(item) { return item.dueAtLocal ? `${item.dueAtLocal}${item.timezone ? ` (${item.timezone})` : ""}` : "No due date"; }
  function visibleAssignments() { return assignments.filter((item) => PrairieRunView.displayable(item, settings.showUndatedAssignments)); }

  function rowMarkup(item) {
    const status = PrairieRunView.statusLabel(item);
    const completion = item.completionStatus || "unknown";
    const syncBadge = item.syncState === "synced" ? "" : `<span class="prr-sync">${escapeHtml(status)}</span>`;
    return `<li class="list-group-item prr-row">
      <div class="prr-row-main"><span class="prr-check-spacer" aria-hidden="true"></span><div>
        <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled assignment")}</a>
        <div class="prr-meta text-muted">${syncBadge}${syncBadge ? " " : ""}<span>${escapeHtml(completion)}</span> <span>${escapeHtml(dueLabel(item))}</span>${item.score != null ? ` <span>${item.score}%</span>` : ""}</div>
      </div></div>
      <div class="prr-actions">
        <button type="button" class="btn btn-outline-secondary btn-sm" data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit date" : "Add date"}</button>
      </div>
    </li>`;
  }

  function listMarkup() {
    const current = visibleAssignments().sort(PrairieRunView.compareAssignments);
    if (!current.length) return `<li class="list-group-item text-muted">No assignments due today or later. Scan PrairieLearn to refresh.</li>`;
    const groups = new Map();
    current.forEach((item) => {
      const key = item.courseInstanceId || item.courseName || "Unknown class";
      if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()].map((group) => {
      const uncompleted = group.items.filter((item) => !PrairieRunView.isCompleted(item));
      const completed = group.items.filter(PrairieRunView.isCompleted);
      const topThree = uncompleted.filter((item) => item.dueAtLocal).slice(0, 3);
      const overflow = uncompleted.filter((item) => !topThree.includes(item));
      const overflowBlock = overflow.length ? `<li class="list-group-item prr-collapsed"><details><summary class="text-muted">Show ${overflow.length} more upcoming assignment${overflow.length === 1 ? "" : "s"}</summary>${overflow.map(rowMarkup).join("")}</details></li>` : "";
      const completedBlock = completed.length ? `<li class="list-group-item prr-collapsed"><details><summary class="text-muted">Show ${completed.length} completed assignment${completed.length === 1 ? "" : "s"}</summary>${completed.map(rowMarkup).join("")}</details></li>` : "";
      return `<li class="list-group-item prr-group-header">${escapeHtml(group.name)}</li>${topThree.map(rowMarkup).join("")}${overflowBlock}${completedBlock}`;
    }).join("");
  }

  function render() {
    if (!panel) return;
    const current = visibleAssignments();
    panel.querySelector(".prr-count").textContent = `${current.length} current assignment${current.length === 1 ? "" : "s"}`;
    panel.querySelector("#prr-show-undated").textContent = settings.showUndatedAssignments ? "Hide undated" : "Show undated";
    panel.querySelector(".prr-list").innerHTML = listMarkup();
    panel.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
  }

  async function persist() { await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments }); render(); }

  async function editDueDate(id) {
    const item = assignments.find((entry) => entry.id === id); if (!item) return;
    const current = item.manuallyEnteredDueAt || item.dueAtLocal || "";
    const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", current.replace("T", " ").slice(0, 16));
    if (value === null) return;
    if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; }
    else {
      const normalized = value.trim().replace("T", " ");
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; }
      item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; item.syncState = item.syncState === "new" ? "new" : "changed";
    }
    await persist();
    chrome.runtime.sendMessage({ type: "PRAIRIERUN_ASSIGNMENT_UPDATED", assignment: item }).catch(() => undefined);
  }

  function buildPanel() {
    const built = document.createElement("div");
    built.id = PANEL_ID;
    built.className = "card";
    built.innerHTML = `<div class="card-header bg-primary text-white prr-header">
      <span>PrairieRun <span class="prr-count"></span></span>
      <div class="prr-header-controls">
        <button type="button" class="btn btn-light btn-sm" id="prr-show-undated">Show undated</button>
      </div>
    </div>
    <ul class="list-group list-group-flush prr-list"></ul>`;
    built.querySelector("#prr-show-undated").addEventListener("click", async () => { settings.showUndatedAssignments = !settings.showUndatedAssignments; await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); render(); });
    return built;
  }

  function placePanel() {
    if (document.getElementById(PANEL_ID)) return true;
    const container = document.querySelector('[data-component="HomeCards"]');
    const anchor = container?.querySelector(".card")
      || [...document.querySelectorAll("a[href]")].find((a) => /\/pl\/course_instance\/\d+/.test(a.href))?.closest(".card");
    if (!anchor && !container) return false;
    panel = buildPanel();
    if (anchor?.parentElement) anchor.insertAdjacentElement("afterend", panel);
    else container.append(panel);
    render();
    return true;
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    chrome.storage.local.get([ASSIGNMENTS_KEY, SETTINGS_KEY]).then((stored) => {
      assignments = stored[ASSIGNMENTS_KEY] || [];
      settings = { ...settings, ...(stored[SETTINGS_KEY] || {}) };
      if (placePanel()) return;
      const observer = new MutationObserver(() => { if (placePanel()) observer.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 8000);
    });
  }

  function update(nextAssignments) { assignments = nextAssignments || assignments; if (panel) render(); }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...settings, ...(changes[SETTINGS_KEY].newValue || {}) };
    render();
  });

  window.PrairieRunHomePanel = { mount, update };
})();
