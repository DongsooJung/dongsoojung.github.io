import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SITE } from "../stargate-korea/lib/customers.mjs";
import { buildSnapshot, contentKey } from "../stargate-korea/lib/feed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = resolve(ROOT, "stargate-korea/data/feed.json");
const DEFAULT_FEED = SITE.feed;
const ALLOWED_HTTPS_PATHS = new Set(["/feed", "/feed/", "/feed.xml"]);

function resolveFeedUrl(raw) {
  const url = new URL(raw);
  if (url.protocol === "file:") {
    const filePath = resolve(fileURLToPath(url));
    const rootPrefix = `${ROOT}/`;
    if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
      throw new Error("Local Stargate Korea feed must live inside this repository.");
    }
    return url;
  }
  if (url.protocol !== "https:" || url.hostname !== "www.stargatekorea.net" || !ALLOWED_HTTPS_PATHS.has(url.pathname)) {
    throw new Error("Stargate Korea feed must be the public www.stargatekorea.net/feed URL.");
  }
  return url;
}

function resolveOutput(raw) {
  const resolved = resolve(raw);
  const dataDir = resolve(ROOT, "stargate-korea/data");
  const tempDir = resolve(tmpdir());
  const allowed = [dataDir, tempDir];
  if (!allowed.some((dir) => resolved === dir || resolved.startsWith(`${dir}/`))) {
    throw new Error("Snapshot output must be under stargate-korea/data or the temp directory.");
  }
  if (!resolved.endsWith(".json")) {
    throw new Error("Snapshot output must be a .json file.");
  }
  return resolved;
}

async function loadXml(sourceUrl) {
  const url = resolveFeedUrl(sourceUrl);
  if (url.protocol === "file:") {
    return readFile(url, "utf8");
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "stargateedu-stargate-korea-bridge/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Stargate Korea feed returned HTTP ${response.status}`);
  }
  return response.text();
}

const sourceUrl = process.env.STARGATE_KOREA_FEED_URL?.trim() || DEFAULT_FEED;
const output = resolveOutput(process.env.STARGATE_KOREA_OUTPUT?.trim() || DEFAULT_OUTPUT);
const xml = await loadXml(sourceUrl);
const fetchedAt = new Date().toISOString();
const snapshot = buildSnapshot({ xml, sourceUrl: SITE.feed, fetchedAt });
if (!snapshot.posts.length) {
  throw new Error("Stargate Korea feed returned no posts.");
}

let previous = null;
try {
  previous = JSON.parse(await readFile(output, "utf8"));
} catch {
  previous = null;
}
if (previous && contentKey(previous) === contentKey(snapshot) && previous.fetchedAt) {
  snapshot.fetchedAt = previous.fetchedAt;
}

await mkdir(dirname(output), { recursive: true });
const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
// codeql[js/http-to-file-access]: Allowlisted public RSS is rewritten as bounded JSON for the portal snapshot.
await writeFile(output, payload, "utf8");
console.log(
  `Stargate Korea: ${snapshot.postCount} posts, ${snapshot.coverage.coveredCustomers}/${snapshot.coverage.totalCustomers} customers covered, ${snapshot.drafts.length} draft gaps.`,
);
