/* ===================== State ===================== */
const state = {
  page: 'play',
  versions: { release: [], all: [] },
  customVersions: [],
  selectedVersion: null,
  selectedIsCustom: false,
  loader: 'vanilla',
  loaderVersion: '',
  fabricLoaders: [],
  fabricGameVersions: null,
  profile: { username: 'Steve', type: 'offline' },
  settings: { memory: { min: '1G', max: '4G' }, javaPath: '', gameDir: '' },
  java: {},
  installed: {},
  gameRunning: false,
  searchCache: { mod: false, resourcepack: false, shader: false },
  searchTimers: {},
  libraryTab: 'mod',
};

/* ===================== Helpers ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), ms);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function showPage(page) {
  state.page = page;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  $$('.page').forEach((p) => {
    if (p.dataset.page === page) p.removeAttribute('hidden');
    else p.setAttribute('hidden', '');
  });
  onPageEnter(page);
  // Обновляем Discord Rich Presence
  if (api.setDiscordSection) {
    api.setDiscordSection(page);
  }
}

async function refreshInstalled() {
  try {
    state.installed = await api.listInstalled({ gameDir: state.settings.gameDir });
  } catch (err) {
    console.error('listInstalled', err);
    state.installed = {};
  }
}

// Обновляет UI карточки в гриде на основе state.installed[slug]
function applyInstalledStateToCard(slug) {
  const card = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
  if (!card) return;
  const meta = state.installed[slug];
  const titleEl = card.querySelector('.item-title');
  const btn = card.querySelector('.install-btn');
  // Удаляем старые элементы
  card.querySelector('.installed-badge')?.remove();
  card.querySelector('.installed-version')?.remove();

  if (meta) {
    // Бейдж рядом с названием
    if (titleEl && !titleEl.querySelector('.installed-badge')) {
      const badge = document.createElement('span');
      badge.className = 'installed-badge';
      badge.title = 'Установлено';
      badge.textContent = '✓';
      titleEl.appendChild(badge);
    }
    // Версия под названием
    const version = meta.versionNumber || meta.versionId;
    if (version) {
      const verEl = document.createElement('div');
      verEl.className = 'installed-version';
      verEl.textContent = `Установлено · ${version}`;
      const body = card.querySelector('.item-body');
      const meta2 = card.querySelector('.item-meta');
      if (body) {
        if (meta2) body.insertBefore(verEl, meta2);
        else body.appendChild(verEl);
      }
    }
    // Кнопка → Переустановить
    if (btn) {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Переустановить
      `;
    }
  } else {
    if (btn) {
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Установить
      `;
    }
  }
}

function onPageEnter(page) {
  if (page === 'mods' && !state.searchCache.mod) performSearch('mod');
  if (page === 'resourcepacks' && !state.searchCache.resourcepack) performSearch('resourcepack');
  if (page === 'shaders' && !state.searchCache.shader) performSearch('shader');
  if (page === 'library') refreshLibrary();
  if (page === 'settings') populateSettings();
}

/* ===================== Window controls ===================== */
$$('.wc-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.act;
    if (a === 'min') api.minimize();
    else if (a === 'max') api.maximize();
    else if (a === 'close') api.close();
  });
});

/* ===================== Navigation ===================== */
$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

