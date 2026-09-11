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
  function isActionable(item) { return PrairieRunView.isPending(item) && Boolean(item.dueAtLocal); }
  function visibleAssignments() { return assignments.filter((item) => PrairieRunView.displayable(item, settings.showUndatedAssignments)); }
  function selectable() { return visibleAssignments().filter((item) => item.selected && isActionable(item) && item.dueAtLocal); }

  function rowMarkup(item) {
    const status = PrairieRunView.statusLabel(item);
    const completion = item.completionStatus || "unknown";
    const checkbox = isActionable(item)
      ? `<input class="prr-check" type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} aria-label="Select ${escapeHtml(item.title)}" />`
      : `<span class="prr-check-spacer"></span>`;
    const syncBadge = item.syncState === "synced" ? "" : `<span class="prr-sync">${escapeHtml(status)}</span>`;
    return `<li class="list-group-item prr-row">
      <div class="prr-row-main">${checkbox}<div>
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
    panel.querySelector("#prr-show-undated").checked = settings.showUndatedAssignments === true;
    panel.querySelector(".prr-list").innerHTML = listMarkup();
    panel.querySelectorAll("input.prr-check").forEach((input) => input.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === input.dataset.id); if (item) item.selected = input.checked; await persist(); }));
    panel.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
    updateSyncAction();
  }

  async function persist() { await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments }); render(); }

  async function editDueDate(id) {
    const item = assignments.find((entry) => entry.id === id); if (!item) return;
    const current = item.manuallyEnteredDueAt || item.dueAtLocal || "";
    const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", current.replace("T", " ").slice(0, 16));
    if (value === null) return;
    if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; item.selected = false; }
    else {
      const normalized = value.trim().replace("T", " ");
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; }
      item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; item.syncState = item.syncState === "new" ? "new" : "changed"; item.selected = true;
    }
    await persist();
  }

  function exportSelected(singleId = null) {
    const selected = singleId ? assignments.filter((item) => item.id === singleId && isActionable(item) && item.dueAtLocal) : selectable();
    if (!selected.length) return;
    const button = panel.querySelector("#prr-sync-action");
    button.disabled = true; button.textContent = "Connecting…";
    chrome.runtime.sendMessage({ type: "PRAIRIERUN_EXPORT_SELECTED", assignments: selected }, (response) => {
      button.textContent = "Sync selected";
      if (chrome.runtime.lastError || !response?.ok) { alert(response?.error || chrome.runtime.lastError?.message || "Calendar export failed."); render(); return; }
      assignments = response.assignments || assignments;
      render();
      const results = response.results || [];
      const added = results.filter((result) => result.status === "added").length;
      const updated = results.filter((result) => result.status === "updated").length;
      const failed = results.filter((result) => result.status === "failed");
      alert(`Calendar sync complete: ${added} added, ${updated} updated, ${failed.length} failed.${failed.length ? `\n\n${failed.map((result) => `• ${result.assignment.title}: ${result.reason}`).join("\n")}` : ""}`);
    });
  }

  function updateSyncAction() {
    const button = panel.querySelector("#prr-sync-action");
    const dated = visibleAssignments().filter((item) => item.dueAtLocal);
    const allSynced = dated.length > 0 && dated.every((item) => item.syncState === "synced");
    const selected = selectable();
    button.classList.toggle("prr-sync-action--synced", allSynced);
    button.disabled = allSynced || !selected.length;
    button.textContent = allSynced ? "✓ Synced" : selected.length ? "Sync selected" : "Needs sync";
    button.setAttribute("aria-label", allSynced ? "All current assignments are synced" : "Sync selected assignments");
  }

  function buildPanel() {
    const built = document.createElement("div");
    built.id = PANEL_ID;
    built.className = "card";
    built.innerHTML = `<div class="card-header bg-primary text-white prr-header">
      <span>PrairieRun <span class="prr-count"></span></span>
      <div class="prr-header-controls">
        <label class="prr-setting-label"><input type="checkbox" id="prr-show-undated" /> Undated</label>
        <button type="button" class="btn btn-light btn-sm prr-sync-action" id="prr-sync-action" disabled>Needs sync</button>
      </div>
    </div>
    <ul class="list-group list-group-flush prr-list"></ul>`;
    built.querySelector("#prr-show-undated").addEventListener("change", async (event) => { settings.showUndatedAssignments = event.target.checked; await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); render(); });
    built.querySelector("#prr-sync-action").addEventListener("click", () => exportSelected());
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
