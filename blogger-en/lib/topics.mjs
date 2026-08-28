const HANGUL = /[\uac00-\ud7a3]/;
const LATIN = /[A-Za-z]/;

export const CATEGORY_EN = {
  0: 'All',
  1: 'Autos',
  2: 'Beauty & fashion',
  3: 'Business',
  4: 'Entertainment',
  5: 'Climate',
  6: 'Electronics',
  7: 'Finance',
  8: 'Food',
  9: 'Games',
  10: 'Health',
  11: 'Hobbies',
  12: 'Jobs & education',
  13: 'Law & government',
  14: 'Other',
  15: 'Pets',
  16: 'Politics',
  17: 'Sports',
  18: 'Travel',
  19: 'Science',
  20: 'Shopping',
  21: 'Society',
};

const RPM_WEIGHT = {
  3: 8,
  6: 9,
  7: 10,
  10: 8,
  12: 9,
  19: 7,
  20: 8,
  1: 6,
  18: 6,
  8: 5,
  11: 4,
  9: 3,
  17: 3,
  4: 1,
  16: 0,
};

export function isEnglishTitle(title) {
  const text = String(title || '').trim();
  if (!text || HANGUL.test(text)) return false;
  const letters = [...text].filter((ch) => LATIN.test(ch) || HANGUL.test(ch));
  if (letters.length < 2) return false;
  const latin = letters.filter((ch) => LATIN.test(ch)).length;
  return latin / letters.length >= 0.7;
}

export function categoryId(item) {
  const ids = Array.isArray(item?.categories) ? item.categories : [];
  return Number.isInteger(ids[0]) ? ids[0] : null;
}

export function scoreTopic(item, config = {}) {
  const avoid = new Set((config.avoidCategoryIds || []).map(Number));
  const preferred = new Set((config.preferredCategoryIds || []).map(Number));
  const id = categoryId(item);
  if (id != null && avoid.has(id)) return { score: 0, reason: 'avoid-category' };
  if (!isEnglishTitle(item?.title)) return { score: 0, reason: 'not-english' };

  const volume = Math.max(0, Number(item.volume) || 0);
  const volumeScore = Math.min(40, Math.log10(volume + 1) * 10);
  const rpm = RPM_WEIGHT[id] ?? 4;
  const preferredBonus = id != null && preferred.has(id) ? 8 : 0;
  const relatedBonus = Math.min(6, (item.related || []).filter(isEnglishTitle).length);
  const nicheBonus = nicheOverlap(item.title, config.niches) ? 10 : 0;
  const score = Number((volumeScore + rpm * 3 + preferredBonus + relatedBonus + nicheBonus).toFixed(2));
  return {
    score,
    reason: 'ranked',
    rpmFit: rpm,
    categoryEn: CATEGORY_EN[id] || item.category || 'Uncategorized',
  };
}

export function selectTopics(items, config = {}, limit) {
  const cap = Number(limit || config.topicLimit || 40);
  const ranked = [];
  for (const item of items || []) {
    const scored = scoreTopic(item, config);
    if (scored.score <= 0) continue;
    ranked.push({
      title: item.title,
      volume: Number(item.volume) || 0,
      geo: item.geo || '',
      related: (item.related || []).filter(isEnglishTitle).slice(0, 8),
      categoryId: categoryId(item),
      category: scored.categoryEn,
      exploreUrl: item.exploreUrl || '',
      score: scored.score,
      rpmFit: scored.rpmFit,
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.volume - a.volume || a.title.localeCompare(b.title));
  const seen = new Set();
  const unique = [];
  for (const row of ranked) {
    const key = row.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...row, rank: unique.length + 1 });
    if (unique.length >= cap) break;
  }
  return unique;
}

function nicheOverlap(title, niches) {
  const hay = String(title || '').toLowerCase();
  return (niches || []).some((niche) => {
    const tokens = String(niche)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 3);
    return tokens.some((token) => hay.includes(token));
  });
}