/* ===================== Init ===================== */
async function init() {
  state.profile = await api.getProfile();
  state.settings = await api.getSettings();
  $('#userName').textContent = state.profile.username || 'Steve';

  await refreshInstalled();

  try {
    const data = await api.getVersions();
    state.versions.all = data.versions;
    state.versions.release = data.versions.filter((v) => v.type === 'release');
    await loadCustomVersions();
    populateVersionSelects();
    state.selectedVersion = data.latest?.release || state.versions.release[0]?.id;
    state.selectedIsCustom = false;
    if (state.selectedVersion) $('#versionSelect').value = state.selectedVersion;
  } catch (err) {
    toast('Не удалось получить список версий с Mojang');
    console.error(err);
  }

  await refreshJavaList();
  updateJavaStatus();

  api.onInstallProgress(({ slug, progress }) => {
    const card = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (!card) return;
    let bar = card.querySelector('.item-progress-fill');
    if (!bar) {
      const wrap = document.createElement('div');
      wrap.className = 'item-progress';
      wrap.innerHTML = '<div class="item-progress-fill"></div>';
      card.appendChild(wrap);
      bar = wrap.querySelector('.item-progress-fill');
    }
    bar.style.width = `${Math.round(progress * 100)}%`;
    if (progress >= 1) {
      setTimeout(() => bar.parentElement?.remove(), 600);
      // Состояние карточки обновится из refreshInstalled() в installProject
    }
  });

  api.onJavaProgress((d) => {
    const row = document.querySelector(`[data-java-major="${d.major}"]`);
    if (!row) return;
    const fill = row.querySelector('.j-progress-fill');
    const status = row.querySelector('.j-status');
    if (d.phase === 'download') {
      if (fill) fill.style.width = `${Math.round(d.progress * 100)}%`;
      if (status) status.textContent = `Загрузка ${Math.round(d.progress * 100)}%`;
    } else if (d.phase === 'extract') {
      if (fill) fill.style.width = '100%';
      if (status) status.textContent = 'Распаковка…';
    } else if (d.phase === 'done') {
      if (status) status.textContent = 'Установлено';
      setTimeout(() => refreshJavaList(), 200);
    }
  });

  api.onMcProgress((p) => {
    $('#launchProgress').hidden = false;
    const total = p.total || 1;
    const cur = p.task || p.current || 0;
    const ratio = Math.max(0.02, Math.min(1, cur / total));
    $('#launchFill').style.width = `${ratio * 100}%`;
    const phase = p.type ? phaseRu(p.type) : 'Загрузка';
    $('#launchText').textContent = `${phase} • ${Math.round(ratio * 100)}%`;
  });

  api.onMcLog(({ msg }) => {
    if (typeof msg !== 'string') return;
    const m = msg.toLowerCase();
    if (m.includes('starting') || m.includes('attempting') || m.includes('launching') || m.includes('запуск java')) {
      $('#launchText').textContent = 'Запуск Java…';
      $('#launchFill').style.width = '100%';
    }
  });

  api.onMcClose(() => {
    $('#launchProgress').hidden = true;
    $('#launchFill').style.width = '0%';
    state.gameRunning = false;
    updatePlayButton();
    toast('Игра закрыта');
  });

  // Tray "Запустить игру" — кликаем кнопку Play
  if (api.onTrayLaunch) {
    api.onTrayLaunch(() => {
      showPage('play');
      $('#playBtn').click();
    });
  }
}

function updatePlayButton() {
  const btn = $('#playBtn');
  if (!btn) return;
  if (state.gameRunning) {
    btn.disabled = false;
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-danger');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
      <span>Закрыть игру</span>
    `;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
      <span>Играть</span>
    `;
  }
}

function phaseRu(type) {
  const map = {
    'classes': 'Библиотеки',
    'classes-maven-custom': 'Библиотеки',
    'natives': 'Нативные библиотеки',
    'assets': 'Ассеты',
    'version-jar': 'Клиент',
    'libraries': 'Библиотеки',
  };
  return map[type] || type;
}

function populateVersionSelects() {
  const releases = state.versions.release.slice(0, 100);
  const select = $('#versionSelect');

  let html = '';
  if (state.customVersions.length) {
    html += '<optgroup label="Свои версии">';
    for (const cv of state.customVersions) {
      html += `<option value="custom:${escapeHtml(cv.id)}">${escapeHtml(cv.id)}</option>`;
    }
    html += '</optgroup>';
    html += '<optgroup label="Vanilla">';
  }
  html += releases.map((v) => `<option value="${v.id}">${v.id}</option>`).join('');
  if (state.customVersions.length) html += '</optgroup>';
  select.innerHTML = html;

  // Версии для фильтра поиска модов — только release
  $$('[data-version-filter]').forEach((sel) => {
    sel.innerHTML = '<option value="">Все версии</option>' +
      releases.map((v) => `<option value="${v.id}">${v.id}</option>`).join('');
  });
}

