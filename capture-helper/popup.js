const CAPTURE_KEY = "prairierunStage0Captures";
const MAX_CAPTURES = 20;
const MAX_HTML_BYTES = 2_000_000;

const captureButton = document.querySelector("#capture");
const downloadButton = document.querySelector("#download");
const clearButton = document.querySelector("#clear");
const statusElement = document.querySelector("#status");
const countElement = document.querySelector("#count");
const listElement = document.querySelector("#capture-list");

let captures = [];

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function classifyPage(url, title) {
  const path = new URL(url).pathname.toLowerCase();
  const text = `${path} ${title}`.toLowerCase();
  if (/assessment_instance|\/assessment\//.test(path)) return "assignment";
  if (/home|index|dashboard/.test(text)) return "home";
  if (/course|class|section/.test(text)) return "course";
  if (/exam|assessment|quiz|assignment|instance|question/.test(text)) return "assignment";
  return "unknown";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  countElement.textContent = String(captures.length);
  downloadButton.disabled = captures.length === 0;
  clearButton.disabled = captures.length === 0;
  listElement.innerHTML = captures.length
    ? captures.map((capture) => `
      <li>
        <span class="kind">${escapeHtml(capture.pageType)} · ${escapeHtml(capture.title || "Untitled")}</span>
        <span class="url" title="${escapeHtml(capture.url)}">${escapeHtml(capture.url)}</span>
      </li>`).join("")
    : '<li class="empty">No pages captured yet.</li>';
}

async function readCaptures() {
  const stored = await chrome.storage.local.get(CAPTURE_KEY);
  captures = Array.isArray(stored[CAPTURE_KEY]) ? stored[CAPTURE_KEY] : [];
  render();
}

async function captureCurrentPage() {
  captureButton.disabled = true;
  setStatus("Reading the current page…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
      throw new Error("Open a PrairieLearn page in the active tab first.");
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageSnapshot,
    });

    const snapshot = result?.result;
    if (!snapshot?.html) throw new Error("The page did not return a readable DOM snapshot.");
    if (byteLength(snapshot.html) > MAX_HTML_BYTES) {
      throw new Error("This page is larger than 2 MB. Capture a more focused page or save a sanitized fixture manually.");
    }

    captures = [...captures, snapshot].slice(-MAX_CAPTURES);
    await chrome.storage.local.set({ [CAPTURE_KEY]: captures });
    render();
    setStatus(`Captured ${snapshot.pageType} page. ${captures.length} page${captures.length === 1 ? "" : "s"} stored locally.`);
  } catch (error) {
    setStatus(error?.message || "Capture failed.", true);
  } finally {
    captureButton.disabled = false;
  }
}

async function clearCaptures() {
  if (!confirm("Clear all locally stored page captures?")) return;
  captures = [];
  await chrome.storage.local.remove(CAPTURE_KEY);
  render();
  setStatus("Local captures cleared.");
}

async function downloadBundle() {
  const bundle = {
    format: "prairierun-stage-0-capture-v1",
    exportedAt: new Date().toISOString(),
    captureCount: captures.length,
    note: "Captured locally from the user's active browser session. Review and sanitize before sharing.",
    captures,
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `prairierun-stage-0-captures-${new Date().toISOString().slice(0, 10)}.json`,
      saveAs: true,
    });
    setStatus("Fixture bundle download started.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function collectPageSnapshot() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, iframe, object, embed, canvas").forEach((node) => node.remove());
  clone.querySelectorAll("input, textarea").forEach((node) => {
    node.removeAttribute("value");
    node.textContent = "";
  });

  const absoluteUrl = (href) => {
    try { return new URL(href, location.href).href; } catch { return null; }
  };
  const links = [...document.querySelectorAll("a[href]")]
    .map((link) => ({
      text: (link.innerText || link.textContent || "").trim().replace(/\s+/g, " "),
      href: absoluteUrl(link.getAttribute("href")),
      sameOrigin: absoluteUrl(link.getAttribute("href"))?.startsWith(location.origin) ?? false,
      ariaLabel: link.getAttribute("aria-label") || undefined,
    }))
    .filter((link) => link.href)
    .slice(0, 500);

  const candidateSelector = [
    "article", "tr", "li", "[data-testid]", "[data-test]", ".card", ".assignment", ".question",
  ].join(",");
  const candidateBlocks = [...document.querySelectorAll(candidateSelector)]
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: typeof element.className === "string" ? element.className : undefined,
      data: Object.fromEntries([...element.attributes]
        .filter((attribute) => attribute.name.startsWith("data-"))
        .map((attribute) => [attribute.name, attribute.value])),
      text: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 1000),
    }))
    .filter((block) => block.text)
    .slice(0, 500);

  const path = location.pathname.toLowerCase();
  const pageText = `${path} ${document.title}`.toLowerCase();
  let pageType = "unknown";
  if (/assessment_instance|\/assessment\//.test(path)) pageType = "assignment";
  else if (/home|index|dashboard/.test(pageText)) pageType = "home";
  else if (/course|class|section/.test(pageText)) pageType = "course";
  else if (/exam|assessment|quiz|assignment|instance|question/.test(pageText)) pageType = "assignment";

  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    pageType,
    html: `<!doctype html>\n${clone.outerHTML}`,
    links,
    candidateBlocks,
    notes: [
      "Scripts, styles, iframes, canvas elements, and form values were removed from the snapshot.",
      "Review text and links for private course data before sharing the fixture.",
    ],
  };
}

captureButton.addEventListener("click", captureCurrentPage);
downloadButton.addEventListener("click", downloadBundle);
clearButton.addEventListener("click", clearCaptures);
readCaptures().catch((error) => setStatus(error?.message || "Could not load local captures.", true));
