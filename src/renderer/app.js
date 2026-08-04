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
  modpacks: {},
  gameRunning: false,
  appVersion: '0.0.0',
  theme: 'glass',
  lang: 'ru',
  customTheme: { accent: '#0a84ff', bg: '#15151b', text: '#ffffff', bgAlpha: 100 },
  searchCache: { mod: false, resourcepack: false, shader: false, modpack: false },
  searchTimers: {},
  libraryTab: 'mod',
  accounts: [],
  servers: [],
  playtime: {},
  gameSession: null,
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
  if (state.settings.discordRpc !== false && api.setDiscordSection) {
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
  if (page === 'modpacks' && !state.searchCache.modpack) performModpackSearch();
  if (page === 'library') refreshLibrary();
  if (page === 'profiles') { renderAccounts(); renderServers(); }
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

/* ===================== Theme ===================== */
function applyTheme(theme, custom) {
  const known = new Set(['glass', 'flat-dark', 'flat-light', 'midnight', 'sunset', 'custom']);
  const t = known.has(theme) ? theme : 'glass';

  // Сначала всегда полностью чистим инлайн-стили — иначе предыдущая тема (особенно custom)
  // оставит свои переменные и они смешаются с новой.
  resetCustomInlineTheme();

  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);

  const editor = $('#customThemeEditor');
  if (editor) editor.hidden = t !== 'custom';

  $$('.theme-card').forEach((c) => c.classList.toggle('active', c.dataset.themePick === t));

  if (t === 'custom' && custom) {
    applyCustomTheme(custom);
  }
}

function resetCustomInlineTheme() {
  const root = document.documentElement.style;
  ['--accent', '--accent-hover', '--text', '--text-dim', '--text-mute',
   '--shell-bg', '--bg-extra', '--fill', '--fill-hover', '--fill-active',
   '--stroke', '--stroke-soft'
  ].forEach((p) => root.removeProperty(p));
  document.body.style.background = '';
}

