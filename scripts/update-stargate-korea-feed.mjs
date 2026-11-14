import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "../stargate-korea/lib/customers.mjs";
import { buildSnapshot } from "../stargate-korea/lib/feed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, process.env.STARGATE_KOREA_OUTPUT?.trim() || "stargate-korea/data/feed.json");
const DEFAULT_FEED = SITE.feed;

async function loadXml(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" && url.protocol !== "file:") {
    throw new Error("Stargate Korea feed must be HTTPS or a local file URL.");
  }
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
const xml = await loadXml(sourceUrl);
const snapshot = buildSnapshot({ xml, sourceUrl });
if (!snapshot.posts.length) {
  throw new Error("Stargate Korea feed returned no posts.");
}
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
  `Stargate Korea: ${snapshot.postCount} posts, ${snapshot.coverage.coveredCustomers}/${snapshot.coverage.totalCustomers} customers covered, ${snapshot.drafts.length} draft gaps.`,
);
