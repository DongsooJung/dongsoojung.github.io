const AWAITING_MARKERS = ['(대기)', '(pending)', 'tbd', 'todo', '대기'];

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