async function loadCustomVersions() {
  try {
    state.customVersions = await api.listCustomVersions({ gameDir: state.settings.gameDir }) || [];
  } catch (err) {
    console.error('listCustomVersions', err);
    state.customVersions = [];
  }
}

function parseVersionValue(value) {
  if (typeof value === 'string' && value.startsWith('custom:')) {
    return { id: value.slice(7), isCustom: true };
  }
  return { id: value, isCustom: false };
}

$('#versionSelect').addEventListener('change', async (e) => {
  const parsed = parseVersionValue(e.target.value);
  state.selectedVersion = parsed.id;
  state.selectedIsCustom = parsed.isCustom;
  // Кастомные версии — без выбора loader (он вшит в манифест)
  if (parsed.isCustom) {
    state.loader = 'vanilla';
    state.loaderVersion = '';
    $$('.loader-tab').forEach((t) => t.classList.toggle('active', t.dataset.loader === 'vanilla'));
    $('#loaderVersionRow').hidden = true;
  }
  updateJavaStatus();
  if (state.loader === 'fabric') await loadFabricLoaders();
});

/* ===================== Loader tabs ===================== */
$$('.loader-tab').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    if (state.selectedIsCustom) {
      toast('Кастомная версия определяет свой загрузчик');
      return;
    }
    state.loader = btn.dataset.loader;
    $$('.loader-tab').forEach((t) => t.classList.toggle('active', t === btn));
    if (state.loader === 'fabric') {
      $('#loaderVersionRow').hidden = false;
      await loadFabricLoaders();
    } else {
      $('#loaderVersionRow').hidden = true;
      state.loaderVersion = '';
    }
  });
});

async function loadFabricLoaders() {
  const select = $('#loaderVersionSelect');
  select.innerHTML = '<option>Загрузка…</option>';
  try {
    const loaders = await api.getFabricLoaders(state.selectedVersion);
    // Это массив объектов { loader: {...}, intermediary: {...}, launcherMeta: {...} }
    // или просто массив loader-объектов, если без gameVersion
    const list = Array.isArray(loaders) && loaders[0]?.loader
      ? loaders.map((x) => x.loader)
      : loaders;
    const stable = list.filter((l) => l.stable);
    const items = (stable.length ? stable : list).slice(0, 30);
    if (!items.length) {
      select.innerHTML = '<option value="">Нет совместимых</option>';
      return;
    }
    state.fabricLoaders = items;
    select.innerHTML = items
      .map((l, i) => `<option value="${escapeHtml(l.version)}"${i === 0 ? ' selected' : ''}>${escapeHtml(l.version)}${l.stable ? '' : ' (beta)'}</option>`)
      .join('');
    state.loaderVersion = items[0].version;
  } catch (err) {
    select.innerHTML = '<option value="">Ошибка загрузки</option>';
    console.error(err);
  }
}

$('#loaderVersionSelect').addEventListener('change', (e) => {
  state.loaderVersion = e.target.value;
});

/* ===================== Java status / install ===================== */
async function refreshJavaList() {
  state.java = await api.listJava();
  renderJavaList();
}

