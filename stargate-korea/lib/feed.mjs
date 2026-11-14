import { CUSTOMERS, PRODUCTS, SITE, customerOffer, productById } from "./customers.mjs";

const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return ENTITY_MAP[entity.toLowerCase()] ?? "";
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = String(block).match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export function parseRss(xml) {
  const source = String(xml ?? "");
  const channel = source.match(/<channel>([\s\S]*?)<item>/i)?.[1] ?? source;
  const items = [...source.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match, index) => {
    const block = match[1];
    const link = tag(block, "link") || tag(block, "guid");
    return {
      id: link || `item-${index + 1}`,
      title: tag(block, "title"),
      link,
      guid: tag(block, "guid"),
      publishedAt: tag(block, "pubDate"),
      category: tag(block, "category"),
      excerpt: tag(block, "description"),
    };
  });
  return {
    title: tag(channel, "title") || "Stargate Korea",
    link: tag(channel, "link") || SITE.origin,
    description: tag(channel, "description"),
    language: tag(channel, "language") || "en-us",
    items,
  };
}

function haystack(post) {
  return `${post.title} ${post.excerpt} ${post.category}`.toLowerCase();
}

export function matchCustomers(post, customers = CUSTOMERS) {
  const text = haystack(post);
  return customers
    .map((customer) => {
      const hits = customer.intents.filter((intent) => text.includes(intent.toLowerCase()));
      const categoryHit = customer.category && post.category === customer.category && hits.length > 0;
      const score = hits.length * 2 + (categoryHit ? 1 : 0);
      return { customer, hits, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.customer.id.localeCompare(b.customer.id));
}

export function requireCustomerMatch(topic, customers = CUSTOMERS) {
  const post = {
    title: topic.title ?? "",
    excerpt: `${topic.summary ?? ""} ${(topic.intents ?? []).join(" ")}`,
    category: topic.category ?? "",
  };
  const matches = matchCustomers(post, customers);
  if (!matches.length) {
    return { ok: false, reason: "no-customer-match", customers: [] };
  }
  return { ok: true, reason: "customer-match", customers: matches.map((row) => row.customer.id) };
}

export function nextDrafts({ customers = CUSTOMERS, posts = [], limit = 4 } = {}) {
  const covered = new Set();
  for (const post of posts) {
    for (const row of matchCustomers(post, customers)) covered.add(row.customer.id);
  }
  return customers
    .filter((customer) => !covered.has(customer.id))
    .slice(0, limit)
    .map((customer) => ({
      customerId: customer.id,
      name: customer.name,
      nameKo: customer.nameKo,
      title: customer.draftTitle,
      job: customer.job,
      pain: customer.pain,
      outcome: customer.outcome,
      category: customer.category,
      offer: customerOffer(customer),
      reason: "uncovered-customer",
    }));
}

export function buildSnapshot({ xml, fetchedAt = new Date().toISOString(), sourceUrl = SITE.feed } = {}) {
  const channel = parseRss(xml);
  const posts = channel.items.map((item) => {
    const matches = matchCustomers(item);
    return {
      ...item,
      customerIds: matches.map((row) => row.customer.id),
      customerNames: matches.map((row) => row.customer.name),
    };
  });
  const coverage = CUSTOMERS.map((customer) => {
    const matchedPosts = posts.filter((post) => post.customerIds.includes(customer.id));
    return {
      id: customer.id,
      name: customer.name,
      nameKo: customer.nameKo,
      category: customer.category,
      job: customer.job,
      offer: customerOffer(customer),
      covered: matchedPosts.length > 0,
      postCount: matchedPosts.length,
      latestPost: matchedPosts[0]
        ? { title: matchedPosts[0].title, link: matchedPosts[0].link, publishedAt: matchedPosts[0].publishedAt }
        : null,
    };
  });
  const drafts = nextDrafts({ posts });
  return {
    schemaVersion: 1,
    fetchedAt,
    sourceUrl,
    site: SITE,
    products: PRODUCTS.map((product) => ({ ...product })),
    channel: {
      title: channel.title,
      link: channel.link,
      description: channel.description,
      language: channel.language,
    },
    postCount: posts.length,
    posts,
    customers: coverage,
    drafts,
    coverage: {
      coveredCustomers: coverage.filter((row) => row.covered).length,
      totalCustomers: coverage.length,
      uncoveredCustomers: coverage.filter((row) => !row.covered).map((row) => row.id),
    },
  };
}

export { productById };
