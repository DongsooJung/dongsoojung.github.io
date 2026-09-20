import { jsonLd, keywordSet, metaDescription, titleCase, toSlug } from './seo.mjs';
import { matchCustomer } from './customers.mjs';

export function draftId(title, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `draft-${stamp}-${toSlug(title, 48)}`;
}

export function resolveCustomer(topic, config = {}) {
  if (topic?.customer?.id) return topic.customer;
  const matched = matchCustomer(topic, config.customers || []);
  if (!matched) return null;
  return {
    id: matched.id,
    name: matched.name,
    job: matched.job,
    pain: matched.pain,
    outcome: matched.outcome,
    matchScore: matched.score,
    hits: matched.hits || [],
  };
}

export function workingTitle(topic, customer) {
  const query = titleCase(topic.title);
  if (customer?.outcome) {
    const outcome = customer.outcome.replace(/\.$/, '');
    if (outcome.length <= 72) return `${query}: ${outcome}`;
  }
  if (/^(how|what|why|when)\b/i.test(query)) return query;
  return query;
}

export function outlineFor(topic, customer) {
  const who = customer?.name || 'the searcher';
  const job = customer?.job || `get a usable answer to "${topic.title}"`;
  const pain = customer?.pain || 'generic posts that talk about the writer instead of the job';
  const outcome = customer?.outcome || 'one action they can take this week';
  return [
    `Open on ${who}'s job: ${job}. Do not open on the author's biography or research agenda.`,
    `Name the pain in their words: ${pain}.`,
    `Give the method that produces this outcome: ${outcome}.`,
    `Handle the objection they will have after the first paragraph (cost, time, risk, "is this for my country?").`,
    `Close with one next action for ${who}, not a pitch for the author's other interests.`,
  ];
}

export function monetizationSlots(config) {
  const adsense = config.monetization?.adsense !== false;
  const affiliates = config.monetization?.affiliates || [];
  const products = config.monetization?.productCtas || [];
  return {
    adsense,
    inArticleAd: adsense ? 'after-intro-and-midpoint' : 'off',
    affiliates,
    products,
    productCtas: products,
    disclosureRequired: adsense || affiliates.length > 0 || products.length > 0,
  };
}

export function buildDraft(topic, config, options = {}) {
  const createdAt = options.now || new Date();
  const customer = resolveCustomer(topic, config);
  if ((config.requireCustomerMatch !== false) && (config.customers || []).length && !customer) {
    const error = new Error(`no-customer-match:${topic.title}`);
    error.code = 'no-customer-match';
    throw error;
  }
  const title = workingTitle(topic, customer);
  const slug = toSlug(title);
  const keywords = keywordSet(topic.title, topic.related);
  const description = metaDescription(topic.title, customer?.job || customer?.name);
  const outline = outlineFor(topic, customer);
  const slots = monetizationSlots(config);
  const id = draftId(title, createdAt);
  const body = renderDraftMarkdown({
    id,
    title,
    slug,
    topic,
    customer,
    config,
    outline,
    keywords,
    description,
    slots,
    createdAt,
  });
  const wordCount = countWords(body);

  return {
    id,
    status: 'needs_review',
    language: 'en',
    title,
    slug,
    description,
    keywords,
    wordCount,
    minWords: config.minWords || 1200,
    topic: { ...topic, customer },
    customer,
    outline,
    monetization: slots,
    jsonLd: jsonLd({
      title,
      slug,
      description,
      datePublished: createdAt.toISOString(),
      url: config.blog?.url ? `${String(config.blog.url).replace(/\/$/, '')}/${slug}` : '',
    }),
    createdAt: createdAt.toISOString(),
    approvedAt: null,
    approvedBy: null,
    publishedAt: null,
    bloggerPostId: null,
    file: `drafts/${id}.md`,
    body,
  };
}

export function renderDraftMarkdown({
  id,
  title,
  slug,
  topic,
  customer,
  config,
  outline,
  keywords,
  description,
  slots,
  createdAt,
}) {
  const productLines = (slots.productCtas || []).map((url) => `- Product CTA: ${url}`).join('\n') || '- Product CTA: none yet';
  const affiliateLines = (slots.affiliates || []).map((item) => `- Affiliate: ${item}`).join('\n') || '- Affiliate: none yet';
  const related = (topic.related || []).map((item) => `- ${item}`).join('\n') || '- (none)';
  const outlineMd = outline.map((item, index) => `${index + 1}. ${item}`).join('\n');
  const customerName = customer?.name || 'unassigned — do not publish';
  const voice = config.voice?.tone
    || 'Write as a specialist hired by this customer. Do not write the article you personally wanted to write.';

  return `---
id: ${id}
status: needs_review
language: en
slug: ${slug}
title: ${JSON.stringify(title)}
primaryKeyword: ${JSON.stringify(topic.title)}
customerId: ${JSON.stringify(customer?.id || '')}
createdAt: ${createdAt.toISOString()}
---

# ${title}

> **Customer brief, not an author essay.** Fill every \`[WRITE]\` block as if this customer hired you. If a sentence is about the author's research, portfolio, or preferred niche, delete it. Thin or spun AI text must not be published.

**Meta description:** ${description}

**Voice rule:** ${voice}
**Search demand:** ${topic.volume || 0} · ${topic.geo || 'n/a'} · ${topic.category || 'Uncategorized'}
**Explore:** ${topic.exploreUrl || ''}

## Customer

- **Who:** ${customerName}
- **Job to be done:** ${customer?.job || '[WRITE]'}
- **Pain:** ${customer?.pain || '[WRITE]'}
- **Success:** ${customer?.outcome || '[WRITE]'}
- **Intent hits:** ${(customer?.hits || []).join(', ') || topic.title}

[WRITE] One paragraph in the customer's words: what they typed "${topic.title}" to get done today. No author backstory.

## Outline

${outlineMd}

## Draft body

[WRITE] Introduction (120–180 words). Start with ${customerName}'s situation. Promise the outcome. Do not mention the author's other projects.

[WRITE] Method. Sequence they can run this week. Numbers, not slogans.

[WRITE] Objections. Cost, time, country differences, "is this for someone like me?"

[WRITE] Close. One next action for ${customerName}. Optional product CTA only if it finishes their job.

## Related queries this customer also uses

${related}

## Keywords

${keywords.map((word) => `- ${word}`).join('\n')}

## Monetization slots

- AdSense in-article: ${slots.inArticleAd}
${affiliateLines}
${productLines}

## Publish checklist

- [ ] Written for ${customerName}, not for the author's preferred topic list.
- [ ] English only. No untranslated Korean.
- [ ] At least ${config.minWords || 1200} words of original explanation.
- [ ] At least two named sources the customer can check.
- [ ] Disclosure visible above the first ad.
- [ ] Title matches the customer's search, not a clever author headline.
- [ ] No medical/investment guarantees.
- [ ] Human approved in the queue before Blogger API is called.
`;
}

export function countWords(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;
}