function renderJavaList() {
  const list = $('#javaList');
  if (!list) return;
  const majors = [
    { v: 8,  use: 'для 1.16 и ниже' },
    { v: 17, use: 'для 1.17 — 1.20.4' },
    { v: 21, use: 'для 1.20.5 и выше' },
  ];
  list.innerHTML = majors.map(({ v, use }) => {
    const j = state.java[v] || {};
    return `
      <div class="java-row" data-java-major="${v}">
        <div class="java-info">
          <div class="java-version">Java ${v}</div>
          <div class="java-use">${use}</div>
        </div>
        <div class="java-state">
          ${j.installed
            ? '<span class="badge badge-green">Установлено</span>'
            : '<span class="j-status">Не установлено</span>'}
        </div>
        <button class="btn btn-${j.installed ? 'ghost' : 'primary'} btn-small j-install" data-major="${v}">
          ${j.installed
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0M12 3v18"/></svg> Переустановить'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Установить'}
        </button>
        <div class="j-progress"><div class="j-progress-fill"></div></div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.j-install').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const major = parseInt(btn.dataset.major, 10);
      btn.disabled = true;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity=".3"/><path d="M12 2a10 10 0 0110 10"/></svg> Загрузка…';
      try {
        await api.installJava({ major });
        toast(`Java ${major} установлена`);
        await refreshJavaList();
        updateJavaStatus();
      } catch (err) {
        toast(`Ошибка: ${err.message || err}`);
        btn.disabled = false;
        await refreshJavaList();
      }
    });
  });
}

async function updateJavaStatus() {
  if (!state.selectedVersion) return;
  // Для кастомной — используем inheritsFrom; иначе саму версию
  let mcVer = state.selectedVersion;
  if (state.selectedIsCustom) {
    const cv = state.customVersions.find((v) => v.folderName === state.selectedVersion);
    if (cv?.inheritsFrom) mcVer = cv.inheritsFrom;
  }
  const recommended = await api.recommendJava(mcVer);
  const installed = state.java[recommended]?.installed;
  const userJava = state.settings?.javaPath;
  const statusEl = $('#javaStatus');
  const checkBtn = $('#checkJavaBtn');
  if (installed || userJava) {
    statusEl.textContent = userJava ? 'Готов · своя Java' : `Готов · Java ${recommended}`;
    statusEl.parentElement.classList.remove('warn');
    checkBtn.hidden = true;
  } else {
    statusEl.textContent = `Нужна Java ${recommended}`;
    statusEl.parentElement.classList.add('warn');
    checkBtn.hidden = false;
    checkBtn.dataset.installMajor = recommended;
  }
}

$('#checkJavaBtn').addEventListener('click', async () => {
  const major = parseInt($('#checkJavaBtn').dataset.installMajor || '21', 10);
  $('#checkJavaBtn').disabled = true;
  $('#checkJavaBtn').textContent = 'Загрузка Java…';
  try {
    await api.installJava({ major });
    toast(`Java ${major} установлена`);
    await refreshJavaList();
    updateJavaStatus();
  } catch (err) {
    toast(`Ошибка: ${err.message || err}`);
  } finally {
    $('#checkJavaBtn').disabled = false;
  }
});

/* ===================== Play ===================== */
$('#playBtn').addEventListener('click', async () => {
  // Если игра уже запущена — кнопка работает как "Закрыть игру"
  if (state.gameRunning) {
    await api.stopGame();
    toast('Останавливаю игру…');
    return;
  }
  if (!state.selectedVersion) {
    toast('Сначала выбери версию');
    return;
  }
  if (state.loader === 'fabric' && !state.loaderVersion) {
    toast('Выбери версию Fabric Loader');
    return;
  }
  $('#playBtn').disabled = true;
  $('#launchProgress').hidden = false;
  $('#launchText').textContent = 'Подготовка…';
  $('#launchFill').style.width = '5%';

  const res = await api.launch({
    version: state.selectedVersion,
    profile: state.profile,
    settings: state.settings,
    loader: state.loader,
    loaderVersion: state.loaderVersion,
    isCustom: state.selectedIsCustom,
  });

  if (!res.ok) {
    if (res.needBaseVersion && res.folderName) {
      toast('Нужна базовая версия Minecraft', 3500);
      $('#launchProgress').hidden = true;
      $('#playBtn').disabled = false;
      openBaseVersionPicker(res.folderName);
      return;
    }
    toast(`${res.error}`, 5000);
    $('#launchProgress').hidden = true;
    $('#playBtn').disabled = false;
  } else {
    $('#launchText').textContent = 'Запущено';
    $('#launchFill').style.width = '100%';
    state.gameRunning = true;
    updatePlayButton();
    setTimeout(() => { $('#launchProgress').hidden = true; }, 2000);
  }
});

/* ===================== Modrinth Search ===================== */
$$('[data-search]').forEach((input) => {
  const type = input.dataset.search;
  input.addEventListener('input', () => {
    clearTimeout(state.searchTimers[type]);
    state.searchTimers[type] = setTimeout(() => performSearch(type), 350);
  });
});

$$('[data-version-filter]').forEach((sel) => {
  sel.addEventListener('change', () => performSearch(sel.dataset.versionFilter));
});

$$('[data-loader-filter]').forEach((sel) => {
  sel.addEventListener('change', () => performSearch(sel.dataset.loaderFilter));
});

async function performSearch(type) {
  const grid = document.querySelector(`[data-grid="${type}"]`);
  if (!grid) return;
  const query = document.querySelector(`[data-search="${type}"]`)?.value || '';
  const gameVersion = document.querySelector(`[data-version-filter="${type}"]`)?.value || '';
  const loader = document.querySelector(`[data-loader-filter="${type}"]`)?.value || '';

  grid.innerHTML = '<div class="empty">Поиск…</div>';
  state.searchCache[type] = true;

  try {
    const data = await api.search({ query, projectType: type, gameVersion, loader, limit: 24 });
    renderGrid(type, data.hits || []);
  } catch (err) {
    grid.innerHTML = '<div class="empty">Не удалось получить результаты</div>';
    console.error(err);
  }
}

function renderGrid(type, items) {
  const grid = document.querySelector(`[data-grid="${type}"]`);
  if (!items.length) {
    grid.innerHTML = '<div class="empty">Ничего не найдено</div>';
    return;
  }
  grid.innerHTML = items.map((p) => itemCardHTML(p)).join('');
  grid.querySelectorAll('.install-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = btn.dataset.slug;
      const project = items.find((i) => i.slug === slug);
      if (project) installProject(project, type);
    });
  });
}

function itemCardHTML(p) {
  const cover = p.icon_url
    ? `style="background-image:url('${escapeHtml(p.icon_url)}');"`
    : '';
  const downloads = p.downloads
    ? (p.downloads >= 1000 ? `${(p.downloads / 1000).toFixed(1)}k загрузок` : `${p.downloads} загрузок`)
    : '';
  const installed = state.installed[p.slug];
  const isInstalled = !!installed;
  const version = installed?.versionNumber || installed?.versionId || '';

  const badge = isInstalled
    ? '<span class="installed-badge" title="Установлено">✓</span>'
    : '';
  const versionLine = isInstalled && version
    ? `<div class="installed-version">Установлено · ${escapeHtml(version)}</div>`
    : '';
  const btnClass = isInstalled ? 'btn-ghost' : 'btn-primary';
  const btnContent = isInstalled
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Переустановить`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Установить`;

  return `
    <article class="item-card${isInstalled ? ' is-installed' : ''}" data-slug="${escapeHtml(p.slug)}">
      <div class="item-cover" ${cover}></div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(p.title)}${badge}</div>
        <div class="item-desc">${escapeHtml(p.description || '')}</div>
        ${versionLine}
        <div class="item-meta">${escapeHtml(downloads)}</div>
      </div>
      <div class="item-actions">
        <button class="btn ${btnClass} install-btn" data-slug="${escapeHtml(p.slug)}">
          ${btnContent}
        </button>
      </div>
    </article>
  `;
}

async function installProject(project, type) {
  try {
    const gameVersion = document.querySelector(`[data-version-filter="${type}"]`)?.value || '';
    const loader = document.querySelector(`[data-loader-filter="${type}"]`)?.value || '';

    const versions = await api.getProjectVersions({ slug: project.slug, gameVersion, loader });
    if (!versions || !versions.length) {
      toast('Нет совместимой версии. Сними фильтры и попробуй снова');
      return;
    }
    const version = versions[0];
    const isReinstall = !!state.installed[project.slug];
    toast(`${isReinstall ? 'Переустановка' : 'Загрузка'} ${project.title}…`);
    const res = await api.install({ project, version, gameDir: state.settings.gameDir });
    if (res?.ok) {
      await refreshInstalled();
      applyInstalledStateToCard(project.slug);
      // Карточка получает «вспышку», что обновилась
      const card = document.querySelector(`[data-slug="${CSS.escape(project.slug)}"]`);
      card?.classList.add('just-installed');
      setTimeout(() => card?.classList.remove('just-installed'), 1200);
      toast(`${project.title} ${isReinstall ? 'переустановлен' : 'установлен'}`);
    }
  } catch (err) {
    console.error(err);
    toast(`Ошибка установки: ${err.message}`);
  }
}

/* ===================== Library ===================== */
$$('.tab[data-lib]').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.libraryTab = tab.dataset.lib;
    $$('.tab[data-lib]').forEach((t) => t.classList.toggle('active', t === tab));
    refreshLibrary();
  });
});

$('#openFolderBtn').addEventListener('click', () => {
  api.openContentFolder({ gameDir: state.settings.gameDir, type: state.libraryTab });
});

async function refreshLibrary() {
  const list = $('#libraryList');
  list.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const items = await api.listContent({ gameDir: state.settings.gameDir, type: state.libraryTab });
    if (!items.length) {
      list.innerHTML = '<div class="empty">Тут пока пусто. Установи что-нибудь со страницы поиска</div>';
      return;
    }
    list.innerHTML = items.map((it) => `
      <div class="lib-row" data-name="${escapeHtml(it.name)}">
        <div class="lib-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="lib-name">${escapeHtml(it.name)}</div>
        <div class="lib-size">${formatBytes(it.size)}</div>
        <button class="lib-delete" title="Удалить">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.lib-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.lib-row');
        const name = row?.dataset.name;
        if (!name) return;
        await api.deleteContent({ gameDir: state.settings.gameDir, type: state.libraryTab, name });
        await refreshInstalled();
        // Обновим карточки во всех гридах поиска (если они открыты)
        document.querySelectorAll('.item-card[data-slug]').forEach((c) => {
          const slug = c.dataset.slug;
          if (slug) applyInstalledStateToCard(slug);
        });
        toast('Удалено');
        refreshLibrary();
      });
    });
  } catch {
    list.innerHTML = '<div class="empty">Ошибка чтения</div>';
  }
}

