const AWAITING_MARKERS = ['(대기)', '(pending)', 'tbd', 'todo', '대기'];

export function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: String(text || '') };
  return { meta: parseSimpleYaml(match[1]), body: match[2] };
}

export function parseSimpleYaml(src) {
  const lines = String(src || '').split(/\r?\n/);
  const root = {};
  let currentKey = null;
  let currentObject = null;

  const assign = (target, key, value) => {
    target[key] = coerceScalar(value);
  };

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const listItem = rawLine.match(/^(\s*)-\s+(.*)$/);
    if (listItem) {
      const indent = listItem[1].length;
      const value = coerceScalar(listItem[2]);
      if (indent >= 2 && currentObject && currentKey) {
        if (!Array.isArray(currentObject[currentKey])) currentObject[currentKey] = [];
        currentObject[currentKey].push(value);
      } else if (currentKey) {
        if (!Array.isArray(root[currentKey])) root[currentKey] = [];
        root[currentKey].push(value);
        currentObject = null;
      }
      continue;
    }

    const nested = rawLine.match(/^(\s{2,})([A-Za-z0-9_]+):\s*(.*)$/);
    if (nested && currentKey && root[currentKey] && typeof root[currentKey] === 'object' && !Array.isArray(root[currentKey])) {
      currentObject = root[currentKey];
      assign(currentObject, nested[2], nested[3]);
      continue;
    }

    const pair = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;
    currentKey = pair[1];
    currentObject = null;
    const rest = pair[2];
    if (rest === '' || rest === '|' || rest === '>') {
      root[currentKey] = {};
    } else if (rest === '[]') {
      root[currentKey] = [];
    } else {
      assign(root, currentKey, rest);
    }
  }
  return root;
}

function coerceScalar(value) {
  const trimmed = String(value ?? '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~' || trimmed === '') return '';
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parseMarkdownSections(body) {
  const sections = {};
  let current = '_preamble';
  const bucket = { [current]: [] };
  for (const line of String(body || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)\s*$/);
    if (heading) {
      current = slugify(heading[1]);
      bucket[current] = [];
      continue;
    }
    bucket[current].push(line);
  }
  for (const [key, lines] of Object.entries(bucket)) {
    sections[key] = lines.join('\n').trim();
  }
  return sections;
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

export function isPlaceholderText(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  return AWAITING_MARKERS.some((marker) => lower === marker || lower.startsWith(marker));
}

export function ingestPlanMarkdown(markdown) {
  const { meta, body } = parseFrontmatter(markdown);
  const sections = parseMarkdownSections(body);
  const filledSections = Object.entries(sections)
    .filter(([key]) => key !== '_preamble' && key !== 'plan-intake')
    .filter(([, value]) => !isPlaceholderText(value));

  const status = meta.status || (filledSections.length === 0 ? 'awaiting' : 'ready');
  const overlay = {
    ingestedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    status: status === 'awaiting' || filledSections.length === 0 ? 'awaiting_plan' : 'plan_ready',
    language: meta.language || 'en',
    blog: {
      id: String(meta.blogId || ''),
      url: String(meta.blogUrl || ''),
      name: String(meta.blogName || ''),
    },
    cadencePerWeek: Number(meta.cadencePerWeek || 0) || 3,
    geos: Array.isArray(meta.geos) && meta.geos.length ? meta.geos.map((geo) => String(geo).toUpperCase()) : undefined,
    monetization: {
      adsense: meta.adsense !== false,
      affiliates: Array.isArray(meta.affiliates) ? meta.affiliates : [],
      productCtas: Array.isArray(meta.productCtas) ? meta.productCtas : undefined,
    },
    sections: Object.fromEntries(filledSections),
    filledSectionCount: filledSections.length,
    awaitingSectionCount: Object.keys(sections).filter((key) => key !== '_preamble' && key !== 'plan-intake').length - filledSections.length,
  };

  if (sections.niche && !isPlaceholderText(sections.niche)) {
    overlay.niches = splitPillars(sections.niche);
  }
  if (sections.voice && !isPlaceholderText(sections.voice)) {
    overlay.voice = { persona: overlay.voice?.persona, tone: sections.voice };
  }

  return overlay;
}

export function mergeConfig(base, overlay) {
  const next = structuredClone(base || {});
  if (!overlay) return next;
  if (overlay.status) next.status = overlay.status;
  if (overlay.language) next.language = overlay.language;
  if (overlay.blog) {
    next.blog = { ...(next.blog || {}), ...compact(overlay.blog) };
  }
  if (overlay.cadencePerWeek) next.cadencePerWeek = overlay.cadencePerWeek;
  if (overlay.geos) next.geos = overlay.geos;
  if (overlay.niches) next.niches = overlay.niches;
  if (overlay.monetization) {
    next.monetization = {
      ...(next.monetization || {}),
      ...compact(overlay.monetization),
      affiliates: overlay.monetization.affiliates ?? next.monetization?.affiliates ?? [],
      productCtas: overlay.monetization.productCtas ?? next.monetization?.productCtas ?? [],
    };
  }
  if (overlay.voice) {
    next.voice = { ...(next.voice || {}), ...compact(overlay.voice) };
  }
  next.plan = {
    filledSectionCount: overlay.filledSectionCount || 0,
    awaitingSectionCount: overlay.awaitingSectionCount || 0,
    ingestedAt: overlay.ingestedAt || null,
    sections: overlay.sections || {},
  };
  return next;
}

function compact(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== ''),
  );
}

function splitPillars(text) {
  return String(text)
    .split(/\r?\n|•|;/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line && !isPlaceholderText(line))
    .slice(0, 8);
}
