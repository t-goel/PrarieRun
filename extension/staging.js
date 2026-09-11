const ASSIGNMENTS_KEY = "prairierunAssignments";
const SETTINGS_KEY = "prairierunSettings";
let assignments = [];
let settings = { showUndatedAssignments: false };
let autoExportStarted = false;
const listElement = document.querySelector("#assignment-list");
const summaryElement = document.querySelector("#summary");
const noticeElement = document.querySelector("#notice");
const emptyElement = document.querySelector("#empty");

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function dueLabel(item) { return item.dueAtLocal ? `${item.dueAtLocal}${item.timezone ? ` (${item.timezone})` : ""}` : "No due date"; }
function visibleAssignments() { return assignments.filter((item) => PrairieRunView.displayable(item, settings.showUndatedAssignments)); }
function selectedAssignments() { return visibleAssignments().filter((item) => item.selected && isActionableAssignment(item) && item.dueAtLocal); }
function courseAssignments(courseKey) { return visibleAssignments().filter((item) => (item.courseInstanceId || item.courseName || "Unknown class") === courseKey); }
function hasHardChange(item) { return PrairieRunView.isPending(item) && Boolean(item.dueAtLocal); }
function isActionableAssignment(item) { return PrairieRunView.isPending(item) && Boolean(item.dueAtLocal); }

function renderAssignment(item) {
  const status = PrairieRunView.statusLabel(item);
  const completion = item.manualCompletionStatus || item.completionStatus || "unknown";
  const checkbox = isActionableAssignment(item) ? `<input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} aria-label="Select ${escapeHtml(item.title)}" />` : "<span></span>";
  const syncBadge = item.syncState === "synced" ? "" : `<span class="status-pill">${escapeHtml(status)}</span>`;
  return `<div class="assignment">${checkbox}<div><div class="assignment-title">${escapeHtml(item.title || "Untitled assignment")}</div><div class="assignment-meta">${syncBadge}${syncBadge ? " " : ""}<span class="status-pill">${escapeHtml(completion)}</span>${item.manualCompletionStatus ? '<span class="status-pill">Manual status</span>' : ""}<span class="${item.dueAtLocal ? "" : "status-pill warning"}">${escapeHtml(dueLabel(item))}</span>${item.score != null ? `<span>${item.score}%</span>` : ""}</div></div><div class="assignment-actions"><select class="completion-status" data-completion-id="${escapeHtml(item.id)}" aria-label="Completion status for ${escapeHtml(item.title)}"><option value="" ${!item.manualCompletionStatus ? "selected" : ""}>Use PrairieLearn</option><option value="completed" ${completion === "completed" && item.manualCompletionStatus ? "selected" : ""}>Completed</option><option value="incomplete" ${completion === "incomplete" && item.manualCompletionStatus ? "selected" : ""}>Incomplete</option><option value="unknown" ${completion === "unknown" && item.manualCompletionStatus ? "selected" : ""}>Unknown</option></select><button class="edit-due" data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit" : "Add due date"}</button><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">View</a></div></div>`;
}

function render() {
  const current = visibleAssignments().sort((a, b) => Number(PrairieRunView.isCompleted(a)) - Number(PrairieRunView.isCompleted(b)) || PrairieRunView.compareAssignments(a, b));
  const newCount = current.filter((item) => item.syncState === "new").length;
  const changedCount = current.filter((item) => item.syncState === "changed").length;
  const syncedCount = current.filter((item) => item.syncState === "synced").length;
  const errorCount = current.filter((item) => item.syncState === "error").length;
  const missingDateCount = current.filter((item) => !item.dueAtLocal).length;
  const hiddenUndatedCount = assignments.filter((item) => !item.dueAtLocal).length;
  summaryElement.innerHTML = [`<span class="chip">${newCount} new</span>`, `<span class="chip">${changedCount} changed</span>`, `<span class="chip">${syncedCount} synced</span>`, errorCount ? `<span class="chip warning-chip">${errorCount} error${errorCount === 1 ? "" : "s"}</span>` : "", missingDateCount ? `<span class="chip">${missingDateCount} need a date</span>` : ""].join("");
  noticeElement.classList.toggle("hidden", missingDateCount === 0 && (settings.showUndatedAssignments || hiddenUndatedCount === 0));
  noticeElement.textContent = missingDateCount ? `${missingDateCount} undated assignment${missingDateCount === 1 ? "" : "s"} shown. They are excluded from sync until you add a date.` : hiddenUndatedCount ? `${hiddenUndatedCount} undated assignment${hiddenUndatedCount === 1 ? " is" : "s are"} hidden. Use the extension checkbox to show them.` : "";
  emptyElement.classList.toggle("hidden", current.length > 0);

  const groups = new Map();
  current.forEach((item) => { const key = item.courseInstanceId || item.courseName || "Unknown class"; if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] }); groups.get(key).items.push(item); });
  listElement.innerHTML = [...groups.values()].map((group) => {
    const courseKey = group.items[0].courseInstanceId || group.items[0].courseName || "Unknown class";
    const incomplete = group.items.filter((item) => !PrairieRunView.isCompleted(item));
    const completed = group.items.filter(PrairieRunView.isCompleted);
    const completedBlock = completed.length ? `<details class="collapsed-assignments"><summary>Show ${completed.length} completed assignment${completed.length === 1 ? "" : "s"}</summary>${completed.map(renderAssignment).join("")}</details>` : "";
    return `<section class="course"><div class="course-header"><span class="course-name">${escapeHtml(group.name)}</span><span class="course-meta">${group.items.length} current assignment${group.items.length === 1 ? "" : "s"} <button class="course-select" data-course-action="select" data-course-key="${escapeHtml(courseKey)}">Select</button><button class="course-select" data-course-action="deselect" data-course-key="${escapeHtml(courseKey)}">Deselect</button></span></div>${incomplete.map(renderAssignment).join("")}${completedBlock}</section>`;
  }).join("");
  listElement.querySelectorAll("input[data-id]").forEach((input) => input.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === input.dataset.id); if (item) item.selected = input.checked; await persist(); }));
  listElement.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
  listElement.querySelectorAll("select[data-completion-id]").forEach((select) => select.addEventListener("change", async () => {
    const item = assignments.find((entry) => entry.id === select.dataset.completionId); if (!item) return;
    item.manualCompletionStatus = select.value || null;
    item.completionStatus = item.manualCompletionStatus || item.sourceCompletionStatus || "unknown";
    item.syncState = "changed";
    if (item.dueAtLocal) item.selected = true;
    await persist();
  }));
  updateSyncAction();
  listElement.querySelectorAll("button[data-course-action]").forEach((button) => button.addEventListener("click", async () => {
    courseAssignments(button.dataset.courseKey).forEach((item) => { item.selected = button.dataset.courseAction === "select" && isActionableAssignment(item) && Boolean(item.dueAtLocal); });
    await persist();
  }));
  updateExportButtons();
}

