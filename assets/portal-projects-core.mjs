export function normalizeQuery(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function projectSearchText(project) {
  const linkText = (project.links || []).map((link) => link.label).join(' ');
  return [
    project.id,
    project.title,
    project.subtitle,
    project.tag,
    project.badge,
    project.cta,
    ...(project.categories || []),
    linkText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesProject(project, { category = 'all', query = '' } = {}) {
  const cats = project.categories || [];
  if (category && category !== 'all' && !cats.includes(category)) return false;
  const q = normalizeQuery(query);
  if (!q) return true;
  return projectSearchText(project).includes(q);
}

export function sortProjects(projects, sort = 'default') {
  const list = projects.slice();
  if (sort === 'title') {
    list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ko'));
  } else if (sort === 'newest') {
    list.sort((a, b) => {
      const aNew = /NEW|LIVE|FEATURED/i.test(a.badge || '') ? 1 : 0;
      const bNew = /NEW|LIVE|FEATURED/i.test(b.badge || '') ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return 0;
    });
  }
  return list;
}

export function filterProjects(projects, options = {}) {
  const {
    category = 'all',
    query = '',
    showHidden = false,
    sort = 'default',
  } = options;
  const filtered = projects.filter((project) => {
    if (!showHidden && project.hiddenByDefault) return false;
    return matchesProject(project, { category, query });
  });
  return sortProjects(filtered, sort);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