function applyCustomTheme(c) {
  const root = document.documentElement.style;
  root.setProperty('--accent', c.accent);
  root.setProperty('--accent-hover', lightenHex(c.accent, 0.15));
  root.setProperty('--text', c.text);

  // text-dim / text-mute вычисляем от text — это полупрозрачные варианты
  const textRgb = hexToRgb(c.text);
  root.setProperty('--text-dim', `rgba(${textRgb.r},${textRgb.g},${textRgb.b},0.62)`);
  root.setProperty('--text-mute', `rgba(${textRgb.r},${textRgb.g},${textRgb.b},0.40)`);

  // Stroke и fill подбираем от противоположности текста (если текст светлый — белые, если тёмный — чёрные)
  const isDarkText = (textRgb.r + textRgb.g + textRgb.b) / 3 < 128;
  const overlay = isDarkText ? '0,0,0' : '255,255,255';
  root.setProperty('--stroke', `rgba(${overlay},0.16)`);
  root.setProperty('--stroke-soft', `rgba(${overlay},0.08)`);
  root.setProperty('--fill', `rgba(${overlay},0.05)`);
  root.setProperty('--fill-hover', `rgba(${overlay},0.10)`);
  root.setProperty('--fill-active', `rgba(${overlay},0.16)`);

  // Bg с альфой
  const alpha = (c.bgAlpha ?? 100) / 100;
  const rgba = hexToRgba(c.bg, alpha);
  root.setProperty('--shell-bg', rgba);

  if (alpha < 1) {
    root.setProperty('--bg-extra', 'transparent');
    document.body.style.background = '';
  } else {
    root.setProperty('--bg-extra', c.bg);
    document.body.style.background = c.bg;
  }
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lightenHex(hex, amount) {
  let { r, g, b } = hexToRgb(hex);
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function bindThemePicker() {
  $$('.theme-card').forEach((card) => {
    card.addEventListener('click', () => {
      const theme = card.dataset.themePick;
      state.theme = theme;
      applyTheme(theme, state.customTheme);
      saveThemeChoice();
    });
  });

  // Кастомный редактор
  const accent = $('#customAccent');
  const bg = $('#customBg');
  const txt = $('#customText');
  const alpha = $('#customBgAlpha');
  if (accent && bg && txt && alpha) {
    [accent, bg, txt, alpha].forEach((el) => {
      el.addEventListener('input', () => {
        state.customTheme = {
          accent: accent.value,
          bg: bg.value,
          text: txt.value,
          bgAlpha: parseInt(alpha.value, 10),
        };
        if (state.theme === 'custom') applyCustomTheme(state.customTheme);
        saveThemeChoice();
      });
    });
  }
}

async function saveThemeChoice() {
  state.settings = { ...state.settings, theme: state.theme, customTheme: state.customTheme };
  await api.saveSettings(state.settings);
}

function loadThemeFromSettings() {
  const t = state.settings?.theme || 'glass';
  const c = state.settings?.customTheme || state.customTheme;
  state.theme = t;
  state.customTheme = c;
  // Заполняем editor значениями
  if ($('#customAccent')) $('#customAccent').value = c.accent || '#0a84ff';
  if ($('#customBg')) $('#customBg').value = c.bg || '#15151b';
  if ($('#customText')) $('#customText').value = c.text || '#ffffff';
  if ($('#customBgAlpha')) $('#customBgAlpha').value = c.bgAlpha ?? 100;
  applyTheme(t, c);
}


async function init() {
  state.profile = await api.getProfile();
  state.settings = await api.getSettings();
  state.appVersion = await api.getAppVersion();
  $('#userName').textContent = state.profile.username || 'Steve';

  // Применяем язык
  state.lang = state.settings.lang || 'ru';
  if (window.i18n) {
    window.i18n.setLang(state.lang);
    window.i18n.applyI18n();
  }

  bindThemePicker();
  loadThemeFromSettings();

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

  await Promise.all([loadAccounts(), loadServers(), loadPlaytime()]);

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

  api.onMcClose(async () => {
    $('#launchProgress').hidden = true;
    $('#launchFill').style.width = '0%';
    state.gameRunning = false;
    updatePlayButton();
    toast('Игра закрыта');

    const session = state.gameSession;
    state.gameSession = null;
    if (session) {
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      if (elapsed > 5) {
        try {
          state.playtime = await api.addPlaytime({ version: session.version, seconds: elapsed });
        } catch (err) {
          console.error('addPlaytime', err);
        }
        renderPlaytime();
      }
    }
  });

  // Tray "Запустить игру" — кликаем кнопку Play
  if (api.onTrayLaunch) {
    api.onTrayLaunch(() => {
      showPage('play');
      $('#playBtn').click();
    });
  }

  // Update banner
  if (api.onUpdateAvailable) {
    api.onUpdateAvailable((info) => {
      showUpdateBanner(info);
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
      html += `<option value="custom:${escapeHtml(cv.folderName)}">${escapeHtml(cv.id)}</option>`;
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
  renderPlaytime();
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

  const launchVersion = state.selectedVersion;
  let res;
  try {
    res = await api.launch({
      version: launchVersion,
      profile: state.profile,
      settings: state.settings,
      loader: state.loader,
      loaderVersion: state.loaderVersion,
      isCustom: state.selectedIsCustom,
    });
  } catch (err) {
    console.error('launch', err);
    toast(`Ошибка запуска: ${err.message || err}`, 5000);
    $('#launchProgress').hidden = true;
    $('#playBtn').disabled = false;
    return;
  }

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
    state.gameSession = { version: launchVersion, startedAt: Date.now() };
    updatePlayButton();
    setTimeout(() => { $('#launchProgress').hidden = true; }, 2000);
  }
});

/* ===================== Modrinth Search ===================== */
$$('[data-search]').forEach((input) => {
  const type = input.dataset.search;
  input.addEventListener('input', () => {
    clearTimeout(state.searchTimers[type]);
    state.searchTimers[type] = setTimeout(() => {
      if (type === 'modpack') performModpackSearch();
      else performSearch(type);
    }, 350);
  });
});

$$('[data-version-filter]').forEach((sel) => {
  sel.addEventListener('change', () => {
    const type = sel.dataset.versionFilter;
    if (type === 'modpack') performModpackSearch();
    else performSearch(type);
  });
});

$$('[data-loader-filter]').forEach((sel) => {
  sel.addEventListener('change', () => {
    const type = sel.dataset.loaderFilter;
    if (type === 'modpack') performModpackSearch();
    else performSearch(type);
  });
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

  if (type === 'resourcepack') {
    grid.querySelectorAll('.item-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.install-btn')) return;
        const slug = card.dataset.slug;
        const project = items.find((i) => i.slug === slug);
        if (project) openResourcePackPreview(project);
      });
      card.style.cursor = 'pointer';
    });
  }
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
    // Если версия одна — ставим без диалога
    if (versions.length === 1) {
      await doInstall(project, versions[0]);
      return;
    }
    // Иначе показываем выбор
    openVersionPicker(project, versions);
  } catch (err) {
    console.error(err);
    toast(`Ошибка установки: ${err.message}`);
  }
}

async function doInstall(project, version) {
  try {
    // Сначала проверим зависимости
    const requiredDeps = (version.dependencies || []).filter((d) => d.dependency_type === 'required');
    const optionalDeps = (version.dependencies || []).filter((d) => d.dependency_type === 'optional');

    // Резолвим info по project_id для всех required+optional
    const allDeps = [...requiredDeps, ...optionalDeps];
    if (allDeps.length) {
      const resolved = await resolveDependencies(allDeps, version);
      // Фильтруем те, что уже установлены
      const notInstalled = resolved.filter((d) => !state.installed[d.project?.slug]);
      if (notInstalled.length) {
        // Показываем диалог выбора зависимостей
        await openDependencyDialog(project, version, notInstalled);
        return;
      }
    }

    await performInstall(project, version);
  } catch (err) {
    console.error(err);
    toast(`Ошибка установки: ${err.message}`);
  }
}

