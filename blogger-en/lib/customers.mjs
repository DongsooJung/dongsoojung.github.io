import { isPlaceholderText, slugify } from './text.mjs';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'that', 'this', 'from', 'without', 'into']);

export function parseCustomers(sectionText) {
  if (!sectionText || isPlaceholderText(sectionText)) return [];
  const customers = [];
  let current = null;

  const push = () => {
    if (!current) return;
    const name = current.name.trim();
    if (!name) return;
    if (!current.job && current.intents.length === 0) return;
    customers.push({
      id: slugify(name),
      name,
      job: current.job,
      pain: current.pain,
      outcome: current.outcome,
      intents: unique(current.intents),
      geos: unique(current.geos.map((geo) => geo.toUpperCase())),
    });
  };

  for (const raw of String(sectionText).split(/\r?\n/)) {
    const heading = raw.match(/^###\s+(.+)\s*$/);
    if (heading) {
      push();
      current = { name: heading[1], job: '', pain: '', outcome: '', intents: [], geos: [] };
      continue;
    }
    if (!current) continue;
    const field = raw.match(/^[-*]\s*(Job|Pain|Outcome|Intents?|Geo(?:s)?)\s*:\s*(.+)$/i);
    if (!field) continue;
    const key = field[1].toLowerCase();
    const value = field[2].trim();
    if (key.startsWith('intent')) current.intents.push(...splitList(value));
    else if (key.startsWith('geo')) current.geos.push(...splitList(value));
    else if (key === 'job') current.job = value;
    else if (key === 'pain') current.pain = value;
    else if (key === 'outcome') current.outcome = value;
  }
  push();
  return customers;
}

export function matchCustomer(topic, customers = []) {
  if (!customers.length) return null;
  const hay = haystack(topic);
  let best = null;
  for (const customer of customers) {
    let score = 0;
    const hits = [];
    for (const intent of customer.intents || []) {
      const needle = String(intent || '').trim().toLowerCase();
      if (needle.length < 2) continue;
      if (hay.includes(needle)) {
        score += 12;
        hits.push(intent);
      }
    }
    for (const token of tokens(`${customer.job} ${customer.pain} ${customer.outcome}`)) {
      if (hay.includes(token)) score += 2;
    }
    if ((customer.geos || []).length && topic.geo) {
      if (!customer.geos.includes(String(topic.geo).toUpperCase())) score *= 0.45;
    }
    if (!best || score > best.score) {
      best = { ...customer, score: Number(score.toFixed(2)), hits };
    }
  }
  if (!best || best.score < 12) return null;
  return best;
}

export function requireCustomerMatch(config = {}) {
  return config.requireCustomerMatch !== false;
}

function haystack(topic) {
  return [topic?.title, ...(topic?.related || []), topic?.category, topic?.categoryEn]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 3 && !STOP.has(token));
}

function splitList(value) {
  return String(value)
    .split(/[,;|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
