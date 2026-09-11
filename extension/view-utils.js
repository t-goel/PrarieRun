(function () {
  function pad(value) { return String(value).padStart(2, "0"); }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function currentDateKeys(now = new Date()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Set([dateKey(now), dateKey(tomorrow)]);
  }

  function dueDateKey(item) {
    const match = String(item?.dueAtLocal || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || null;
  }

  function isCurrent(item, now = new Date()) {
    const due = dueDateKey(item);
    return due ? due >= dateKey(now) : false;
  }

  function isCompleted(item) {
    return (item?.manualCompletionStatus || item?.completionStatus || "unknown") === "completed";
  }

  function isPending(item) {
    return ["new", "changed", "error"].includes(item?.syncState);
  }

  function displayable(item, showUndated, now = new Date()) {
    return isCurrent(item, now) || (showUndated && !item?.dueAtLocal);
  }

  function compareAssignments(a, b) {
    const aDue = dueDateKey(a) || "9999-99-99";
    const bDue = dueDateKey(b) || "9999-99-99";
    return aDue.localeCompare(bDue) || String(a.title || "").localeCompare(String(b.title || ""));
  }

  function statusLabel(item) {
    return item?.syncState === "changed" ? "Changed"
      : item?.syncState === "new" ? "New"
        : item?.syncState === "error" ? "Error"
          : item?.syncState === "synced" ? "Synced"
            : "Not synced";
  }

  const api = { currentDateKeys, dueDateKey, isCurrent, isCompleted, isPending, displayable, compareAssignments, statusLabel };
  globalThis.PrairieRunView = api;
  if (typeof module !== "undefined") module.exports = api;
})();