/* ===================== Settings ===================== */
function populateSettings() {
  $('#settingsUsername').value = state.profile.username || 'Steve';
  $('#settingsJava').value = state.settings.javaPath || '';
  $('#settingsMemMin').value = state.settings.memory?.min || '1G';
  $('#settingsMemMax').value = state.settings.memory?.max || '4G';
  $('#settingsGameDir').value = state.settings.gameDir || '';
  refreshJavaList();
  loadCustomVersions().then(renderCustomVersionsList);
}

$('#browseJava').addEventListener('click', async () => {
  const file = await api.browseJava();
  if (file) $('#settingsJava').value = file;
});

$('#saveSettings').addEventListener('click', async () => {
  const username = ($('#settingsUsername').value || 'Steve').trim().slice(0, 16) || 'Steve';
  state.profile = { ...state.profile, username };
  state.settings = {
    memory: {
      min: $('#settingsMemMin').value || '1G',
      max: $('#settingsMemMax').value || '4G',
    },
    javaPath: $('#settingsJava').value || '',
    gameDir: $('#settingsGameDir').value || state.settings.gameDir,
  };
  await api.saveProfile(state.profile);
  await api.saveSettings(state.settings);
  $('#userName').textContent = state.profile.username;
  const hint = $('#settingsHint');
  hint.textContent = '✓ Сохранено';
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 1800);
  updateJavaStatus();
});

