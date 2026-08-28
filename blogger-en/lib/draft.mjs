import { jsonLd, keywordSet, metaDescription, titleCase, toSlug } from './seo.mjs';

export function draftId(title, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `draft-${stamp}-${toSlug(title, 48)}`;
}

export function workingTitle(topic) {
  const base = titleCase(topic.title);
  if (/^(how|what|why|when)\b/i.test(base)) return base;
  if (topic.category === 'Finance') return `How to Think About ${base} Without the Hype`;
  if (topic.category === 'Jobs & education') return `${base}: A Practical Study System`;
  if (topic.category === 'Electronics' || topic.category === 'Science') {
    return `${base}: What Actually Matters`;
  }
  return `A Clear Guide to ${base}`;
}

export function outlineFor(topic, config) {
  const niche = (config.niches || [])[0] || 'practical knowledge work';
  return [
    `What ${topic.title} actually is, in one paragraph a global reader can use.`,
    `Why this is moving now in ${topic.geo || 'English-speaking markets'} (search demand, not gossip).`,
    `A method I would use this week, with numbers or a checklist.`,
    `Common mistakes and what to skip (policy, scams, shallow listicles).`,
    `How this connects to ${niche}.`,
    `Sources, definitions, and what I will update if the facts change.`,
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
    productCtas: products,
    disclosureRequired: adsense || affiliates.length > 0 || products.length > 0,
  };
}

export function buildDraft(topic, config, options = {}) {
  const createdAt = options.now || new Date();
  const title = workingTitle(topic);
  const slug = toSlug(title);
  const keywords = keywordSet(topic.title, topic.related);
  const description = metaDescription(topic.title, (config.niches || [])[0]);
  const outline = outlineFor(topic, config);
  const slots = monetizationSlots(config);
  const id = draftId(title, createdAt);
  const body = renderDraftMarkdown({
    id,
    title,
    slug,
    topic,
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
    topic,
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

export function renderDraftMarkdown({ id, title, slug, topic, config, outline, keywords, description, slots, createdAt }) {
  const persona = config.voice?.persona || 'Dongsoo Jung';
  const tone = config.voice?.tone || 'Clear, specific English.';
  const productLines = (slots.productCtas || []).map((url) => `- Product CTA: ${url}`).join('\n') || '- Product CTA: none yet';
  const affiliateLines = (slots.affiliates || []).map((item) => `- Affiliate: ${item}`).join('\n') || '- Affiliate: none yet';
  const related = (topic.related || []).map((item) => `- ${item}`).join('\n') || '- (none)';
  const outlineMd = outline.map((item, index) => `${index + 1}. ${item}`).join('\n');

  return `---
id: ${id}
status: needs_review
language: en
slug: ${slug}
title: ${JSON.stringify(title)}
primaryKeyword: ${JSON.stringify(topic.title)}
createdAt: ${createdAt.toISOString()}
---

# ${title}

> **Human review required.** This file is a briefing + skeleton, not a finished article. Fill every \`[WRITE]\` block with first-hand explanation before approval. Thin or spun AI text must not be published (AdSense + Blogger policy).

**Meta description:** ${description}

**Persona:** ${persona}
**Tone:** ${tone}
**Search demand:** ${topic.volume || 0} · ${topic.geo || 'n/a'} · ${topic.category || 'Uncategorized'}
**Explore:** ${topic.exploreUrl || ''}

## Disclosure

This post may contain ads or affiliate links. If I recommend a tool I use, I will say so in plain English. Educational content is not financial, legal, or medical advice.

## Why this topic

[WRITE] One paragraph: what a global English reader is trying to get done when they search "${topic.title}".

## Outline

${outlineMd}

## Draft body

[WRITE] Introduction (120–180 words). Define the term. State the reader outcome.

[WRITE] Method. Give a sequence someone can run this week. Use numbers.

[WRITE] Pitfalls. Name 3 things that waste time or violate platform policy.

[WRITE] Global note. What changes if the reader is in the US vs India vs UK.

[WRITE] Close. One next action + link to a deeper resource.

## Related queries

${related}

## Keywords

${keywords.map((word) => `- ${word}`).join('\n')}

## Monetization slots

- AdSense in-article: ${slots.inArticleAd}
${affiliateLines}
${productLines}

## Publish checklist

- [ ] English only. No untranslated Korean.
- [ ] At least ${config.minWords || 1200} words of original explanation.
- [ ] At least two named sources or first-hand observations.
- [ ] Disclosure visible above the first ad.
- [ ] Title is specific, not clickbait.
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
