const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'how', 'what', 'why']);

export function toSlug(value, max = 72) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

export function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function keywordSet(title, related = []) {
  const words = `${title} ${related.join(' ')}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOP.has(word));
  return [...new Set(words)].slice(0, 12);
}

export function metaDescription(title, niche) {
  const focus = niche ? ` for ${niche}` : '';
  return `A practical English guide to ${title}${focus}. Written for a global audience with clear steps, sources, and no hype.`.slice(0, 160);
}

export function jsonLd({ title, slug, description, datePublished, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    inLanguage: 'en',
    datePublished,
    url: url || undefined,
    author: {
      '@type': 'Person',
      name: 'Dongsoo Jung',
      url: 'https://stargateedu.co.kr/en/',
    },
    mainEntityOfPage: url || `/p/${slug}`,
  };
}
