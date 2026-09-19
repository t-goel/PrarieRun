// Stage 0 parser prototype for the captured us.prairielearn.com deployment.
// The DOM-facing functions run in a browser/content-script context. The pure
// helpers are exported for Node-based tests.

const COURSE_PATH = /\/pl\/course_instance\/(\d+)(?:\/|$)/;
const ASSESSMENT_PATH = /\/pl\/course_instance\/(\d+)\/(assessment|assessment_instance)\/(\d+)\/?/;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function pathParts(url) {
  const match = new URL(url).pathname.match(ASSESSMENT_PATH);
  if (!match) return null;
  return { courseInstanceId: match[1], kind: match[2], id: match[3] };
}

function courseInstanceId(url) {
  return new URL(url).pathname.match(COURSE_PATH)?.[1] || null;
}

function pageType(url, title = "") {
  const parsed = new URL(url);
  if (ASSESSMENT_PATH.test(parsed.pathname)) return "assignment";
  if (/\/pl\/course_instance\/\d+\/assessments(?:\/|$)/.test(parsed.pathname)) return "course";
  if (/home|index|dashboard/i.test(`${parsed.pathname} ${title}`)) return "home";
  return "unknown";
}

function parsePercentage(value) {
  const match = normalizeText(value).match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function completionFromScore(score, threshold = 95) {
  if (score == null || Number.isNaN(score)) return "unknown";
  return score >= threshold ? "completed" : "incomplete";
}

function decodeAttributeHtml(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function parseDueInfo(visibleText, accessDetailsHtml) {
  const rawVisible = normalizeText(visibleText);
  const rawDetails = decodeAttributeHtml(accessDetailsHtml);
  const cells = [...rawDetails.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => normalizeText(match[1].replace(/<[^>]+>/g, "")));
  const endCells = [];
  for (let index = 0; index + 2 < cells.length; index += 3) {
    const end = cells[index + 2];
    const match = end.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*\(([^)]+)\)/);
    if (match) endCells.push({ local: match[1], timezone: match[2] });
  }

  const finiteEnd = endCells.length ? endCells[endCells.length - 1] : null;
  const untilMatch = rawVisible.match(/until\s+(.+)$/i);
  const visibleDeadline = rawVisible.match(/until\s+(\d{1,2}):(\d{2}),\s*(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/i);
  const monthNumber = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[visibleDeadline?.[3]?.slice(0, 3).toLowerCase()];
  const year = finiteEnd ? finiteEnd.local.slice(0, 4) : String(new Date().getFullYear());
  const visibleDueAtLocal = visibleDeadline && monthNumber ? `${year}-${String(monthNumber).padStart(2, "0")}-${String(visibleDeadline[4]).padStart(2, "0")} ${String(visibleDeadline[1]).padStart(2, "0")}:${visibleDeadline[2]}:00` : null;

  return {
    dueAtLocal: visibleDueAtLocal || finiteEnd?.local || null,
    timezone: finiteEnd?.timezone || null,
    dueText: untilMatch ? untilMatch[1].replace(/[.\s]+$/, "") : null,
    rawVisible,
    rawDetails: rawDetails || null,
  };
}

function stableAssignmentKey({ courseInstanceId: courseId, assessmentId, fallbackId }) {
  return assessmentId
    ? `pl:${courseId}:assessment:${assessmentId}`
    : `pl:${courseId}:instance:${fallbackId}`;
}

function baseLabel(label) {
  return normalizeText(label).replace(/#\d+$/, "");
}

function normalizeInstanceTitle(title) {
  return normalizeText(title).replace(/\s+instance\s+#\d+$/i, "");
}

function getCourseIdentity(document, location) {
  const id = courseInstanceId(location.href);
  const navCourse = normalizeText(document.querySelector(".navbar-text")?.textContent);
  const titleMatch = document.title.match(/(?:Assessments|[^|]+)\s*[—|-]\s*(.+?)\s*\|\s*PrairieLearn/i);
  return {
    courseInstanceId: id,
    courseName: titleMatch?.[1]?.trim() || navCourse.replace(/,\s*[A-Z]{2}\d+$/, "") || null,
    term: navCourse.match(/,\s*([A-Z]{2}\d+)$/)?.[1] || null,
  };
}

function getCourseLinks(document, location = window.location) {
  const seen = new Set();
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => {
      const href = absoluteUrl(anchor.getAttribute("href"), location.href);
      const id = href ? courseInstanceId(href) : null;
      return {
        courseInstanceId: id,
        href,
        text: normalizeText(anchor.textContent),
      };
    })
    .filter((link) => link.courseInstanceId && link.href && !seen.has(link.courseInstanceId) && seen.add(link.courseInstanceId));
}

function parseAssessmentRow(row, location, course, threshold = 95) {
  const anchors = [...row.querySelectorAll("a[href]")];
  const candidates = anchors
    .map((anchor) => {
      const href = absoluteUrl(anchor.getAttribute("href"), location.href);
      const parts = href ? pathParts(href) : null;
      return { anchor, href, parts, text: normalizeText(anchor.textContent) };
    })
    .filter((candidate) => candidate.parts);
  const contentCandidate = candidates.find((candidate) => candidate.text.toLowerCase() !== "new instance");
  const newInstanceCandidate = candidates.find((candidate) => candidate.text.toLowerCase() === "new instance");
  if (!contentCandidate && !newInstanceCandidate) return null;

  const cells = [...row.querySelectorAll(":scope > td")];
  const label = normalizeText(row.querySelector('[data-testid="assessment-set-badge"]')?.textContent);
  const titleCell = cells[1];
  const title = normalizeInstanceTitle(contentCandidate?.text || titleCell?.textContent || "");
  const score = parsePercentage(row.querySelector('[data-testid="scorebar"]')?.textContent);
  const accessButton = row.querySelector('[aria-label="Access details"]');
  const due = parseDueInfo(cells[2]?.textContent || row.textContent, accessButton?.getAttribute("data-bs-content"));
  const source = contentCandidate || newInstanceCandidate;
  const instance = contentCandidate?.parts.kind === "assessment_instance";
  const assessmentId = instance ? null : (contentCandidate?.parts.id || newInstanceCandidate?.parts.id || null);

  return {
    courseInstanceId: course.courseInstanceId,
    courseName: course.courseName,
    label,
    baseLabel: baseLabel(label),
    title,
    sourceUrl: source.href,
    assessmentId,
    instanceId: instance ? contentCandidate.parts.id : null,
    score,
    completionStatus: completionFromScore(score, threshold),
    dueAtLocal: due.dueAtLocal,
    dueText: due.dueText,
    timezone: due.timezone,
    rawDueText: due.rawVisible,
    kind: instance ? "assessment_instance" : "assessment",
  };
}

function extractAssignments(document, location = window.location, threshold = 95) {
  const course = getCourseIdentity(document, location);
  const raw = [...document.querySelectorAll("tr")]
    .map((row) => parseAssessmentRow(row, location, course, threshold))
    .filter(Boolean);

  const baseRows = new Map(raw.filter((item) => item.assessmentId).map((item) => [item.baseLabel, item]));
  const instanceLabels = new Set(raw.filter((item) => item.instanceId).map((item) => item.baseLabel));

  return raw
    .filter((item) => !(item.assessmentId && instanceLabels.has(item.baseLabel)))
    .map((item) => {
      const base = baseRows.get(item.baseLabel);
      const assessmentId = item.assessmentId || base?.assessmentId || null;
      return {
        id: stableAssignmentKey({
          courseInstanceId: course.courseInstanceId,
          assessmentId,
          fallbackId: item.instanceId,
        }),
        courseInstanceId: course.courseInstanceId,
        courseName: course.courseName,
        title: base?.title || item.title,
        label: item.baseLabel || base?.baseLabel,
        sourceUrl: item.sourceUrl,
        assessmentId,
        instanceId: item.instanceId,
        score: item.score,
        completionStatus: item.completionStatus,
        dueAtLocal: item.dueAtLocal || base?.dueAtLocal || null,
        dueText: item.dueText || base?.dueText || null,
        timezone: item.timezone || base?.timezone || null,
        rawDueText: item.rawDueText || base?.rawDueText || null,
      };
    });
}

function extractAssignmentDetail(document, location = window.location, threshold = 95) {
  const parts = pathParts(location.href);
  if (!parts || parts.kind !== "assessment_instance") return null;
  const course = getCourseIdentity(document, location);
  const score = parsePercentage(document.querySelector('[data-testid="scorebar"]')?.textContent);
  const card = document.querySelector("main .card") || document;
  const accessButton = card.querySelector('[aria-label="Access details"]');
  const due = parseDueInfo(card.textContent, accessButton?.getAttribute("data-bs-content"));
  const title = normalizeInstanceTitle(document.querySelector("main h1")?.textContent);
  return {
    id: stableAssignmentKey({ courseInstanceId: parts.courseInstanceId, fallbackId: parts.id }),
    courseInstanceId: parts.courseInstanceId,
    courseName: course.courseName,
    title,
    sourceUrl: location.href,
    instanceId: parts.id,
    score,
    completionStatus: completionFromScore(score, threshold),
    dueAtLocal: due.dueAtLocal,
    dueText: due.dueText,
    timezone: due.timezone,
    rawDueText: due.rawVisible,
  };
}

const api = {
  absoluteUrl,
  baseLabel,
  completionFromScore,
  courseInstanceId,
  extractAssignmentDetail,
  extractAssignments,
  getCourseIdentity,
  getCourseLinks,
  normalizeInstanceTitle,
  normalizeText,
  pageType,
  parseDueInfo,
  parsePercentage,
  pathParts,
  stableAssignmentKey,
};

if (typeof module !== "undefined") module.exports = api;
if (typeof window !== "undefined") window.PrairieLearnAdapter = api;
