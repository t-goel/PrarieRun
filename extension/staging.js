const ASSIGNMENTS_KEY = "prairierunAssignments";
let assignments = [];
let customize = false;
const listElement = document.querySelector("#assignment-list");
const summaryElement = document.querySelector("#summary");
const noticeElement = document.querySelector("#notice");
const emptyElement = document.querySelector("#empty");

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function dueLabel(item) { return item.dueAtLocal ? `${item.dueAtLocal}${item.timezone ? ` (${item.timezone})` : ""}` : "No due date"; }
function selectedAssignments() { return assignments.filter((item) => item.selected); }
function courseAssignments(courseKey) { return assignments.filter((item) => (item.courseInstanceId || item.courseName || "Unknown class") === courseKey); }
function hasHardChange(item) { return ["new", "changed"].includes(item.syncState) && Boolean(item.dueAtLocal); }
function isCollapsedAssignment(item) {
  if (item.syncState === "synced") return true;
  if (!item.dueAtLocal && item.completionStatus) return true;
  if (item.completionStatus === "unknown" && !["new", "changed", "error"].includes(item.syncState)) return true;
  return false;
}

function renderAssignment(item) {
  const status = item.syncState === "changed" ? "Changed" : item.syncState === "new" ? "New" : item.syncState === "stale" ? "Stale" : item.syncState === "error" ? "Error" : "Synced";
  const completion = item.manualCompletionStatus || item.completionStatus || "unknown";
  return `<div class="assignment"><input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} ${customize ? "" : "disabled"} aria-label="Select ${escapeHtml(item.title)}" /><div><div class="assignment-title">${escapeHtml(item.title || "Untitled assignment")}</div><div class="assignment-meta"><span class="status-pill">${status}</span><span class="status-pill">${escapeHtml(completion)}</span>${item.manualCompletionStatus ? '<span class="status-pill">Manual status</span>' : ""}<span class="${item.dueAtLocal ? "" : "status-pill warning"}">${escapeHtml(dueLabel(item))}</span>${item.score != null ? `<span>${item.score}%</span>` : ""}</div></div><div class="assignment-actions"><select class="completion-status" data-completion-id="${escapeHtml(item.id)}" ${customize ? "" : "disabled"} aria-label="Completion status for ${escapeHtml(item.title)}"><option value="" ${!item.manualCompletionStatus ? "selected" : ""}>Use PrairieLearn</option><option value="completed" ${completion === "completed" && item.manualCompletionStatus ? "selected" : ""}>Completed</option><option value="incomplete" ${completion === "incomplete" && item.manualCompletionStatus ? "selected" : ""}>Incomplete</option><option value="unknown" ${completion === "unknown" && item.manualCompletionStatus ? "selected" : ""}>Unknown</option></select><button class="edit-due" data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit" : "Add due date"}</button><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">View</a></div></div>`;
}