async function performInstall(project, version, depsToInstall = []) {
  const isReinstall = !!state.installed[project.slug];
  toast(`${isReinstall ? 'Переустановка' : 'Загрузка'} ${project.title}…`);
  const res = await api.install({ project, version, gameDir: state.settings.gameDir });
  if (!res?.ok) {
    toast(`Ошибка: ${res?.error || 'не удалось установить'}`);
    return;
  }

  // Ставим зависимости одну за другой
  for (const dep of depsToInstall) {
    if (!dep.project || !dep.version) continue;
    toast(`Загрузка зависимости: ${dep.project.title}…`);
    try {
      await api.install({ project: dep.project, version: dep.version, gameDir: state.settings.gameDir });
    } catch (e) {
      console.error('dep install', dep.project.slug, e);
      toast(`Не удалось поставить ${dep.project.title}`);
    }
  }

  await refreshInstalled();
  applyInstalledStateToCard(project.slug);
  for (const dep of depsToInstall) {
    if (dep.project) applyInstalledStateToCard(dep.project.slug);
  }

  const card = document.querySelector(`[data-slug="${CSS.escape(project.slug)}"]`);
  card?.classList.add('just-installed');
  setTimeout(() => card?.classList.remove('just-installed'), 1200);

  const total = 1 + depsToInstall.length;
  toast(`${project.title} установлен${total > 1 ? ` (+${total - 1} зависимость)` : ''}`);
}

async function resolveDependencies(deps, parentVersion) {
  // Нужно узнать project info и подходящую версию для каждого dep
  const out = [];
  const gameVersion = (parentVersion.game_versions || [])[0];
  const loader = (parentVersion.loaders || [])[0];

  for (const dep of deps) {
    try {
      let project = null;
      let depVersion = null;

      if (dep.project_id) {
        project = await api.getProject(dep.project_id);
      }

      if (dep.version_id) {
        // Известна конкретная версия — берём её versions, фильтруем
        const versions = await api.getProjectVersions({
          slug: dep.project_id,
          gameVersion: '',
          loader: '',
        });
        depVersion = versions?.find((v) => v.id === dep.version_id);
      } else if (project) {
        // Подбираем по той же MC-версии и loader
        const versions = await api.getProjectVersions({
          slug: project.slug,
          gameVersion,
          loader,
        });
        depVersion = (versions || [])[0];
      }

      if (project) {
        out.push({
          dep,
          project,
          version: depVersion,
          required: dep.dependency_type === 'required',
        });
      }
    } catch (e) {
      console.error('resolveDep', dep, e);
    }
  }
  return out;
}

