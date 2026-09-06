import { ROOT } from './paths.mjs';
import { readJson } from './io.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';

export function seedTopicsFromCustomers(customers = []) {
  const items = [];
  for (const customer of customers) {
    const geos = customer.geos?.length ? customer.geos : ['US'];
    const intents = customer.intents || [];
    intents.forEach((intent, index) => {
      const title = String(intent || '').trim();
      if (!title) return;
      items.push({
        title,
        volume: Math.max(4000, 16000 - index * 400),
        geo: geos[0],
        related: intents.filter((item) => item !== title).slice(0, 8),
        categories: [18],
        category: 'Travel',
        source: 'customer-intent',
        exploreUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geos[0]}`,
      });
    });
  }
  return items;
}

export async function loadSeedCatalog(config) {
  const fromCustomers = seedTopicsFromCustomers(config.customers || []);
  const extra = [];
  const dir = path.join(ROOT, 'data', 'seeds');
  try {
    const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    for (const file of files) {
      const payload = await readJson(path.join(dir, file), { items: [] });
      extra.push(...(payload.items || []));
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  return [...extra, ...fromCustomers];
}
