#!/usr/bin/env node
// Builds a per-browser manifest from the shared source of truth.
//
//   node build-manifest.js --target=chrome [--check]
//   node build-manifest.js --target=firefox [--out=dist-firefox] [--gecko-id=...]
//
// One codebase, two generated manifests: the Chrome manifest keeps the
// single-file `service_worker` background, and the Firefox manifest adds the
// stable `browser_specific_settings.gecko` identity Firefox needs for OAuth
// (`identity.getRedirectURL()` changes on every temporary install without a
// pinned ID). Both targets keep `service_worker` because the minimum
// supported Firefox is 121, which implements MV3 service workers; the
// `importScripts` guard at the top of background.js keeps the code working if
// a `scripts`-array background is ever needed for an older version.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const BASE_PATH = path.join(ROOT, "extension", "manifest.base.json");
const CHROME_MANIFEST_PATH = path.join(ROOT, "extension", "manifest.json");
const DEFAULT_GECKO_ID = "prairierun@example.com";
const FIREFOX_MIN_VERSION = "121.0";

function parseArgs(argv) {
  const args = { target: null, out: "dist-firefox", geckoId: DEFAULT_GECKO_ID, check: false };
  for (const arg of argv) {
    if (arg.startsWith("--target=")) args.target = arg.slice("--target=".length);
    else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
    else if (arg.startsWith("--gecko-id=")) args.geckoId = arg.slice("--gecko-id=".length);
    else if (arg === "--check") args.check = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!["chrome", "firefox"].includes(args.target)) {
    throw new Error("Pass --target=chrome or --target=firefox.");
  }
  return args;
}

function readBase() {
  return JSON.parse(fs.readFileSync(BASE_PATH, "utf8"));
}

// Windows checkouts with core.autocrlf store CRLF on disk; normalize so
// --check passes regardless of the developer's line-ending setting.
function readNormalized(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function serialize(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function buildChromeManifest() {
  return readBase();
}

function buildFirefoxManifest(geckoId) {
  const manifest = readBase();
  manifest.browser_specific_settings = {
    gecko: { id: geckoId, strict_min_version: FIREFOX_MIN_VERSION },
  };
  return manifest;
}

// Files shipped in the Firefox distribution directory. Everything the
// extension needs at runtime, minus the manifest source file itself.
const DIST_COPY_EXTENSIONS = new Set([".js", ".css", ".html"]);

function buildFirefoxDist(outDir, geckoId) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(path.join(ROOT, "extension"))) {
    if (entry === "manifest.base.json" || entry === "manifest.json") continue;
    if (!DIST_COPY_EXTENSIONS.has(path.extname(entry))) continue;
    fs.copyFileSync(path.join(ROOT, "extension", entry), path.join(outDir, entry));
  }
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, serialize(buildFirefoxManifest(geckoId)));
  return manifestPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.target === "chrome") {
    const text = serialize(buildChromeManifest());
    if (args.check) {
      const current = readNormalized(CHROME_MANIFEST_PATH);
      if (current !== text) {
        console.error("extension/manifest.json is stale. Run: node build-manifest.js --target=chrome");
        process.exitCode = 1;
        return;
      }
      console.log("chrome manifest ok");
      return;
    }
    fs.writeFileSync(CHROME_MANIFEST_PATH, text);
    console.log(`wrote ${path.relative(ROOT, CHROME_MANIFEST_PATH)}`);
    return;
  }
  const outDir = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  if (args.check) {
    const manifestPath = path.join(outDir, "manifest.json");
    const expected = serialize(buildFirefoxManifest(args.geckoId));
    if (!fs.existsSync(manifestPath) || readNormalized(manifestPath) !== expected) {
      console.error(`${path.relative(ROOT, manifestPath)} is stale. Run: node build-manifest.js --target=firefox`);
      process.exitCode = 1;
      return;
    }
    console.log("firefox manifest ok");
    return;
  }
  const manifestPath = buildFirefoxDist(outDir, args.geckoId);
  console.log(`wrote ${path.relative(ROOT, outDir)} (gecko id ${args.geckoId})`);
  void manifestPath;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
