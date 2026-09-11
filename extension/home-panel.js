(function () {
  if (window.PrairieRunHomePanel) return;
  const PANEL_ID = "prairierun-home-panel";
  const SETTINGS_KEY = "prairierunSettings";
  const ASSIGNMENTS_KEY = "prairierunAssignments";
  let assignments = [];
  let settings = { autoAddToCalendar: true };
  let panel;

  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
  function dueLabel(item) { return item.dueAtLocal ? `${item.dueAtLocal}${item.timezone ? ` (${item.timezone})` : ""}` : "No due date"; }
  function isCollapsed(item) {
    if (item.syncState === "synced") return true;
    if (!item.dueAtLocal && item.completionStatus && !["new", "changed", "error"].includes(item.syncState)) return true;
    if (item.completionStatus === "unknown" && !["new", "changed", "error"].includes(item.syncState)) return true;
    return false;
  }
  function isActionable(item) { return !isCollapsed(item) && ["new", "changed", "error"].includes(item.syncState); }
  function selectable() { return assignments.filter((item) => item.selected && isActionable(item) && item.dueAtLocal); }

  function rowMarkup(item) {
    const status = item.syncState === "changed" ? "Changed" : item.syncState === "new" ? "New" : item.syncState === "error" ? "Error" : "Synced";
    const completion = item.manualCompletionStatus || item.completionStatus || "unknown";
    const checkbox = isActionable(item)
      ? `<input class="prr-check" type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} aria-label="Select ${escapeHtml(item.title)}" />`
      : `<span class="prr-check-spacer"></span>`;
    return `<li class="list-group-item prr-row">
      <div class="prr-row-main">${checkbox}<div>
        <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled assignment")}</a>
        <div class="prr-meta text-muted">${escapeHtml(status)} · ${escapeHtml(completion)} · ${escapeHtml(dueLabel(item))}${item.score != null ? ` · ${item.score}%` : ""}</div>
      </div></div>
      <div class="prr-actions">
        <select class="prr-select" data-completion-id="${escapeHtml(item.id)}" aria-label="Completion status for ${escapeHtml(item.title)}">
          <option value="" ${!item.manualCompletionStatus ? "selected" : ""}>Use PrairieLearn</option>
          <option value="completed" ${completion === "completed" && item.manualCompletionStatus ? "selected" : ""}>Completed</option>
          <option value="incomplete" ${completion === "incomplete" && item.manualCompletionStatus ? "selected" : ""}>Incomplete</option>
          <option value="unknown" ${completion === "unknown" && item.manualCompletionStatus ? "selected" : ""}>Unknown</option>
        </select>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit date" : "Add date"}</button>
      </div>
    </li>`;
  }

  function listMarkup() {
    if (!assignments.length) return `<li class="list-group-item text-muted">No assignments found yet.</li>`;
    const groups = new Map();
    assignments.forEach((item) => { const key = item.courseInstanceId || item.courseName || "Unknown class"; if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] }); groups.get(key).items.push(item); });
    return [...groups.values()].map((group) => {
      const visible = group.items.filter((item) => !isCollapsed(item));
      const collapsed = group.items.filter(isCollapsed);
      const collapsedBlock = collapsed.length ? `<li class="list-group-item prr-collapsed"><details><summary class="text-muted">Show ${collapsed.length} previous or unknown assignment${collapsed.length === 1 ? "" : "s"}</summary><ul class="list-group list-group-flush">${collapsed.map(rowMarkup).join("")}</ul></details></li>` : "";
      return `<li class="list-group-item prr-group-header">${escapeHtml(group.name)}</li>${visible.map(rowMarkup).join("")}${collapsedBlock}`;
    }).join("");
  }

  function render() {
    if (!panel) return;
    panel.querySelector(".prr-count").textContent = `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`;
    panel.querySelector("#prr-auto-add").checked = settings.autoAddToCalendar !== false;
    panel.querySelector("#prr-quick-add").disabled = !selectable().length;
    panel.querySelector(".prr-list").innerHTML = listMarkup();
    panel.querySelectorAll("input.prr-check").forEach((input) => input.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === input.dataset.id); if (item) item.selected = input.checked; await persist(); }));
    panel.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
    panel.querySelectorAll("select[data-completion-id]").forEach((select) => select.addEventListener("change", async () => {
      const item = assignments.find((entry) => entry.id === select.dataset.completionId); if (!item) return;
      item.manualCompletionStatus = select.value || null;
      item.completionStatus = item.manualCompletionStatus || item.sourceCompletionStatus || "unknown";
      item.syncState = "changed";
      if (item.dueAtLocal) item.selected = true;
      await persist();
    }));
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

  function exportSelected() {
    const selected = selectable();
    if (!selected.length) return;
    const button = panel.querySelector("#prr-quick-add");
    button.disabled = true; button.textContent = "Connecting…";
    chrome.runtime.sendMessage({ type: "PRAIRIERUN_EXPORT_SELECTED", assignments: selected }, (response) => {
      button.textContent = "Quick add selected";
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

  function buildPanel() {
    const built = document.createElement("div");
    built.id = PANEL_ID;
    built.className = "card";
    built.innerHTML = `<div class="card-header bg-primary text-white prr-header">
      <span>PrairieRun <span class="prr-count"></span></span>
      <div class="prr-header-controls">
        <label class="prr-auto-add-label"><input type="checkbox" id="prr-auto-add" /> Auto-add</label>
        <button type="button" class="btn btn-light btn-sm" id="prr-quick-add" disabled>Quick add selected</button>
      </div>
    </div>
    <ul class="list-group list-group-flush prr-list"></ul>`;
    built.querySelector("#prr-auto-add").addEventListener("change", async (event) => { settings.autoAddToCalendar = event.target.checked; await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); });
    built.querySelector("#prr-quick-add").addEventListener("click", exportSelected);
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

  window.PrairieRunHomePanel = { mount, update };
})();