async function persist() { await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments }); render(); }
async function persistSettings() { await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); }
async function editDueDate(id) {
  const item = assignments.find((entry) => entry.id === id); if (!item) return;
  const current = item.manuallyEnteredDueAt || item.dueAtLocal || "";
  const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", current.replace("T", " ").slice(0, 16));
  if (value === null) return;
  if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; item.selected = false; }
  else { const normalized = value.trim().replace("T", " "); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; } item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; item.syncState = item.syncState === "new" ? "new" : "changed"; item.selected = true; }
  await persist();
}
async function exportSelected(singleId = null, closeOnSuccess = false) {
  const selected = (singleId ? assignments.filter((item) => item.id === singleId && isActionableAssignment(item)) : selectedAssignments()).filter((item) => item.dueAtLocal);
  const button = document.querySelector("#sync-action");
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    const results = await window.PrairieRunCalendar.exportAssignments(selected);
    results.forEach((result) => {
      const item = assignments.find((entry) => entry.id === result.assignment.id);
      if (item && ["added", "updated"].includes(result.status)) { item.syncState = "synced"; item.selected = false; }
      if (item && result.status === "failed") { item.syncState = "error"; item.errorMessage = result.reason; item.selected = true; }
    });
    await persist();
    const added = results.filter((result) => result.status === "added").length;
    const updated = results.filter((result) => result.status === "updated").length;
    const failed = results.filter((result) => result.status === "failed");
    const detail = failed.length ? `\n\nFailed items remain selected for retry:\n${failed.map((result) => `• ${result.assignment.title}: ${result.reason}`).join("\n")}` : "";
    alert(`Calendar sync complete: ${added} added, ${updated} updated, ${failed.length} failed.${detail}`);
    if (closeOnSuccess && !failed.length) {
      chrome.tabs.getCurrent((tab) => { if (tab?.id) chrome.tabs.remove(tab.id); });
    }
  } catch (error) {
    alert(error?.message || "Google Calendar export failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Sync selected";
  }
}

function maybeAutoExport() {
  if (!new URLSearchParams(location.search).has("auto") || autoExportStarted) return;
  if (!selectedAssignments().some(hasHardChange)) return;
  autoExportStarted = true;
  exportSelected(null, true);
}

function updateExportButtons() {
  const enabled = selectedAssignments().some(hasHardChange);
  document.querySelector("#sync-action").disabled = !enabled;
}

function updateSyncAction() {
  const button = document.querySelector("#sync-action");
  const dated = visibleAssignments().filter((item) => item.dueAtLocal);
  const allSynced = dated.length > 0 && dated.every((item) => item.syncState === "synced");
  const selected = selectedAssignments();
  button.classList.toggle("sync-action--synced", allSynced);
  button.disabled = allSynced || !selected.length;
  button.textContent = allSynced ? "✓ Synced" : selected.length ? "Sync selected" : "Needs sync";
}

document.querySelector("#sync-action").addEventListener("click", () => {
  if (!selectedAssignments().some(hasHardChange)) return;
  exportSelected(null, true);
});
chrome.runtime.onMessage.addListener((message) => { if (message?.type === "PRAIRIERUN_AUTO_ADD") maybeAutoExport(); });
chrome.storage.local.get(ASSIGNMENTS_KEY).then((stored) => { assignments = stored[ASSIGNMENTS_KEY] || []; render(); maybeAutoExport(); });
chrome.storage.local.get(SETTINGS_KEY).then((stored) => {
  settings = { ...settings, ...(stored[SETTINGS_KEY] || {}) };
  document.querySelector("#show-undated-setting").checked = settings.showUndatedAssignments === true;
  maybeAutoExport();
});

document.querySelector("#show-undated-setting").addEventListener("change", async (event) => {
  settings.showUndatedAssignments = event.target.checked;
  await persistSettings();
  render();
});
