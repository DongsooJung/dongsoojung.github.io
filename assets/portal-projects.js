import {
  escapeHtml,
  filterProjects,
  matchesProject,
  normalizeQuery,
  projectSearchText,
  sortProjects,
} from './portal-projects-core.mjs';

const DATA_URL = '/assets/projects.json?v=20260729';
const STORAGE_KEY = 'stargate-projects-show-hidden';
const SORT_KEY = 'stargate-projects-sort';

function thumbHtml(project) {
  const thumbClass = project.hero ? 'thumb hero-shot' : 'thumb';
  if (project.thumbImage) {
    return `<div class="${thumbClass}" style="background:url('${escapeHtml(project.thumbImage)}') center/cover"></div>`;
  }
  const style = project.thumbStyle
    ? `background:${project.thumbStyle}`
    : 'background:var(--grad2)';
  const emo = project.emoji
    ? `<span class="emo">${escapeHtml(project.emoji)}</span>`
    : '';
  return `<div class="${thumbClass}" style="${style}">${emo}</div>`;
}

function cardHtml(project) {
  const badge = project.badge
    ? `<div class="badge">${escapeHtml(project.badge)}</div>`
    : '';

  if (project.kind === 'article' || project.links?.length) {
    return `<article class="proj" data-project-id="${escapeHtml(project.id)}" aria-labelledby="proj-${escapeHtml(project.id)}-title">
      ${badge}
      ${thumbHtml(project)}
      <div class="body">
        <div class="ttl" id="proj-${escapeHtml(project.id)}-title">${escapeHtml(project.title)}</div>
        <div class="sub">${escapeHtml(project.subtitle)}</div>
        <div class="row">
          ${(project.links || [])
            .map((link) => {
              const cls = link.role === 'go' ? 'go' : 'tag';
              return `<a class="${cls}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
            })
            .join('')}
        </div>
      </div>
    </article>`;
  }

  const externalAttrs = project.external
    ? ' target="_blank" rel="noopener"'
    : '';
  const styleAttr = project.id === 'koi-coach'
    ? ' style="text-decoration:none;color:inherit"'
    : '';

  return `<a class="proj" data-project-id="${escapeHtml(project.id)}" href="${escapeHtml(project.href)}"${externalAttrs}${styleAttr}>
    ${badge}
    ${thumbHtml(project)}
    <div class="body">
      <div class="ttl">${escapeHtml(project.title)}</div>
      <div class="sub">${escapeHtml(project.subtitle)}</div>
      <div class="row">
        <span class="tag">${escapeHtml(project.tag || '')}</span>
        <span class="go">${escapeHtml(project.cta || '열기 →')}</span>
      </div>
    </div>
  </a>`;
}

function readBool(key, fallback = false) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch (_) {
    return fallback;
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch (_) {}
}

function readSort() {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return value === 'title' || value === 'newest' ? value : 'default';
  } catch (_) {
    return 'default';
  }
}

function writeSort(value) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch (_) {}
}

async function loadProjects() {
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`projects.json ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.projects)) throw new Error('invalid projects payload');
  return data;
}

function mount() {
  const grid = document.getElementById('projects-grid');
  const toolbar = document.getElementById('projects-toolbar');
  const status = document.getElementById('projects-status');
  const searchInput = document.getElementById('projects-search');
  const categoryBar = document.getElementById('projects-categories');
  const sortSelect = document.getElementById('projects-sort');
  const toggle = document.getElementById('project-visibility-toggle');
  if (!grid || !toolbar) return;

  let catalog = { categories: [], projects: [] };
  let state = {
    category: 'all',
    query: '',
    showHidden: readBool(STORAGE_KEY, false),
    sort: readSort(),
  };

  function setStatus(message, isError = false) {
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || '';
    status.dataset.state = isError ? 'error' : 'info';
  }

  function renderCategories() {
    if (!categoryBar) return;
    const cats = catalog.categories?.length
      ? catalog.categories
      : [{ id: 'all', label: '전체' }];
    categoryBar.innerHTML = cats
      .map((cat) => {
        const active = cat.id === state.category;
        return `<button type="button" class="projects-chip${active ? ' is-active' : ''}" data-category="${escapeHtml(cat.id)}" aria-pressed="${active}">${escapeHtml(cat.label)}</button>`;
      })
      .join('');
  }

  function updateToggle() {
    if (!toggle) return;
    const hiddenCount = catalog.projects.filter((p) => p.hiddenByDefault).length;
    if (!hiddenCount) {
      toggle.hidden = true;
      return;
    }
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', String(state.showHidden));
    const label = toggle.querySelector('[data-toggle-label]');
    const icon = toggle.querySelector('[data-toggle-icon]');
    if (label) {
      label.textContent = state.showHidden
        ? '숨긴 프로젝트 다시 접기'
        : `숨긴 프로젝트 보기 (${hiddenCount})`;
    }
    if (icon) icon.textContent = state.showHidden ? '▴' : '▾';
  }

  function render() {
    const visible = filterProjects(catalog.projects, state);
    grid.innerHTML = visible.map(cardHtml).join('');
    grid.setAttribute('aria-busy', 'false');
    const total = catalog.projects.length;
    const hiddenSkipped = !state.showHidden
      ? catalog.projects.filter((p) => p.hiddenByDefault).length
      : 0;
    if (!visible.length) {
      setStatus('조건에 맞는 프로젝트가 없습니다. 검색어나 카테고리를 바꿔보세요.');
    } else {
      const bits = [`${visible.length}/${total}개 표시`];
      if (hiddenSkipped) bits.push(`숨김 ${hiddenSkipped}`);
      setStatus(bits.join(' · '));
    }
    updateToggle();
  }

  function bind() {
    categoryBar?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.getAttribute('data-category') || 'all';
      renderCategories();
      render();
    });

    let searchTimer = 0;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = searchInput.value;
        render();
      }, 120);
    });

    sortSelect?.addEventListener('change', () => {
      state.sort = sortSelect.value || 'default';
      writeSort(state.sort);
      render();
    });

    toggle?.addEventListener('click', () => {
      state.showHidden = !state.showHidden;
      writeBool(STORAGE_KEY, state.showHidden);
      render();
    });
  }

  if (sortSelect) sortSelect.value = state.sort;

  loadProjects()
    .then((data) => {
      catalog = data;
      renderCategories();
      bind();
      render();
      toolbar.hidden = false;
    })
    .catch((error) => {
      console.error(error);
      grid.setAttribute('aria-busy', 'false');
      setStatus('프로젝트 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', true);
      grid.innerHTML = '';
      toolbar.hidden = false;
    });
}

window.StargatePortalProjects = {
  normalizeQuery,
  matchesProject,
  filterProjects,
  sortProjects,
  projectSearchText,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
