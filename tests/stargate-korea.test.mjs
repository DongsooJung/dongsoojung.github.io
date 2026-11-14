import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CUSTOMERS, PRODUCTS, SITE } from "../stargate-korea/lib/customers.mjs";
import { buildSnapshot, contentKey, parseRss, requireCustomerMatch, nextDrafts } from "../stargate-korea/lib/feed.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "tests/fixtures/stargatekorea-feed.xml");

const xml = await readFile(fixture, "utf8");
const snapshot = buildSnapshot({ xml, fetchedAt: "2026-11-14T04:00:00.000Z", sourceUrl: SITE.feed });

test("공개 RSS에서 7편의 영문 글을 읽는다", () => {
  const channel = parseRss(xml);
  assert.equal(channel.title, "Stargate Korea");
  assert.equal(channel.items.length, 7);
  assert.equal(channel.items[0].title, "Where to Stay for Your First Seoul Trip: Choose the Area First");
});

test("발행된 글은 저자 취향이 아니라 실제 고객 Job에 붙는다", () => {
  const byTitle = Object.fromEntries(snapshot.posts.map((post) => [post.title, post.customerIds]));
  assert.ok(byTitle["Where to Stay for Your First Seoul Trip: Choose the Area First"].includes("first-seoul-trip"));
  assert.ok(byTitle["Before You Book Seoul Activities: Six Details to Check"].includes("activity-booker"));
  assert.ok(byTitle["How to Get Your Residence Card (ARC) in Korea: Step-by-Step Guide for Students"].includes("international-student"));
  assert.ok(byTitle["Seoul Neighborhoods Where International Students Actually Live"].includes("living-newcomer"));
});

test("커버되지 않은 가족·음식·디자인 고객만 다음 초안이 된다", () => {
  const draftIds = nextDrafts({ posts: snapshot.posts }).map((draft) => draft.customerId);
  assert.deepEqual(draftIds, ["family-slow-trip", "food-first-visitor", "design-culture-visitor"]);
  assert.equal(snapshot.coverage.coveredCustomers, 4);
  assert.equal(snapshot.coverage.totalCustomers, CUSTOMERS.length);
});

test("고객과 맞지 않는 저자 중심 주제는 탈락한다", () => {
  const rejected = requireCustomerMatch({
    title: "How I rebalanced my 401k with a used GPU cluster",
    summary: "Personal finance and homelab notes.",
    category: "Author notes",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "no-customer-match");
  const accepted = requireCustomerMatch({
    title: "A calmer first Seoul day with children",
    summary: "Fewer transfers and earlier dinners for a family.",
    category: "Travel Korea",
    intents: ["family", "children"],
  });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.customers.includes("family-slow-trip"));
});

test("상품 CTA는 라이브 영문 사이트 경로만 가리킨다", () => {
  assert.deepEqual(PRODUCTS.map((product) => product.href), [
    "https://www.stargatekorea.net/#plan",
    "https://www.stargatekorea.net/books/",
    "https://www.stargatekorea.net/custom-guide/",
  ]);
});

function hrefs(html) {
  return [...String(html).matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
}

function isSkHref(href, pathname, hash = "") {
  try {
    const url = new URL(href, SITE.origin);
    return url.protocol === "https:"
      && url.hostname === "www.stargatekorea.net"
      && url.pathname === pathname
      && url.hash === hash;
  } catch {
    return false;
  }
}

test("허브 페이지는 영문 사이트와 고객 파이프라인을 노출한다", async () => {
  const html = await readFile(path.join(root, "stargate-korea/index.html"), "utf8");
  const links = hrefs(html);
  assert.ok(links.some((href) => isSkHref(href, "/", "#plan")));
  assert.ok(links.some((href) => isSkHref(href, "/books/")));
  assert.ok(links.some((href) => isSkHref(href, "/custom-guide/")));
  assert.ok(links.some((href) => isSkHref(href, "/feed")));
  assert.ok(html.includes("401k"));
});

test("포털 홈·여행·영문 홈이 라이브 사이트와 연동 허브를 가리킨다", async () => {
  const [home, en, travel, korea] = await Promise.all([
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "en/index.html"), "utf8"),
    readFile(path.join(root, "travel/index.html"), "utf8"),
    readFile(path.join(root, "global/korea/index.html"), "utf8"),
  ]);
  assert.ok(hrefs(home).includes("/stargate-korea/"));
  assert.ok(hrefs(en).some((href) => isSkHref(href, "/")));
  assert.ok(travel.includes('id="stargate-korea"'));
  assert.ok(hrefs(travel).includes("/stargate-korea/"));
  assert.ok(hrefs(korea).some((href) => isSkHref(href, "/")));
});

test("피드 내용이 같으면 스냅샷 fingerprint도 같다", () => {
  const later = buildSnapshot({ xml, fetchedAt: "2026-11-14T06:00:00.000Z", sourceUrl: SITE.feed });
  assert.equal(contentKey(snapshot), contentKey(later));
  assert.notEqual(snapshot.fetchedAt, later.fetchedAt);
});

test("피드 스냅샷 스크립트는 로컬 RSS 파일로 재현 가능하다", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sk-feed-"));
  const output = path.join(dir, "feed.json");
  try {
    const feedUrl = pathToFileURL(fixture).href;
    const { stdout } = await execFileAsync(process.execPath, [path.join(root, "scripts/update-stargate-korea-feed.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        STARGATE_KOREA_FEED_URL: feedUrl,
        STARGATE_KOREA_OUTPUT: output,
      },
    });
    const written = JSON.parse(await readFile(output, "utf8"));
    assert.ok(stdout.includes("7 posts"));
    assert.equal(written.postCount, 7);
    assert.equal(written.drafts.length, 3);
    assert.equal(written.site.origin, "https://www.stargatekorea.net");
    const firstFetchedAt = written.fetchedAt;
    await execFileAsync(process.execPath, [path.join(root, "scripts/update-stargate-korea-feed.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        STARGATE_KOREA_FEED_URL: feedUrl,
        STARGATE_KOREA_OUTPUT: output,
      },
    });
    const second = JSON.parse(await readFile(output, "utf8"));
    assert.equal(second.fetchedAt, firstFetchedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
