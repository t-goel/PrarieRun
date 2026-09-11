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

function renderAssignment(item) {
  const status = item.syncState === "changed" ? "Changed" : item.syncState === "new" ? "New" : item.syncState === "stale" ? "Stale" : "Synced";
  return `<div class="assignment"><input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.selected ? "checked" : ""} ${customize ? "" : "disabled"} aria-label="Select ${escapeHtml(item.title)}" /><div><div class="assignment-title">${escapeHtml(item.title || "Untitled assignment")}</div><div class="assignment-meta"><span class="status-pill">${status}</span><span class="${item.dueAtLocal ? "" : "status-pill warning"}">${escapeHtml(dueLabel(item))}</span>${item.score != null ? `<span>${item.score}%</span>` : ""}</div></div><div class="assignment-actions"><button class="edit-due" data-edit-id="${escapeHtml(item.id)}">${item.dueAtLocal ? "Edit" : "Add due date"}</button><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">View</a></div></div>`;
}

function render() {
  const newCount = assignments.filter((item) => item.syncState === "new").length;
  const changedCount = assignments.filter((item) => item.syncState === "changed").length;
  const syncedCount = assignments.filter((item) => item.syncState === "synced").length;
  const missingDateCount = assignments.filter((item) => !item.dueAtLocal).length;
  summaryElement.innerHTML = [`<span class="chip">${newCount} new</span>`, `<span class="chip">${changedCount} changed</span>`, `<span class="chip">${syncedCount} synced</span>`, missingDateCount ? `<span class="chip">${missingDateCount} need a date</span>` : ""].join("");
  noticeElement.classList.toggle("hidden", missingDateCount === 0);
  noticeElement.textContent = missingDateCount ? `${missingDateCount} assignment${missingDateCount === 1 ? "" : "s"} without a due date stay in staging but are excluded from the bulk action. Use Customize selection to add a due date.` : "";
  emptyElement.classList.toggle("hidden", assignments.length > 0);

  const groups = new Map();
  assignments.forEach((item) => { const key = item.courseInstanceId || item.courseName || "Unknown class"; if (!groups.has(key)) groups.set(key, { name: item.courseName || key, items: [] }); groups.get(key).items.push(item); });
  listElement.innerHTML = [...groups.values()].map((group) => {
    return `<section class="course"><div class="course-header"><span class="course-name">${escapeHtml(group.name)}</span><span class="course-meta">${group.items.length} assignment${group.items.length === 1 ? "" : "s"}</span></div>${group.items.map(renderAssignment).join("")}</section>`;
  }).join("");
  listElement.querySelectorAll("input[data-id]").forEach((input) => input.addEventListener("change", async () => { const item = assignments.find((entry) => entry.id === input.dataset.id); if (item) item.selected = input.checked; await persist(); }));
  listElement.querySelectorAll("button[data-edit-id]").forEach((button) => button.addEventListener("click", () => editDueDate(button.dataset.editId)));
}

async function persist() { await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: assignments }); render(); }
async function editDueDate(id) {
  const item = assignments.find((entry) => entry.id === id); if (!item) return;
  const current = item.manuallyEnteredDueAt || item.dueAtLocal || "";
  const value = prompt("Enter due date/time as YYYY-MM-DD HH:MM. Leave blank to remove the manual date.", current.replace("T", " ").slice(0, 16));
  if (value === null) return;
  if (!value.trim()) { item.manuallyEnteredDueAt = null; item.dueAtLocal = null; item.selected = false; }
  else { const normalized = value.trim().replace("T", " "); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) { alert("Use YYYY-MM-DD HH:MM."); return; } item.manuallyEnteredDueAt = normalized; item.dueAtLocal = normalized; if (["new", "changed"].includes(item.syncState)) item.selected = true; }
  await persist();
}
function showPreview() {
  const selected = selectedAssignments();
  document.querySelector("#preview-title").textContent = `Ready to add ${selected.length} event${selected.length === 1 ? "" : "s"}`;
  document.querySelector("#preview-copy").textContent = "Each timed event runs from one hour before its due time through the due time. Assignments without due dates are excluded.";
  document.querySelector("#preview-items").innerHTML = selected.slice(0, 20).map((item) => `<li>${escapeHtml(item.courseName)} — ${escapeHtml(item.title)} — ${escapeHtml(dueLabel(item))}</li>`).join("");
  document.querySelector("#preview").showModal();
}

document.querySelector("#add-new").addEventListener("click", showPreview);
document.querySelector("#deselect").addEventListener("click", async () => { assignments.forEach((item) => { item.selected = false; }); await persist(); });
document.querySelector("#customize").addEventListener("click", () => { customize = !customize; document.querySelector("#customize").textContent = customize ? "Back to bulk view" : "Customize selection"; render(); });
document.querySelector("#confirm-export").addEventListener("click", (event) => { event.preventDefault(); alert("Google Calendar export needs a Google OAuth client ID. Local staging and preview are ready; configure OAuth before exporting."); });
chrome.storage.local.get(ASSIGNMENTS_KEY).then((stored) => { assignments = stored[ASSIGNMENTS_KEY] || []; render(); });