/* ===================== Custom versions ===================== */
function openBaseVersionPicker(folderName) {
  // Создаём модалку на лету
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">Базовая версия Minecraft</div>
        <button class="modal-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="modal-sub">Выбери, какая vanilla-версия должна использоваться как база для <b>${escapeHtml(folderName)}</b>. Лаунчер запишет это в манифест и скачает базовый клиент при запуске.</p>
      <div class="modal-row">
        <label>Версия</label>
        <select class="input modal-base-select">
          ${state.versions.release.slice(0, 100).map((v) => `<option value="${v.id}">${v.id}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-small modal-cancel">Отмена</button>
        <button class="btn btn-primary btn-small modal-save">Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 220);
  }

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.modal-save').addEventListener('click', async () => {
    const baseVersion = overlay.querySelector('.modal-base-select').value;
    const res = await api.setVersionBase({
      gameDir: state.settings.gameDir,
      folderName,
      baseVersion,
    });
    if (res?.ok) {
      toast(`База установлена: ${baseVersion}`);
      await loadCustomVersions();
      populateVersionSelects();
      renderCustomVersionsList();
      updateJavaStatus();
    } else {
      toast(res?.error || 'Не удалось сохранить');
    }
    close();
  });
}

async function importCustomVersion() {
  try {
    const res = await api.importVersion({ gameDir: state.settings.gameDir });
    if (res?.canceled) return;
    if (!res?.ok) {
      toast(res?.error || 'Не удалось импортировать');
      return;
    }
    toast(`Версия "${res.folderName}" добавлена`);
    await loadCustomVersions();
    populateVersionSelects();
    // Сразу выбираем импортированную
    state.selectedVersion = res.folderName;
    state.selectedIsCustom = true;
    $('#versionSelect').value = `custom:${res.folderName}`;
    updateJavaStatus();
    renderCustomVersionsList();
  } catch (err) {
    console.error(err);
    toast(`Ошибка: ${err.message}`);
  }
}

$('#importVersionBtn').addEventListener('click', importCustomVersion);
$('#importVersionBtn2').addEventListener('click', importCustomVersion);
$('#openVersionsBtn').addEventListener('click', () => {
  api.openVersionsFolder({ gameDir: state.settings.gameDir });
});

function renderCustomVersionsList() {
  const list = $('#customVersionsList');
  if (!list) return;
  if (!state.customVersions.length) {
    list.innerHTML = '<div class="empty-small">Пусто. Добавь .json или папку версии Minecraft</div>';
    return;
  }
  list.innerHTML = state.customVersions.map((v) => {
    const needsBase = !v.inheritsFrom;
    return `
    <div class="cv-row${needsBase ? ' cv-warn' : ''}" data-name="${escapeHtml(v.folderName)}">
      <div class="cv-info">
        <div class="cv-name">
          ${escapeHtml(v.id)}
          ${needsBase ? '<span class="cv-warn-badge" title="Не указана базовая версия">!</span>' : ''}
        </div>
        <div class="cv-meta">
          ${needsBase
            ? '<span class="cv-warn-text">Нужна базовая версия Minecraft</span>'
            : `на основе ${escapeHtml(v.inheritsFrom)} · ${escapeHtml(v.type || 'custom')}`}
        </div>
      </div>
      <button class="cv-base" title="Указать базовую версию">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l3-1.7"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg>
      </button>
      <button class="cv-delete" title="Удалить">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
      </button>
    </div>
    `;
  }).join('');

  list.querySelectorAll('.cv-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('.cv-row');
      const name = row?.dataset.name;
      if (!name) return;
      await api.deleteCustomVersion({ gameDir: state.settings.gameDir, folderName: name });
      toast(`Версия "${name}" удалена`);
      await loadCustomVersions();
      populateVersionSelects();
      if (state.selectedIsCustom && state.selectedVersion === name) {
        state.selectedVersion = state.versions.release[0]?.id || '';
        state.selectedIsCustom = false;
        $('#versionSelect').value = state.selectedVersion;
        updateJavaStatus();
      }
      renderCustomVersionsList();
    });
  });

  list.querySelectorAll('.cv-base').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('.cv-row');
      const name = row?.dataset.name;
      if (!name) return;
      openBaseVersionPicker(name);
    });
  });
}

/* ===================== Boot ===================== */
init();
