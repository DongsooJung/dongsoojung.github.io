import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = process.env.BLOGGER_EN_ROOT
  ? path.resolve(process.env.BLOGGER_EN_ROOT)
  : path.resolve(here, '..');
export const CONFIG_PATH = path.join(ROOT, 'config.json');
export const PLAN_PATH = path.join(ROOT, 'PLAN.md');
export const DATA_DIR = path.join(ROOT, 'data');
export const DRAFTS_DIR = path.join(ROOT, 'drafts');
export const TOPICS_PATH = path.join(DATA_DIR, 'topics.json');
export const TRENDS_PATH = path.join(DATA_DIR, 'trends.json');
export const QUEUE_PATH = path.join(DATA_DIR, 'queue.json');
export const PUBLISHED_PATH = path.join(DATA_DIR, 'published.json');
export const OVERLAY_PATH = path.join(DATA_DIR, 'plan-overlay.json');
export const STATUS_PATH = path.join(DATA_DIR, 'status.json');