function render() {
  const newCount = assignments.filter((item) => item.syncState === "new").length;
  const changedCount = assignments.filter((item) => item.syncState === "changed").length;
  const syncedCount = assignments.filter((item) => item.syncState === "synced").length;
  const errorCount = assignments.filter((item) => item.syncState === "error").length;
  const missingDateCount = assignments.filter((item) => !item.dueAtLocal).length;
  summaryElement.innerHTML = [`<span class="chip">${newCount} new</span>`, `<span class="chip">${changedCount} changed</span>`, `<span class="chip">${syncedCount} synced</span>`, errorCount ? `<span class="chip warning-chip">${errorCount} error${errorCount === 1 ? "" : "s"}</span>` : "", missingDateCount ? `<span class="chip">${missingDateCount} need a date</span>` : ""].join("");
  noticeElement.classList.toggle("hidden", missingDateCount === 0);
  noticeElement.textContent = missingDateCount ? `${missingDateCount} assignment${missingDateCount === 1 ? "" : "s"} without a due date stay in staging but are excluded from the bulk action. Use Customize selection to add a due date.` : "";
  emptyElement.classList.toggle("hidden", assignments.length > 0);

  const groups = new Map();
  assignments.forEach((item) => { const key = item.courseInstanceId || item.courseName || "Unknown class"; if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] }); groups.get(key).items.push(item); });
  listElement.innerHTML = [...groups.values()].map((group) => {
    const courseKey = group.items[0].courseInstanceId || group.items[0].courseName || "Unknown class";
    const visible = group.items.filter((item) => !isCollapsedAssignment(item));
    const collapsed = group.items.filter(isCollapsedAssignment);
    const collapsedBlock = collapsed.length ? `<details class="collapsed-assignments"><summary>Show ${collapsed.length} previous or unknown assignment${collapsed.length === 1 ? "" : "s"}</summary>${collapsed.map(renderAssignment).join("")}</details>` : "";
    return `<section class="course"><div class="course-header"><span class="course-name">${escapeHtml(group.name)}</span><span class="course-meta">${group.items.length} assignment${group.items.length === 1 ? "" : "s"} <button class="course-select" data-course-action="select" data-course-key="${escapeHtml(courseKey)}">Select</button><button class="course-select" data-course-action="deselect" data-course-key="${escapeHtml(courseKey)}">Deselect</button></span></div>${visible.map(renderAssignment).join("")}${collapsedBlock}</section>`;
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
  listElement.querySelectorAll("button[data-course-action]").forEach((button) => button.addEventListener("click", async () => {
    courseAssignments(button.dataset.courseKey).forEach((item) => { item.selected = button.dataset.courseAction === "select" && Boolean(item.dueAtLocal); });
    await persist();
  }));
  updateExportButtons();
}

async function persist() { await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments }); render(); }
async function editDueDate(id) {
  const item = assignments.find((entry) => entry.id === id); if (!item) return;
  const current = item.manuallyEnteredDueAt || item.dueAtLocal || "";
  const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", current.replace("T", " ").slice(0, 16));
  if (value === null) return;
  if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; item.selected = false; }
  else { const normalized = value.trim().replace("T", " "); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; } item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; item.syncState = item.syncState === "new" ? "new" : "changed"; item.selected = true; }
  await persist();
}
function showPreview() {
  const selected = selectedAssignments();
  document.querySelector("#preview-title").textContent = `Ready to add ${selected.length} event${selected.length === 1 ? "" : "s"}`;
  document.querySelector("#preview-copy").textContent = "Each timed event runs from one hour before its due time through the due time. Assignments without due dates are excluded.";
  document.querySelector("#preview-items").innerHTML = selected.slice(0, 20).map((item) => `<li>${escapeHtml(item.courseName)} — ${escapeHtml(item.title)} — ${escapeHtml(dueLabel(item))}</li>`).join("");
  document.querySelector("#preview").showModal();
}

async function exportSelected(closeOnSuccess = false) {
  const selected = selectedAssignments().filter((item) => item.dueAtLocal);
  const button = document.querySelector("#confirm-export");
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
    document.querySelector("#preview").close();
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
    button.textContent = "Add to Google Calendar";
  }
}

document.querySelector("#add-new").addEventListener("click", showPreview);
function updateExportButtons() {
  const enabled = assignments.some((item) => item.selected && hasHardChange(item));
  document.querySelector("#quick-add").disabled = !enabled;
  document.querySelector("#add-new").disabled = !enabled;
}

document.querySelector("#quick-add").addEventListener("click", () => {
  if (!selectedAssignments().some(hasHardChange)) return;
  exportSelected(true);
});
document.querySelector("#deselect").addEventListener("click", async () => { assignments.forEach((item) => { item.selected = false; }); await persist(); });
document.querySelector("#customize").addEventListener("click", () => { customize = !customize; document.querySelector("#customize").textContent = customize ? "Back to bulk view" : "Customize selection"; render(); });
document.querySelector("#confirm-export").addEventListener("click", (event) => { event.preventDefault(); if (selectedAssignments().some(hasHardChange)) exportSelected(); });
chrome.storage.local.get(ASSIGNMENTS_KEY).then((stored) => { assignments = stored[ASSIGNMENTS_KEY] || []; render(); });
