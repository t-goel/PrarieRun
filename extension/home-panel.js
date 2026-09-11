(function () {
  const PANEL_ID = "prairierun-home-panel";
  const SETTINGS_KEY = "prairierunSettings";
  let assignments = [];
  let settings = { autoAddToCalendar: true };
  let panel;

  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
  function dueLabel(item) { return item.dueAtLocal ? `${item.dueAtLocal}${item.timezone ? ` (${item.timezone})` : ""}` : "No due date"; }
  function isCollapsed(item) {
    if (item.syncState === "synced") return true;
    return item.completionStatus && !item.dueAtLocal && !["new", "changed", "error"].includes(item.syncState);
  }
  function isActionable(item) { return !isCollapsed(item) && ["new", "changed", "error"].includes(item.syncState); }
  function selectedAssignments() { return assignments.filter((item) => item.selected && isActionable(item) && item.dueAtLocal); }

  function assignmentMarkup(item) {
    const status = item.syncState === "changed" ? "Changed" : item.syncState === "new" ? "New" : item.syncState === "error" ? "Error" : "Synced";
    const completion = item.manualCompletionStatus || item.completionStatus || "unknown";
    const checkbox = isActionable(item) ? `<input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} />` : "<span></span>";
    return `<div class="prr-assignment">${checkbox}<div><a class="prr-title" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Untitled assignment")}</a><div class="prr-meta"><span>${status}</span><span>${escapeHtml(completion)}</span><span>${escapeHtml(dueLabel(item))}</span>${item.score != null ? `<span>${item.score}%</span>` : ""}</div></div><div class="prr-actions"><select data-completion-id="${escapeHtml(item.id)}"><option value="" ${!item.manualCompletionStatus ? "selected" : ""}>Use PrairieLearn</option><option value="completed" ${completion === "completed" && item.manualCompletionStatus ? "selected" : ""}>Completed</option><option value="incomplete" ${completion === "incomplete" && item.manualCompletionStatus ? "selected" : ""}>Incomplete</option><option value="unknown" ${completion === "unknown" && item.manualCompletionStatus ? "selected" : ""}>Unknown</option></select><button data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit date" : "Add date"}</button></div></div>`;
  }

  function render() {
    if (!panel) return;
    const groups = new Map();
    assignments.forEach((item) => { const key = item.courseInstanceId || item.courseName || "Unknown class"; if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] }); groups.get(key).items.push(item); });
    const body = [...groups.values()].map((group) => {
      const visible = group.items.filter((item) => !isCollapsed(item));
      const collapsed = group.items.filter(isCollapsed);
      return `<section class="prr-course"><div class="prr-course-name">${escapeHtml(group.name)}</div>${visible.map(assignmentMarkup).join("")}${collapsed.length ? `<details><summary>Show ${collapsed.length} previous or unknown assignment${collapsed.length === 1 ? "" : "s"}</summary>${collapsed.map(assignmentMarkup).join("")}</details>` : ""}</section>`;
    }).join("");
    const eligible = selectedAssignments().length;
    panel.innerHTML = `<div class="prr-header"><div><strong>PrairieRun</strong><span>${assignments.length} assignments</span></div><div class="prr-controls"><label><input id="prr-auto-add" type="checkbox" ${settings.autoAddToCalendar !== false ? "checked" : ""} /> Auto-add new or changed</label><button id="prr-quick-add" ${eligible ? "" : "disabled"}>Quick add selected</button></div></div><div class="prr-list">${body || "<p>No assignments found yet.</p>"}</div>`;
    panel.querySelector("#prr-auto-add").addEventListener("change", async (event) => { settings.autoAddToCalendar = event.target.checked; await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); });
    panel.querySelector("#prr-quick-add").addEventListener("click", () => exportSelected());
    panel.querySelectorAll("input[data-id]").forEach((input) => input.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === input.dataset.id); if (item) item.selected = input.checked; await persist(); }));
    panel.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
    panel.querySelectorAll("select[data-completion-id]").forEach((select) => select.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === select.dataset.completionId); if (!item) return; item.manualCompletionStatus = select.value || null; item.completionStatus = item.manualCompletionStatus || item.sourceCompletionStatus || "unknown"; item.syncState = "changed"; if (item.dueAtLocal) item.selected = true; await persist(); }));
  }

  async function persist() { await chrome.storage.local.set({ prairierunAssignments: assignments }); render(); }
  async function editDueDate(id) {
    const item = assignments.find((entry) => entry.id === id); if (!item) return;
    const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", (item.manuallyEnteredDueAt || item.dueAtLocal || "").replace("T", " ").slice(0, 16));
    if (value === null) return;
    if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; item.selected = false; }
    else { const normalized = value.trim().replace("T", " "); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; } item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; item.syncState = item.syncState === "new" ? "new" : "changed"; item.selected = true; }
    await persist();
  }
  function exportSelected() {
    const selected = selectedAssignments();
    if (!selected.length) return;
    const button = panel.querySelector("#prr-quick-add"); button.disabled = true; button.textContent = "Connecting…";
    chrome.runtime.sendMessage({ type: "PRAIRIERUN_EXPORT_SELECTED", assignments: selected }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) { alert(response?.error || chrome.runtime.lastError?.message || "Calendar export failed."); render(); return; }
      assignments = response.assignments || assignments; render();
      const failed = (response.results || []).filter((result) => result.status === "failed");
      alert(`Calendar sync complete: ${(response.results || []).filter((result) => result.status === "added").length} added, ${(response.results || []).filter((result) => result.status === "updated").length} updated, ${failed.length} failed.`);
    });
  }
  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    panel = document.createElement("section"); panel.id = PANEL_ID; panel.setAttribute("aria-label", "PrairieRun assignments");
    const courseComponent = document.querySelector('[data-component="HomeCards"]');
    const courseCard = courseComponent?.querySelector(".card");
    if (courseComponent && courseCard) { courseComponent.append(panel); panel.innerHTML = `<div class="prr-header"><strong>Scanning PrairieRun assignments…</strong></div>`; chrome.storage.local.get(SETTINGS_KEY).then((stored) => { settings = { ...settings, ...(stored[SETTINGS_KEY] || {}) }; render(); }); return; }
    const link = [...document.querySelectorAll("a[href]")].find((anchor) => /\/pl\/course_instance\/\d+/.test(anchor.href));
    const list = link?.closest("ul,ol");
    if (list?.parentElement) list.parentElement.insertBefore(panel, list.nextSibling); else if (link?.parentElement) link.parentElement.insertAdjacentElement("afterend", panel); else document.body.prepend(panel);
    panel.innerHTML = `<div class="prr-header"><strong>PrairieRun</strong><span>Scanning assignments…</span></div>`;
    chrome.storage.local.get(SETTINGS_KEY).then((stored) => { settings = { ...settings, ...(stored[SETTINGS_KEY] || {}) }; render(); });
  }
  function update(nextAssignments) { assignments = nextAssignments || []; render(); }
  window.PrairieRunHomePanel = { mount, update };
})();