function openDependencyDialog(parentProject, parentVersion, deps) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-deps">
        <div class="modal-head">
          <div>
            <div class="modal-title">Зависимости</div>
            <div class="modal-sub-line">${escapeHtml(parentProject.title)} требует ещё ${deps.length} мод${deps.length === 1 ? '' : 'а'}</div>
          </div>
          <button class="modal-close" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="dep-list">
          ${deps.map((d) => depRowHTML(d)).join('')}
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost btn-small modal-cancel">Только основной</button>
          <button class="btn btn-primary btn-small modal-confirm">Установить выбранные</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    function close(result) {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 220);
    }

    overlay.querySelector('.modal-close').addEventListener('click', () => close(null));
    overlay.querySelector('.modal-cancel').addEventListener('click', async () => {
      close('main-only');
      await performInstall(parentProject, parentVersion, []);
    });
    overlay.querySelector('.modal-confirm').addEventListener('click', async () => {
      const checked = Array.from(overlay.querySelectorAll('.dep-check:checked'));
      const selectedSlugs = checked.map((c) => c.value);
      const selectedDeps = deps.filter((d) => selectedSlugs.includes(d.project.slug) && d.version);
      close('with-deps');
      await performInstall(parentProject, parentVersion, selectedDeps);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

function depRowHTML(d) {
  const cover = d.project.icon_url
    ? `style="background-image:url('${escapeHtml(d.project.icon_url)}');"`
    : '';
  const versionText = d.version?.version_number || (d.version?.game_versions?.[0] ? `MC ${d.version.game_versions[0]}` : '');
  const noVersion = !d.version;
  const required = d.required;

  return `
    <label class="dep-row${noVersion ? ' dep-disabled' : ''}">
      <input type="checkbox" class="dep-check" value="${escapeHtml(d.project.slug)}"
             ${required && !noVersion ? 'checked' : ''}
             ${noVersion ? 'disabled' : ''}>
      <div class="dep-cover" ${cover}></div>
      <div class="dep-info">
        <div class="dep-title">${escapeHtml(d.project.title)}</div>
        <div class="dep-meta">
          ${required ? '<span class="dep-tag dep-tag-required">обязательно</span>' : '<span class="dep-tag dep-tag-optional">опционально</span>'}
          ${versionText ? `<span>${escapeHtml(versionText)}</span>` : ''}
          ${noVersion ? '<span class="dep-tag dep-tag-warn">нет совместимой</span>' : ''}
        </div>
      </div>
    </label>
  `;
}

function openVersionPicker(project, versions) {
  const installedVersionId = state.installed[project.slug]?.versionId;

  // Сортируем: release > beta > alpha; внутри — по date_published desc
  const typeOrder = { release: 0, beta: 1, alpha: 2 };
  const sorted = [...versions].sort((a, b) => {
    const ta = typeOrder[a.version_type] ?? 3;
    const tb = typeOrder[b.version_type] ?? 3;
    if (ta !== tb) return ta - tb;
    return new Date(b.date_published || 0) - new Date(a.date_published || 0);
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-versions">
      <div class="modal-head">
        <div>
          <div class="modal-title">${escapeHtml(project.title)}</div>
          <div class="modal-sub-line">Выбери версию для установки</div>
        </div>
        <button class="modal-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="version-filter-row">
        <input type="text" class="input v-search" placeholder="Поиск по версии или MC…">
        <select class="input v-loader-filter">
          <option value="">Все загрузчики</option>
          <option value="fabric">Fabric</option>
          <option value="forge">Forge</option>
          <option value="quilt">Quilt</option>
          <option value="neoforge">NeoForge</option>
        </select>
      </div>

      <div class="version-list">
        ${sorted.map((v) => versionRowHTML(v, installedVersionId)).join('')}
      </div>

      <div class="modal-actions">
        <span class="version-hint">${sorted.length} версий доступно</span>
        <button class="btn btn-ghost btn-small modal-cancel">Закрыть</button>
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

  // Фильтрация
  const search = overlay.querySelector('.v-search');
  const loaderFilter = overlay.querySelector('.v-loader-filter');
  function applyFilter() {
    const q = search.value.toLowerCase().trim();
    const ldr = loaderFilter.value;
    overlay.querySelectorAll('.v-row').forEach((row) => {
      const text = row.dataset.search;
      const loaders = (row.dataset.loaders || '').split(',');
      const matchQ = !q || text.includes(q);
      const matchL = !ldr || loaders.includes(ldr);
      row.style.display = matchQ && matchL ? '' : 'none';
    });
  }
  search.addEventListener('input', applyFilter);
  loaderFilter.addEventListener('change', applyFilter);

  // Клик по строке = установка
  overlay.querySelectorAll('.v-row').forEach((row) => {
    const btn = row.querySelector('.v-install');
    btn.addEventListener('click', async () => {
      const versionId = row.dataset.versionId;
      const v = sorted.find((x) => x.id === versionId);
      if (!v) return;
      close();
      await doInstall(project, v);
    });
  });
}

function versionRowHTML(v, installedVersionId) {
  const versionTypes = {
    release: { label: 'Release', cls: 'vt-release' },
    beta: { label: 'Beta', cls: 'vt-beta' },
    alpha: { label: 'Alpha', cls: 'vt-alpha' },
  };
  const vt = versionTypes[v.version_type] || { label: v.version_type || 'Unknown', cls: '' };
  const date = v.date_published ? new Date(v.date_published).toLocaleDateString('ru-RU', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const downloads = v.downloads ? formatDownloads(v.downloads) : '';
  const gameVersions = (v.game_versions || []).slice(0, 3).join(', ') + (v.game_versions?.length > 3 ? '…' : '');
  const loaders = (v.loaders || []).join(', ');
  const isInstalled = installedVersionId === v.id;
  const searchText = `${v.version_number || ''} ${v.name || ''} ${(v.game_versions || []).join(' ')}`.toLowerCase();

  return `
    <div class="v-row${isInstalled ? ' v-installed' : ''}"
         data-version-id="${escapeHtml(v.id)}"
         data-loaders="${escapeHtml((v.loaders || []).join(','))}"
         data-search="${escapeHtml(searchText)}">
      <div class="v-info">
        <div class="v-line">
          <span class="v-num">${escapeHtml(v.version_number || v.name || '?')}</span>
          <span class="v-type ${vt.cls}">${vt.label}</span>
          ${isInstalled ? '<span class="v-current">текущая</span>' : ''}
        </div>
        <div class="v-meta">
          ${gameVersions ? `<span>MC ${escapeHtml(gameVersions)}</span>` : ''}
          ${loaders ? `<span>${escapeHtml(loaders)}</span>` : ''}
          ${date ? `<span>${escapeHtml(date)}</span>` : ''}
          ${downloads ? `<span>↓ ${downloads}</span>` : ''}
        </div>
      </div>
      <button class="btn ${isInstalled ? 'btn-ghost' : 'btn-primary'} btn-small v-install">
        ${isInstalled ? 'Переустановить' : 'Установить'}
      </button>
    </div>
  `;
}

function formatDownloads(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ===================== Modpacks ===================== */
async function performModpackSearch() {
  const grid = document.querySelector('[data-grid="modpack"]');
  if (!grid) return;
  const query = document.querySelector('[data-search="modpack"]')?.value || '';
  const gameVersion = document.querySelector('[data-version-filter="modpack"]')?.value || '';
  const loader = document.querySelector('[data-loader-filter="modpack"]')?.value || '';

  grid.innerHTML = '<div class="empty">Поиск…</div>';
  state.searchCache.modpack = true;

  try {
    const data = await api.searchModpacks({ query, gameVersion, loader, limit: 24 });
    const items = data.hits || [];
    if (!items.length) {
      grid.innerHTML = '<div class="empty">Ничего не найдено</div>';
      return;
    }
    grid.innerHTML = items.map((p) => modpackCardHTML(p)).join('');
    grid.querySelectorAll('.install-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slug = btn.dataset.slug;
        const project = items.find((i) => i.slug === slug);
        if (project) await installModpack(project);
      });
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty">Не удалось загрузить</div>';
  }
}

function modpackCardHTML(p) {
  const cover = p.icon_url ? `style="background-image:url('${escapeHtml(p.icon_url)}');"` : '';
  const downloads = p.downloads ? formatDownloads(p.downloads) + ' загрузок' : '';
  return `
    <article class="item-card" data-slug="${escapeHtml(p.slug)}">
      <div class="item-cover" ${cover}></div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(p.title)}</div>
        <div class="item-desc">${escapeHtml(p.description || '')}</div>
        <div class="item-meta">${escapeHtml(downloads)}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-primary install-btn" data-slug="${escapeHtml(p.slug)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Установить
        </button>
      </div>
    </article>
  `;
}

async function installModpack(project) {
  try {
    const gameVersion = document.querySelector('[data-version-filter="modpack"]')?.value || '';
    const loader = document.querySelector('[data-loader-filter="modpack"]')?.value || '';

    const versions = await api.getProjectVersions({
      slug: project.slug,
      gameVersion,
      loader,
    });
    if (!versions || !versions.length) {
      toast('Нет совместимой версии. Сними фильтры');
      return;
    }
    if (versions.length === 1) {
      await doInstallModpack(project, versions[0]);
    } else {
      openModpackVersionPicker(project, versions);
    }
  } catch (e) {
    console.error(e);
    toast('Ошибка установки модпака');
  }
}

async function doInstallModpack(project, v) {
  toast(`Установка ${project.title}…`);
  const card = document.querySelector(`[data-slug="${CSS.escape(project.slug)}"]`);
  let bar = card?.querySelector('.item-progress-fill');
  if (card && !bar) {
    const wrap = document.createElement('div');
    wrap.className = 'item-progress';
    wrap.innerHTML = '<div class="item-progress-fill"></div>';
    card.appendChild(wrap);
    bar = wrap.querySelector('.item-progress-fill');
  }
  const res = await api.installModpack({ project, version: v, gameDir: state.settings.gameDir });
  if (res?.ok) {
    toast(`Модпак "${res.name}" установлен · ${res.fileCount} модов`);
    await refreshInstalled();
    applyInstalledStateToCard(project.slug);
    setTimeout(() => bar?.parentElement?.remove(), 800);
  } else {
    toast(`Ошибка: ${res?.error || 'неизвестно'}`);
  }
}

function openModpackVersionPicker(project, versions) {
  // Сортировка: release > beta > alpha; затем по дате
  const typeOrder = { release: 0, beta: 1, alpha: 2 };
  const sorted = [...versions].sort((a, b) => {
    const ta = typeOrder[a.version_type] ?? 3;
    const tb = typeOrder[b.version_type] ?? 3;
    if (ta !== tb) return ta - tb;
    return new Date(b.date_published || 0) - new Date(a.date_published || 0);
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const installedMeta = state.modpacks[project.slug];
  const installedVersionId = installedMeta?.versionId || null;

  overlay.innerHTML = `
    <div class="modal modal-versions">
      <div class="modal-head">
        <div>
          <div class="modal-title">${escapeHtml(project.title)}</div>
          <div class="modal-sub-line">Выбери версию модпака</div>
        </div>
        <button class="modal-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="version-filter-row">
        <input type="text" class="input v-search" placeholder="Поиск по версии или MC…">
        <select class="input v-loader-filter">
          <option value="">Все загрузчики</option>
          <option value="fabric">Fabric</option>
          <option value="forge">Forge</option>
          <option value="quilt">Quilt</option>
          <option value="neoforge">NeoForge</option>
        </select>
      </div>
      <div class="version-list">
        ${sorted.map((v) => versionRowHTML(v, installedVersionId)).join('')}
      </div>
      <div class="modal-actions">
        <span class="version-hint">${sorted.length} версий</span>
        <button class="btn btn-ghost btn-small modal-cancel">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const search = overlay.querySelector('.v-search');
  const loaderFilter = overlay.querySelector('.v-loader-filter');
  const hint = overlay.querySelector('.version-hint');
  function applyFilter() {
    const q = search.value.toLowerCase().trim();
    const ldr = loaderFilter.value;
    let visible = 0;
    overlay.querySelectorAll('.v-row').forEach((row) => {
      const text = row.dataset.search;
      const loaders = (row.dataset.loaders || '').split(',');
      const matchQ = !q || text.includes(q);
      const matchL = !ldr || loaders.includes(ldr);
      const show = matchQ && matchL;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    hint.textContent = `${visible} версий`;
  }
  search.addEventListener('input', applyFilter);
  loaderFilter.addEventListener('change', applyFilter);

  overlay.querySelectorAll('.v-row').forEach((row) => {
    row.querySelector('.v-install').addEventListener('click', async () => {
      const id = row.dataset.versionId;
      const v = sorted.find((x) => x.id === id);
      if (!v) return;
      close();
      await doInstallModpack(project, v);
    });
  });
}

if (api.onModpackProgress) {
  api.onModpackProgress(({ slug, phase, progress }) => {
    const card = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (!card) return;
    const bar = card.querySelector('.item-progress-fill');
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  });
}

$('#importMrpackBtn')?.addEventListener('click', async () => {
  const r = await api.importModpackLocal({ gameDir: state.settings.gameDir });
  if (r?.canceled) return;
  if (r?.ok) {
    toast(`Модпак "${r.name}" импортирован · ${r.fileCount} модов`);
  } else {
    toast(`Ошибка: ${r?.error || 'не удалось'}`);
  }
});

/* ===================== Profiles sub-tabs ===================== */
$$('[data-profile-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.profileTab;
    $$('[data-profile-tab]').forEach((t) => t.classList.toggle('active', t === tab));
    $('#profileTabAccounts').hidden = target !== 'accounts';
    $('#profileTabServers').hidden = target !== 'servers';
  });
});

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

$('#deleteAllBtn')?.addEventListener('click', async () => {
  const items = await api.listContent({ gameDir: state.settings.gameDir, type: state.libraryTab });
  if (!items.length) { toast('Нечего удалять'); return; }

  const typeNames = { mod: 'модов', resourcepack: 'ресурс-паков', shader: 'шейдеров' };
  const typeName = typeNames[state.libraryTab] || 'файлов';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-confirm">
      <div class="modal-head">
        <div class="modal-title">Удалить всё?</div>
        <button class="modal-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p>Будет удалено <strong>${items.length} ${typeName}</strong>. Это действие нельзя отменить.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-small modal-cancel">Отмена</button>
        <button class="btn btn-danger btn-small modal-confirm-delete">Удалить всё</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.modal-confirm-delete').addEventListener('click', async () => {
    close();
    const res = await api.deleteAllContent({ gameDir: state.settings.gameDir, type: state.libraryTab });
    if (res?.ok) {
      await refreshInstalled();
      document.querySelectorAll('.item-card[data-slug]').forEach((c) => {
        const slug = c.dataset.slug;
        if (slug) applyInstalledStateToCard(slug);
      });
      toast(`Удалено ${res.deleted || 0} ${typeName}`);
      refreshLibrary();
    } else {
      toast('Ошибка удаления');
    }
  });
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
  $('#settingsMemoryAuto').checked = state.settings.memoryAuto !== false;
  updateMemoryInputs();
  $('#settingsGameDir').value = state.settings.gameDir || '';
  $('#settingsLang').value = state.settings.lang || 'ru';
  $('#settingsWindowMode').value = state.settings.windowMode || 'windowed';
  $('#settingsWindowSize').value = `${state.settings.windowWidth || 854}x${state.settings.windowHeight || 480}`;
  $('#settingsJvmArgs').value = state.settings.jvmArgs || '';
  $('#settingsDebugConsole').checked = !!state.settings.debugConsole;
  $('#settingsAutoCleanLogs').checked = state.settings.autoCleanLogs !== false;
  $('#settingsNotifications').checked = state.settings.notifications !== false;
  $('#settingsDiscordRpc').checked = state.settings.discordRpc !== false;
  $('#settingsAutoUpdate').checked = state.settings.autoUpdate !== false;
  $('#aboutVersion').textContent = `Версия ${state.appVersion}`;
  refreshJavaList();
  loadCustomVersions().then(renderCustomVersionsList);
}

function updateMemoryInputs() {
  const automatic = $('#settingsMemoryAuto')?.checked;
  $('#settingsMemMin').disabled = automatic;
  $('#settingsMemMax').disabled = automatic;
}

$('#settingsMemoryAuto').addEventListener('change', updateMemoryInputs);

$('#browseJava').addEventListener('click', async () => {
  const file = await api.browseJava();
  if (file) $('#settingsJava').value = file;
});

$('#saveSettings').addEventListener('click', async () => {
  const username = ($('#settingsUsername').value || 'Steve').trim().slice(0, 16) || 'Steve';
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    toast('Ник: 3-16 латинских букв, цифр или _');
    return;
  }
  state.profile = { ...state.profile, username };

  // Парсим размер окна
  const sizeMatch = ($('#settingsWindowSize').value || '854x480').match(/(\d+)\s*x\s*(\d+)/);
  const winW = sizeMatch ? parseInt(sizeMatch[1], 10) : 854;
  const winH = sizeMatch ? parseInt(sizeMatch[2], 10) : 480;

  state.settings = {
    ...state.settings,
    memory: {
      min: $('#settingsMemMin').value || '1G',
      max: $('#settingsMemMax').value || '4G',
    },
    memoryAuto: $('#settingsMemoryAuto').checked,
    javaPath: $('#settingsJava').value || '',
    gameDir: $('#settingsGameDir').value || state.settings.gameDir,
    lang: $('#settingsLang').value || 'ru',
    windowMode: $('#settingsWindowMode').value || 'windowed',
    windowWidth: winW,
    windowHeight: winH,
    jvmArgs: $('#settingsJvmArgs').value || '',
    debugConsole: $('#settingsDebugConsole').checked,
    autoCleanLogs: $('#settingsAutoCleanLogs').checked,
    notifications: $('#settingsNotifications').checked,
    discordRpc: $('#settingsDiscordRpc').checked,
    autoUpdate: $('#settingsAutoUpdate').checked,
  };
  try {
    state.profile = await api.saveProfile(state.profile);
    state.settings = await api.saveSettings(state.settings);
  } catch (err) {
    toast(`Не удалось сохранить: ${err.message || err}`);
    return;
  }
  $('#userName').textContent = state.profile.username;

  // Применить язык
  if (state.lang !== state.settings.lang) {
    state.lang = state.settings.lang;
    window.i18n.setLang(state.lang);
    window.i18n.applyI18n();
  }

  // Применить настройку уведомлений
  if (api.setNotifications) api.setNotifications(state.settings.notifications);

  const hint = $('#settingsHint');
  hint.textContent = window.i18n ? window.i18n.t('settings.saved') : '✓ Сохранено';
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 1800);
  updateJavaStatus();
});

/* About / Update buttons */
$('#aboutRepo')?.addEventListener('click', (e) => {
  e.preventDefault();
  api.openExternal('https://github.com/hell0zz12/GlassCraft-Launcher');
});
$('#aboutReport')?.addEventListener('click', (e) => {
  e.preventDefault();
  api.openExternal('https://github.com/hell0zz12/GlassCraft-Launcher/issues');
});
$('#checkUpdateBtn')?.addEventListener('click', async () => {
  toast('Проверяю обновление…');
  const r = await api.checkUpdates();
  if (!r) return;
  if (r.available) {
    toast(`Доступна версия ${r.latest}`);
    showUpdateBanner(r);
  } else {
    toast('Лаунчер обновлён до последней версии');
  }
});

function showUpdateBanner(info) {
  const banner = $('#updateBanner');
  const sub = $('#updateSub');
  if (!banner || !sub) return;
  sub.textContent = `${info.current} → ${info.latest}`;
  banner.hidden = false;
  $('#updateOpenBtn').onclick = () => api.openExternal(info.url);
  $('#updateDismiss').onclick = () => { banner.hidden = true; };
}

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

/* ===================== Accounts ===================== */
const ADJECTIVES = [
  'Dark','Bright','Wild','Quiet','Swift','Red','Blue','Green','Steel','Icy',
  'Fiery','Night','Star','Ancient','Mighty','Silver','Golden','Brave','Crystal',
];
const NOUNS = [
  'Wolf','Eagle','Tiger','Lion','Knight','Mage','Guard','Falcon','Blade','Shield',
  'Archer','Scout','Ranger','Viking','Ninja','Pilot','Miner','Builder','Phoenix',
];

function generateRandomNick() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
}

async function loadAccounts() {
  try {
    state.accounts = await api.listAccounts() || [];
  } catch {
    state.accounts = [];
  }
}

function renderAccounts() {
  const list = $('#accountsList');
  if (!list) return;

  const activeUsername = state.profile.username || '';
  const sorted = [...state.accounts].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  if (!sorted.length) {
    list.innerHTML = '<div class="empty">Нет аккаунтов. Создай свой первый никнейм выше</div>';
    return;
  }

  list.innerHTML = sorted.map((a) => {
    const letter = (a.username || '?')[0].toUpperCase();
    const isActive = a.username === activeUsername;
    return `
      <div class="acct-row" data-id="${escapeHtml(a.id)}">
        <div class="acct-avatar">${escapeHtml(letter)}</div>
        <div class="acct-name">
          ${escapeHtml(a.username)}
          ${isActive ? '<span class="acct-active-badge">Активный</span>' : ''}
        </div>
        <div class="acct-actions">
          <button class="acct-btn set-active-btn" title="Играть от этого ника">
            <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/></svg>
          </button>
          <button class="acct-btn fav-btn ${a.favorite ? 'fav-active' : ''}" title="Избранное">
            <svg class="star-svg" viewBox="0 0 24 24" ${a.favorite ? '' : 'fill="none" stroke="currentColor" stroke-width="1.6"'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="acct-btn delete delete-btn" title="Удалить">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.set-active-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.acct-row')?.dataset.id;
      const acc = state.accounts.find((a) => a.id === id);
      if (!acc) return;
      state.profile.username = acc.username;
      await api.setActiveAccount({ id });
      await api.saveProfile(state.profile);
      $('#userName').textContent = acc.username;
      toast(`Активный аккаунт: ${acc.username}`);
      renderAccounts();
    });
  });

  list.querySelectorAll('.fav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.acct-row')?.dataset.id;
      state.accounts = await api.toggleFavoriteAccount({ id });
      renderAccounts();
    });
  });

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.acct-row')?.dataset.id;
      const acc = state.accounts.find((a) => a.id === id);
      if (!acc) return;
      state.accounts = await api.deleteAccount({ id });
      if (acc.username === state.profile.username) {
        const first = state.accounts[0];
        if (first) {
          state.profile.username = first.username;
          await api.setActiveAccount({ id: first.id });
          await api.saveProfile(state.profile);
          $('#userName').textContent = first.username;
        } else {
          state.profile.username = 'Steve';
          await api.saveProfile(state.profile);
          $('#userName').textContent = 'Steve';
        }
      }
      toast('Аккаунт удалён');
      renderAccounts();
    });
  });
}

$('#createAccountBtn')?.addEventListener('click', async () => {
  const input = $('#newAccountName');
  const name = (input.value || '').trim().slice(0, 16);
  if (!name) { toast('Введи никнейм'); return; }
  if (state.accounts.some((a) => a.username === name)) { toast('Такой ник уже есть'); return; }
  const acc = await api.createAccount({ username: name });
  state.accounts.push(acc);
  input.value = '';
  toast(`Аккаунт "${name}" создан`);
  renderAccounts();
});

$('#newAccountName')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#createAccountBtn')?.click();
});

$('#randomAccountBtn')?.addEventListener('click', () => {
  const input = $('#newAccountName');
  if (input) {
    let nick;
    do { nick = generateRandomNick(); } while (state.accounts.some((a) => a.username === nick));
    input.value = nick;
  }
});

/* ===================== Play Time ===================== */
async function loadPlaytime() {
  try {
    state.playtime = await api.getPlaytime() || {};
  } catch {
    state.playtime = {};
  }
  renderPlaytime();
}

function formatPlaytime(sec) {
  if (sec < 60) return `${sec}с`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function renderPlaytime() {
  const el = $('#playtimeText');
  if (!el) return;
  const total = Object.values(state.playtime).reduce((s, v) => s + v, 0);
  const ver = state.playtime[state.selectedVersion] || 0;
  if (total === 0) {
    el.textContent = 'Время игры: —';
  } else if (ver > 0) {
    el.textContent = `Время игры: ${formatPlaytime(ver)} (всего ${formatPlaytime(total)})`;
  } else {
    el.textContent = `Время игры: ${formatPlaytime(total)}`;
  }
}

/* ===================== Servers ===================== */
async function loadServers() {
  try {
    state.servers = await api.listServers() || [];
  } catch {
    state.servers = [];
  }
}

function renderServers() {
  const list = $('#serversList');
  if (!list) return;

  if (!state.servers.length) {
    list.innerHTML = '<div class="empty">Нет серверов. Добавь свой первый сервер выше</div>';
    return;
  }

  list.innerHTML = state.servers.map((s) => `
    <div class="srv-row" data-id="${escapeHtml(s.id)}">
      <div class="srv-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
      </div>
      <div class="srv-info">
        <div class="srv-name">${escapeHtml(s.name)}</div>
        <div class="srv-addr">${escapeHtml(s.address)}</div>
      </div>
      <div class="srv-actions">
        <button class="acct-btn srv-copy" title="Копировать адрес">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="acct-btn delete srv-delete" title="Удалить">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.srv-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.srv-row')?.dataset.id;
      const srv = state.servers.find((s) => s.id === id);
      if (srv) {
        navigator.clipboard.writeText(srv.address);
        toast('Адрес скопирован');
      }
    });
  });

  list.querySelectorAll('.srv-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.srv-row')?.dataset.id;
      state.servers = state.servers.filter((s) => s.id !== id);
      await api.saveServers(state.servers);
      toast('Сервер удалён');
      renderServers();
    });
  });
}

$('#addServerBtn')?.addEventListener('click', async () => {
  const name = ($('#newServerName')?.value || '').trim();
  const address = ($('#newServerAddress')?.value || '').trim();
  if (!name || !address) { toast('Заполни название и адрес'); return; }
  state.servers.push({ id: crypto.randomUUID(), name, address });
  await api.saveServers(state.servers);
  $('#newServerName').value = '';
  $('#newServerAddress').value = '';
  toast(`Сервер "${name}" добавлен`);
  renderServers();
});

$('#newServerAddress')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#addServerBtn')?.click();
});

/* ===================== Resource Pack Preview ===================== */
function openResourcePackPreview(project) {
  const images = project.gallery || project.icon_url ? [project.icon_url, ...(project.gallery || [])].filter(Boolean) : [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-preview">
      <div class="modal-head">
        <div>
          <div class="modal-title">${escapeHtml(project.title || project.name)}</div>
          <div class="modal-sub-line">${escapeHtml(project.description || '')}</div>
        </div>
        <button class="modal-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="preview-gallery">
        ${images.length
          ? images.map((url) => `<img class="preview-img" src="${escapeHtml(url)}" loading="lazy" alt="">`).join('')
          : '<div class="empty">Нет превью</div>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-small modal-cancel">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('.modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

/* ===================== Boot ===================== */
init().catch((err) => {
  console.error('init', err);
  toast(`Ошибка инициализации: ${err.message || err}`, 5000);
});
