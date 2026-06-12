const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { Client, Authenticator } = require('minecraft-launcher-core');
const fetch = require('node-fetch');
const discord = require('./discord');
const notifications = require('./notifications');

const launcher = new Client();

const APP_DIR = path.join(os.homedir(), '.glasscraft');
const MC_DIR = path.join(APP_DIR, 'minecraft');
const JAVA_DIR = path.join(APP_DIR, 'java');
const PROFILE_FILE = path.join(APP_DIR, 'profile.json');
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');
const INSTALLED_FILE = path.join(APP_DIR, 'installed.json');
const MODPACKS_FILE = path.join(APP_DIR, 'modpacks.json');
const ACCOUNTS_FILE = path.join(APP_DIR, 'accounts.json');
const PLAYTIME_FILE = path.join(APP_DIR, 'playtime.json');
const SERVERS_FILE = path.join(APP_DIR, 'servers.json');
const LOG_FILE = path.join(APP_DIR, 'launcher.log');

for (const d of [APP_DIR, MC_DIR, JAVA_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

let mainWindow;
let tray = null;
let runningProc = null;        // child process Minecraft
let runningVersion = null;     // {version, loader} текущей запущенной игры

function isGameRunning() {
  return runningProc && !runningProc.killed && runningProc.exitCode === null;
}

function createWindow() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const opts = {
    width: 1080,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    frame: false,
    hasShadow: true,
    titleBarStyle: 'hidden',
    roundedCorners: true,
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (isMac) {
    opts.transparent = true;
    opts.backgroundColor = '#00000000';
    opts.vibrancy = 'under-window';
    opts.visualEffectState = 'active';
    opts.titleBarStyle = 'hiddenInset';
  } else if (isWin) {
    opts.transparent = false;
    opts.backgroundColor = '#00000000';
    opts.backgroundMaterial = 'acrylic';
  } else {
    opts.backgroundColor = '#1a1a22';
  }

  mainWindow = new BrowserWindow(opts);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Закрытие → сворачивание в трей (а не выход), чтобы tray-иконка имела смысл
  mainWindow.on('close', (e) => {
    if (forceQuit) return;
    e.preventDefault();
    mainWindow.hide();
    if (tray) {
      tray.displayBalloon?.({
        title: 'GlassCraft',
        content: 'Лаунчер свернулся в трей. Нажми на иконку чтобы открыть.',
        iconType: 'info',
      });
    }
  });

  if (process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  // Берём 32×32 иконку из ассетов; если нет — Electron-fallback
  const iconPath = path.join(__dirname, '..', 'assets',
    process.platform === 'win32' ? 'icon-32.png' : 'icon-32.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
  } catch {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip('GlassCraft');

  // Двойной клик / клик по иконке — показать окно
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const gameRunning = isGameRunning();

  const template = [
    {
      label: 'Открыть GlassCraft',
      click: showWindow,
    },
    { type: 'separator' },
    gameRunning
      ? {
          label: `Закрыть игру${runningVersion ? ` (${runningVersion.version})` : ''}`,
          click: stopGame,
        }
      : {
          label: 'Запустить игру',
          click: () => {
            showWindow();
            // Просим renderer кликнуть Play
            mainWindow?.webContents.send('tray:launch');
          },
        },
    { type: 'separator' },
    {
      label: gameRunning ? 'Игра запущена' : 'Игра не запущена',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        forceQuit = true;
        if (isGameRunning()) stopGame();
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function stopGame() {
  if (!isGameRunning()) return;
  try {
    runningProc.kill('SIGTERM');
    // На Windows SIGTERM не всегда работает — добавим жёсткий kill через таймаут
    setTimeout(() => {
      if (isGameRunning()) {
        try { runningProc.kill('SIGKILL'); } catch {}
      }
    }, 2000);
  } catch (e) {
    log('stopGame error', e.message);
  }
}

let forceQuit = false;

app.whenReady().then(() => {
  // Для нативных Windows toast notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.glasscraft.launcher');
  }

  createWindow();
  createTray();
  discord.connect().catch(() => {});

  // Auto-update check (через 5 секунд после старта, чтобы не блокировать UI)
  setTimeout(() => checkForUpdates(false), 5000);

  // Auto-clean старых логов раз в час
  setTimeout(() => autoCleanLogs(), 10000);
  setInterval(() => autoCleanLogs(), 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Не выходим автоматически — пусть живёт в трее.
  // Выход — только через Tray → "Выход" или forceQuit.
  if (forceQuit && process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  forceQuit = true;
  if (isGameRunning()) {
    try { runningProc.kill(); } catch {}
  }
  try { discord.disconnect(); } catch {}
});

// ============ Window controls ============
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => {
  // Если игра запущена — сворачиваем в трей. Иначе закрываем приложение.
  if (isGameRunning()) {
    mainWindow?.hide();
    if (tray) {
      tray.displayBalloon?.({
        title: 'GlassCraft',
        content: 'Игра запущена, лаунчер свернулся в трей.',
        iconType: 'info',
      });
    }
  } else {
    forceQuit = true;
    app.quit();
  }
});

// ============ Settings & Profile ============
function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { log('readJson error', file, e.message); }
  return fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

ipcMain.handle('profile:get', () => {
  return readJson(PROFILE_FILE, { username: 'Steve', uuid: null, type: 'offline' });
});

ipcMain.handle('profile:save', (_, profile) => {
  writeJson(PROFILE_FILE, profile);
  return profile;
});

ipcMain.handle('settings:get', () => {
  return readJson(SETTINGS_FILE, {
    memory: { min: '1G', max: '4G' },
    memoryAuto: true,
    javaPath: '',
    jvmArgs: '',
    gameDir: MC_DIR,
    loader: 'vanilla',
    loaderVersion: '',
    windowMode: 'windowed', // 'windowed' | 'fullscreen' | 'borderless'
    windowWidth: 854,
    windowHeight: 480,
    debugConsole: false,
    autoUpdate: true,
    autoCleanLogs: true,
    notifications: true,
    discordRpc: true,
    lang: 'ru',
    theme: 'glass',
    customTheme: null,
  });
});

ipcMain.handle('settings:save', (_, settings) => {
  writeJson(SETTINGS_FILE, settings);
  return settings;
});

ipcMain.handle('settings:browseJava', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Java executable', extensions: ['exe', ''] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ============ Mojang versions ============
ipcMain.handle('mc:versions', async () => {
  const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  return res.json();
});

// ============ Custom versions ============

// Сканирует gameDir/versions и возвращает массив { name, json, mcVersion?, type, isCustom: true }
ipcMain.handle('versions:listCustom', async (_, { gameDir } = {}) => {
  const target = gameDir || MC_DIR;
  const versionsDir = path.join(target, 'versions');
  if (!fs.existsSync(versionsDir)) return [];

  const result = [];
  for (const name of fs.readdirSync(versionsDir)) {
    const folder = path.join(versionsDir, name);
    let stat;
    try { stat = fs.statSync(folder); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const jsonPath = path.join(folder, `${name}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    let manifest = {};
    try {
      manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
      log('Bad version json', name, e.message);
      continue;
    }

    result.push({
      id: manifest.id || name,
      folderName: name,
      type: manifest.type || 'custom',
      inheritsFrom: manifest.inheritsFrom || null,
      mainClass: manifest.mainClass || null,
      releaseTime: manifest.releaseTime || null,
      isCustom: true,
    });
  }
  return result;
});

// Импорт: пользователь выбирает .json или папку, которую нужно положить в versions
ipcMain.handle('versions:import', async (_, { gameDir } = {}) => {
  const target = gameDir || MC_DIR;
  const versionsDir = path.join(target, 'versions');
  fs.mkdirSync(versionsDir, { recursive: true });

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбери папку версии или version.json',
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Version manifest', extensions: ['json'] },
      { name: 'All', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

  const src = result.filePaths[0];
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    // Скопируем папку целиком, сохранив имя
    const folderName = path.basename(src);
    const dest = path.join(versionsDir, folderName);
    if (fs.existsSync(dest)) {
      return { ok: false, error: `Версия "${folderName}" уже существует. Удали её сначала.` };
    }
    // Должен быть файл folderName.json внутри
    const expectedJson = path.join(src, `${folderName}.json`);
    if (!fs.existsSync(expectedJson)) {
      return { ok: false, error: `В папке нет ${folderName}.json — это не валидная версия Minecraft` };
    }
    copyRecursive(src, dest);
    return { ok: true, folderName };
  }

  if (stat.isFile()) {
    // Это должен быть version.json. Читаем id, кладём как versions/<id>/<id>.json
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(src, 'utf-8'));
    } catch (e) {
      return { ok: false, error: `Не удалось прочитать JSON: ${e.message}` };
    }
    const id = manifest.id || path.basename(src, '.json');
    const dest = path.join(versionsDir, id);
    if (fs.existsSync(dest)) {
      return { ok: false, error: `Версия "${id}" уже существует. Удали её сначала.` };
    }
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(src, path.join(dest, `${id}.json`));
    return { ok: true, folderName: id };
  }

  return { ok: false, error: 'Неподдерживаемый тип файла' };
});

ipcMain.handle('versions:delete', async (_, { gameDir, folderName }) => {
  const target = gameDir || MC_DIR;
  const folder = path.join(target, 'versions', folderName);
  if (!fs.existsSync(folder)) return { ok: false, error: 'Не найдено' };
  fs.rmSync(folder, { recursive: true, force: true });
  return { ok: true };
});

// Дописывает inheritsFrom в JSON кастомной версии (если его не было)
ipcMain.handle('versions:setBase', async (_, { gameDir, folderName, baseVersion }) => {
  const target = gameDir || MC_DIR;
  const jsonPath = path.join(target, 'versions', folderName, `${folderName}.json`);
  if (!fs.existsSync(jsonPath)) return { ok: false, error: 'JSON не найден' };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    return { ok: false, error: `Не удалось прочитать JSON: ${e.message}` };
  }
  manifest.inheritsFrom = baseVersion;
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));
  log('versions:setBase', folderName, '→', baseVersion);
  return { ok: true };
});

ipcMain.handle('versions:openFolder', async (_, { gameDir } = {}) => {
  const target = gameDir || MC_DIR;
  const versionsDir = path.join(target, 'versions');
  if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });
  shell.openPath(versionsDir);
});

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ============ Fabric meta ============
const FABRIC_META = 'https://meta.fabricmc.net/v2';

ipcMain.handle('fabric:loaders', async (_, gameVersion) => {
  const url = gameVersion
    ? `${FABRIC_META}/versions/loader/${gameVersion}`
    : `${FABRIC_META}/versions/loader`;
  const res = await fetch(url);
  return res.json();
});

ipcMain.handle('fabric:gameVersions', async () => {
  const res = await fetch(`${FABRIC_META}/versions/game`);
  return res.json();
});

// Fabric profile JSON — это готовая version.json для запуска через MCLC
async function installFabricProfile(gameVersion, loaderVersion, gameDir) {
  const res = await fetch(`${FABRIC_META}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`);
  if (!res.ok) throw new Error(`Fabric profile fetch failed: ${res.status}`);
  const profile = await res.json();
  // Имя профиля Fabric — "fabric-loader-{loader}-{game}"
  const versionName = profile.id;
  const versionDir = path.join(gameDir, 'versions', versionName);
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, `${versionName}.json`), JSON.stringify(profile, null, 2));
  return versionName;
}

// ============ Modrinth API ============
const MODRINTH_API = 'https://api.modrinth.com/v2';
const UA = 'GlassCraft/0.1 (github.com/glasscraft)';

ipcMain.handle('modrinth:search', async (_, { query, projectType, gameVersion, loader, limit, offset }) => {
  const facets = [];
  if (projectType) facets.push([`project_type:${projectType}`]);
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);

  const params = new URLSearchParams({
    query: query || '',
    limit: String(limit || 20),
    offset: String(offset || 0),
    index: 'relevance',
  });
  if (facets.length) params.append('facets', JSON.stringify(facets));

  const url = `${MODRINTH_API}/search?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Modrinth: ${res.status}`);
  return res.json();
});

ipcMain.handle('modrinth:project', async (_, slug) => {
  const res = await fetch(`${MODRINTH_API}/project/${slug}`, { headers: { 'User-Agent': UA } });
  return res.json();
});

ipcMain.handle('modrinth:versions', async (_, { slug, gameVersion, loader }) => {
  const params = new URLSearchParams();
  if (gameVersion) params.append('game_versions', JSON.stringify([gameVersion]));
  if (loader) params.append('loaders', JSON.stringify([loader]));
  const url = `${MODRINTH_API}/project/${slug}/version?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return res.json();
});

// ============ Download helper ============
async function downloadFile(url, destPath, onProgress) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  // Resume: если файл частично скачан в .part — пробуем продолжить через Range
  const partPath = `${destPath}.part`;
  let resumeFrom = 0;
  if (fs.existsSync(partPath)) {
    try { resumeFrom = fs.statSync(partPath).size; } catch { resumeFrom = 0; }
  }

  const headers = {};
  if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`;

  let res = await fetch(url, { redirect: 'follow', headers });

  // Сервер не поддерживает Range — начнём заново
  if (resumeFrom > 0 && res.status !== 206) {
    resumeFrom = 0;
    try { fs.unlinkSync(partPath); } catch {}
    res = await fetch(url, { redirect: 'follow' });
  }

  if (!res.ok && res.status !== 206) {
    throw new Error(`Download failed: ${res.status} ${url}`);
  }

  const partial = parseInt(res.headers.get('content-length') || '0', 10);
  const total = partial + resumeFrom;
  let received = resumeFrom;

  const fileStream = fs.createWriteStream(partPath, { flags: resumeFrom > 0 ? 'a' : 'w' });

  await new Promise((resolve, reject) => {
    res.body.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) onProgress(total ? received / total : 0, received, total);
    });
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  await fs.promises.rename(partPath, destPath);
}

ipcMain.handle('modrinth:install', async (event, { project, version, gameDir }) => {
  const target = gameDir || MC_DIR;
  const file = version.files.find((f) => f.primary) || version.files[0];
  if (!file) throw new Error('No file in this version');

  let folder = 'mods';
  switch (project.project_type) {
    case 'mod': folder = 'mods'; break;
    case 'resourcepack': folder = 'resourcepacks'; break;
    case 'shader': folder = 'shaderpacks'; break;
    case 'datapack': folder = 'datapacks'; break;
    default: folder = 'mods';
  }

  const dest = path.join(target, folder, file.filename);
  const send = (channel, payload) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send(channel, payload); } catch {}
  };

  // Если переустанавливаем — удалим предыдущий файл (если он другой)
  const installed = readInstalled();
  const prev = installed[project.slug];
  if (prev && prev.filename && prev.filename !== file.filename) {
    const prevPath = path.join(target, folder, prev.filename);
    if (fs.existsSync(prevPath)) {
      try { fs.unlinkSync(prevPath); } catch (e) { log('cleanup prev failed', e.message); }
    }
  }

  send('install:progress', { slug: project.slug, progress: 0 });
  await downloadFile(file.url, dest, (p) => {
    send('install:progress', { slug: project.slug, progress: p });
  });
  send('install:progress', { slug: project.slug, progress: 1 });

  // Запоминаем в реестре
  installed[project.slug] = {
    title: project.title,
    project_type: project.project_type,
    filename: file.filename,
    versionId: version.id,
    versionNumber: version.version_number,
    folder,
    installedAt: Date.now(),
  };
  writeInstalled(installed);

  return { ok: true, path: dest };
});

// ============ Content management ============

// Реестр Modrinth-установок: { [slug]: { title, project_type, filename, versionNumber, folder, ... } }
function readInstalled() {
  return readJson(INSTALLED_FILE, {});
}
function writeInstalled(data) {
  writeJson(INSTALLED_FILE, data);
}

// Сверяет реестр с диском: убирает записи, файла которых уже нет
function pruneInstalled(gameDir) {
  const installed = readInstalled();
  const target = gameDir || MC_DIR;
  let changed = false;
  for (const [slug, meta] of Object.entries(installed)) {
    // Модпаки помечаются filename === '__mrpack__' — у них нет физического файла,
    // не сносим их при prune
    if (meta.filename === '__mrpack__' || meta.project_type === 'modpack') continue;

    const filePath = path.join(target, meta.folder || 'mods', meta.filename || '');
    if (!meta.filename || !fs.existsSync(filePath)) {
      delete installed[slug];
      changed = true;
    }
  }
  if (changed) writeInstalled(installed);
  return installed;
}

ipcMain.handle('installed:list', async (_, { gameDir } = {}) => pruneInstalled(gameDir));

ipcMain.handle('installed:save', (_, data) => {
  writeJson(INSTALLED_FILE, data || {});
  return true;
});

ipcMain.handle('content:list', async (_, { gameDir, type }) => {
  const target = gameDir || MC_DIR;
  const folderMap = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
  const folder = path.join(target, folderMap[type] || 'mods');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter((f) => !f.startsWith('.'))
    .map((name) => {
      try {
        const stat = fs.statSync(path.join(folder, name));
        return { name, size: stat.size, mtime: stat.mtimeMs };
      } catch { return { name, size: 0, mtime: 0 }; }
    });
});

ipcMain.handle('content:delete', async (_, { gameDir, type, name }) => {
  const target = gameDir || MC_DIR;
  const folderMap = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
  const folder = path.join(target, folderMap[type] || 'mods');
  const filePath = path.join(folder, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Чистим запись в реестре установленного, если она ссылалась на этот файл
  const installed = readInstalled();
  let changed = false;
  for (const [slug, meta] of Object.entries(installed)) {
    if (meta.filename === name) {
      delete installed[slug];
      changed = true;
    }
  }
  if (changed) writeInstalled(installed);

  return { ok: true };
});

ipcMain.handle('content:deleteAll', async (_, { gameDir, type }) => {
  const target = gameDir || MC_DIR;
  const folderMap = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
  const folder = path.join(target, folderMap[type] || 'mods');
  if (!fs.existsSync(folder)) return { ok: true, deleted: 0 };
  const files = fs.readdirSync(folder).filter((f) => !f.startsWith('.'));
  let deleted = 0;
  for (const name of files) {
    try { fs.unlinkSync(path.join(folder, name)); deleted++; } catch {}
  }

  const installed = readInstalled();
  let changed = false;
  for (const [slug, meta] of Object.entries(installed)) {
    if (meta.filename && files.includes(meta.filename)) {
      delete installed[slug];
      changed = true;
    }
  }
  if (changed) writeInstalled(installed);

  return { ok: true, deleted };
});

ipcMain.handle('content:openFolder', async (_, { gameDir, type }) => {
  const target = gameDir || MC_DIR;
  const folderMap = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
  const folder = path.join(target, folderMap[type] || 'mods');
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  shell.openPath(folder);
});

// ============ Java manager ============

// Какая Java нужна для конкретной версии MC
function recommendedJavaForVersion(mcVersion) {
  if (!mcVersion) return 21;
  const m = mcVersion.match(/^1\.(\d+)/);
  if (!m) return 21;
  const minor = parseInt(m[1], 10);
  if (minor >= 21) return 21;     // 1.21+
  if (minor >= 20) {
    const patch = parseInt(mcVersion.split('.')[2] || '0', 10);
    return (minor === 20 && patch >= 5) ? 21 : 17;
  }
  if (minor >= 18) return 17;     // 1.18 — 1.20.4
  if (minor >= 17) return 16;     // 1.17.x
  return 8;                        // 1.16 и ниже
}

function adoptiumOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function adoptiumArch() {
  if (process.arch === 'x64') return 'x64';
  if (process.arch === 'arm64') return 'aarch64';
  return process.arch;
}

function javaExeName() {
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

// Найти распакованную Java в папке
function findJavaExeIn(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  const exe = javaExeName();
  // Adoptium ZIP распаковывается в папку вида jdk-21.0.2+13/ → bin/java[.exe]
  for (const entry of fs.readdirSync(rootDir)) {
    const sub = path.join(rootDir, entry);
    if (!fs.statSync(sub).isDirectory()) continue;
    const direct = path.join(sub, 'bin', exe);
    if (fs.existsSync(direct)) return direct;
    // macOS: Contents/Home/bin/java
    const mac = path.join(sub, 'Contents', 'Home', 'bin', exe);
    if (fs.existsSync(mac)) return mac;
  }
  return null;
}

function getInstalledJava(major) {
  return findJavaExeIn(path.join(JAVA_DIR, String(major)));
}

ipcMain.handle('java:list', () => {
  const result = {};
  for (const major of [8, 17, 21]) {
    const exe = getInstalledJava(major);
    result[major] = exe ? { installed: true, path: exe } : { installed: false };
  }
  return result;
});

ipcMain.handle('java:recommendFor', (_, mcVersion) => recommendedJavaForVersion(mcVersion));

ipcMain.handle('java:install', async (event, { major }) => {
  const send = (channel, payload) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send(channel, payload); } catch {}
  };

  const targetDir = path.join(JAVA_DIR, String(major));
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${adoptiumOs()}/${adoptiumArch()}/jdk/hotspot/normal/eclipse?project=jdk`;
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  const archivePath = path.join(targetDir, `temurin-${major}${ext}`);

  send('java:progress', { major, phase: 'download', progress: 0 });
  log('Java install start', { major, url });

  await downloadFile(url, archivePath, (p, received, total) => {
    send('java:progress', { major, phase: 'download', progress: p, received, total });
  });

  send('java:progress', { major, phase: 'extract', progress: 0 });

  if (ext === '.zip') {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(targetDir, true);
  } else {
    // tar.gz: распакуем системным tar-ом, он есть и в Linux, и в macOS, и в Win10+
    await new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'ignore' });
      tar.on('exit', (code) => code === 0 ? resolve() : reject(new Error('tar failed')));
      tar.on('error', reject);
    });
  }

  fs.unlinkSync(archivePath);
  const exe = findJavaExeIn(targetDir);
  if (!exe) throw new Error('Не удалось найти java после распаковки');

  send('java:progress', { major, phase: 'done', progress: 1, path: exe });
  log('Java installed', { major, exe });
  return { ok: true, path: exe };
});

ipcMain.handle('java:openFolder', () => {
  shell.openPath(JAVA_DIR);
});

// Авто-выбор Java: настройки → встроенные → системная
function resolveJava(settings, mcVersion) {
  if (settings?.javaPath && fs.existsSync(settings.javaPath)) return settings.javaPath;
  const major = recommendedJavaForVersion(mcVersion);
  const exe = getInstalledJava(major);
  if (exe) return exe;
  // fallback — попробуем 21, потом 17, потом 8
  for (const m of [21, 17, 8]) {
    const e = getInstalledJava(m);
    if (e) return e;
  }
  return null;
}

// ============ Launch Minecraft ============

// UUID v3 для offline-режима, как делает сам Minecraft (на основе ника)
function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// ============ Debug console window ============
function createDebugConsole() {
  const win = new BrowserWindow({
    width: 720,
    height: 480,
    title: 'GlassCraft — Debug Console',
    backgroundColor: '#0a0a14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Загружаем простую HTML-консоль через data URL
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Debug</title>
<style>
  body { margin: 0; background: #0a0a14; color: #d6d6d8; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; }
  #log { padding: 14px; white-space: pre-wrap; word-break: break-all; height: calc(100vh - 40px); overflow-y: auto; }
  #toolbar { height: 40px; padding: 0 14px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03); }
  button { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #fff; padding: 5px 11px; border-radius: 6px; font: inherit; cursor: pointer; }
  button:hover { background: rgba(255,255,255,0.14); }
  .l-debug { color: #8a8a90; }
  .l-data { color: #d6d6d8; }
  .l-info { color: #4ea1ff; }
  .l-error { color: #ff6b6b; }
</style>
</head>
<body>
<div id="toolbar">
  <button onclick="document.getElementById('log').textContent = ''">Очистить</button>
  <span style="margin-left: auto; color: rgba(255,255,255,0.5)">GlassCraft Debug Console</span>
</div>
<div id="log"></div>
<script>
  const logEl = document.getElementById('log');
  let autoscroll = true;
  logEl.addEventListener('scroll', () => {
    autoscroll = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  });
  window.dbgAppend = (level, line) => {
    const span = document.createElement('span');
    span.className = 'l-' + level;
    span.textContent = (line.endsWith('\\n') ? line : line + '\\n');
    logEl.appendChild(span);
    if (autoscroll) logEl.scrollTop = logEl.scrollHeight;
    // Limit размер
    if (logEl.childNodes.length > 5000) {
      while (logEl.childNodes.length > 4000) logEl.removeChild(logEl.firstChild);
    }
  };
</script>
</body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  return {
    append(level, line) {
      if (win.isDestroyed()) return;
      const safe = JSON.stringify(String(line));
      win.webContents.executeJavaScript(`window.dbgAppend(${JSON.stringify(level)}, ${safe})`).catch(() => {});
    },
    close() {
      if (!win.isDestroyed()) win.close();
    },
  };
}

ipcMain.handle('mc:launch', async (event, { version, profile, settings, loader, loaderVersion, isCustom }) => {
  const send = (channel, payload) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send(channel, payload); } catch {}
  };

  const username = (profile?.username || 'Steve').trim() || 'Steve';
  const gameDir = settings?.gameDir || MC_DIR;

  const authorization = {
    access_token: '0'.repeat(32),
    client_token: crypto.randomBytes(16).toString('hex'),
    uuid: offlineUuid(username).replace(/-/g, ''),
    name: username,
    user_properties: {},
    meta: { type: 'mojang', demo: false },
  };

  // Если кастомная — читаем её манифест чтобы понять базовую MC-версию (для выбора Java)
  let mcVersionForJava = version;
  let customManifest = null;
  if (isCustom) {
    const jsonPath = path.join(gameDir, 'versions', version, `${version}.json`);
    if (!fs.existsSync(jsonPath)) {
      return { ok: false, error: `Файл ${version}.json не найден в папке версии` };
    }
    try {
      customManifest = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
      return { ok: false, error: `Не удалось прочитать манифест версии: ${e.message}` };
    }
    if (!customManifest.inheritsFrom && !customManifest.assetIndex) {
      return {
        ok: false,
        needBaseVersion: true,
        folderName: version,
        error: `У версии "${version}" нет inheritsFrom — укажи базовую версию Minecraft (нажми иконку базы рядом с версией в Настройках).`,
      };
    }
    mcVersionForJava = customManifest.inheritsFrom || customManifest.id || version;
  }

  const javaPath = resolveJava(settings, mcVersionForJava);
  if (!javaPath) {
    return { ok: false, error: `Java не найдена. Установи Java ${recommendedJavaForVersion(mcVersionForJava)} во вкладке Настройки → Java.` };
  }

  // Авто-память: используем 50% от свободной (но не больше 8GB и не меньше 2GB)
  let memMax = settings?.memory?.max || '4G';
  let memMin = settings?.memory?.min || '1G';
  if (settings?.memoryAuto) {
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const half = Math.round(totalMb / 2);
    const autoMaxMb = Math.max(2048, Math.min(8192, half));
    memMax = `${Math.round(autoMaxMb / 1024)}G`;
    memMin = '1G';
  }

  // Дополнительные JVM args от пользователя
  const customArgs = (settings?.jvmArgs || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Параметры окна Minecraft
  const windowOpts = {};
  if (settings?.windowMode === 'fullscreen') {
    windowOpts.fullscreen = true;
  } else {
    windowOpts.width = settings?.windowWidth || 854;
    windowOpts.height = settings?.windowHeight || 480;
  }

  const opts = {
    authorization,
    root: gameDir,
    version: { number: mcVersionForJava, type: customManifest?.type || 'release' },
    memory: { max: memMax, min: memMin },
    javaPath,
    customArgs: customArgs.length ? customArgs : undefined,
    window: windowOpts,
  };

  // Для кастомной версии ставим custom = имя папки.
  if (isCustom) {
    opts.version.custom = version;
    log('Launching custom version', version, 'inherits', mcVersionForJava);
  }

  // Fabric: подменяем version на кастомный профиль
  if (!isCustom && loader === 'fabric' && loaderVersion) {
    try {
      send('mc:log', { level: 'info', msg: 'Подготовка Fabric…' });
      const versionName = await installFabricProfile(version, loaderVersion, gameDir);
      opts.version.custom = versionName;
      log('Fabric profile installed', versionName);
    } catch (err) {
      log('Fabric profile install failed', err.message);
      return { ok: false, error: `Не удалось получить Fabric профиль: ${err.message}` };
    }
  }

  // Debug-консоль: открываем DevTools-подобное окно с логами Java перед запуском
  let debugWin = null;
  if (settings?.debugConsole) {
    debugWin = createDebugConsole();
  }

  log('Launching MC', { version, isCustom, username, root: opts.root, javaPath, loader: loader || 'vanilla', loaderVersion, debugConsole: !!debugWin });

  launcher.removeAllListeners();
  launcher.on('debug', (m) => {
    log('[debug]', m);
    send('mc:log', { level: 'debug', msg: String(m) });
    debugWin?.append('debug', String(m));
  });
  launcher.on('data', (m) => {
    log('[data]', String(m).slice(0, 200));
    send('mc:log', { level: 'data', msg: String(m) });
    debugWin?.append('data', String(m));
  });
  launcher.on('progress', (p) => send('mc:progress', p));
  launcher.on('download-status', (p) => send('mc:progress', p));
  launcher.on('arguments', () => { log('arguments built'); send('mc:log', { level: 'info', msg: 'Запуск Java' }); });
  launcher.on('close', (c) => {
    log('MC closed', c);
    runningProc = null;
    runningVersion = null;
    updateTrayMenu();
    discord.setIdle();
    send('mc:close', c);
    notifications.notify({ title: 'GlassCraft', body: `Игра закрыта (код ${c})` });
    debugWin?.append('info', `=== Игра закрыта (код ${c}) ===`);
  });

  try {
    const proc = await launcher.launch(opts);
    if (!proc) return { ok: false, error: 'launcher.launch вернул null. Проверь логи.' };
    runningProc = proc;
    runningVersion = { version: mcVersionForJava, loader: loader || 'vanilla' };
    updateTrayMenu();
    discord.setInGame(mcVersionForJava, loader || 'vanilla');
    notifications.notify({
      title: 'Minecraft запускается',
      body: `${mcVersionForJava} · ${loader || 'vanilla'}`,
    });
    return { ok: true };
  } catch (err) {
    log('launch error', err.message, err.stack);
    return { ok: false, error: String(err.message || err) };
  }
});

// ============ Discord RPC IPC ============
ipcMain.handle('discord:setSection', (_, section) => {
  if (!isGameRunning()) discord.setBrowsing(section);
});

ipcMain.handle('app:stopGame', () => {
  stopGame();
  return { ok: true };
});

// ============ Update checker ============
const REPO_OWNER = 'hell0zz12';
const REPO_NAME = 'GlassCraft-Launcher';

async function checkForUpdates(manualTrigger = true) {
  try {
    const settings = readJson(SETTINGS_FILE, {});
    if (!manualTrigger && settings.autoUpdate === false) return null;

    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { 'User-Agent': 'GlassCraft-Launcher' } }
    );
    if (!res.ok) {
      log('updateCheck failed', res.status);
      if (manualTrigger) {
        notifications.notify({
          title: 'GlassCraft',
          body: 'Не удалось проверить обновление',
        });
      }
      return null;
    }
    const release = await res.json();
    const latest = (release.tag_name || '').replace(/^v/, '');
    const current = require('../package.json').version;

    log('updateCheck', { current, latest });

    if (compareVersions(latest, current) > 0) {
      const url = release.html_url;
      notifications.notify({
        title: 'GlassCraft — доступна новая версия',
        body: `${current} → ${latest}. Нажми чтобы открыть страницу.`,
        urgency: 'normal',
        onClick: () => shell.openExternal(url),
      });
      // Уведомим renderer
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('app:updateAvailable', { current, latest, url });
      }
      return { available: true, current, latest, url };
    }

    if (manualTrigger) {
      notifications.notify({
        title: 'GlassCraft',
        body: 'Лаунчер обновлён до последней версии',
      });
    }
    return { available: false, current, latest };
  } catch (e) {
    log('updateCheck error', e.message);
    if (manualTrigger) {
      notifications.notify({
        title: 'GlassCraft',
        body: 'Ошибка проверки обновлений',
      });
    }
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

ipcMain.handle('app:checkUpdates', () => checkForUpdates(true));
ipcMain.handle('app:openExternal', (_, url) => shell.openExternal(url));
ipcMain.handle('app:getVersion', () => require('../package.json').version);

// ============ Auto-clean logs ============
function autoCleanLogs() {
  try {
    const settings = readJson(SETTINGS_FILE, {});
    if (settings.autoCleanLogs === false) return;

    // Чистим launcher.log если он больше 5 MB
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > 5 * 1024 * 1024) {
        // Оставим последний 1 MB
        const fd = fs.openSync(LOG_FILE, 'r');
        const buf = Buffer.alloc(1024 * 1024);
        fs.readSync(fd, buf, 0, buf.length, stat.size - buf.length);
        fs.closeSync(fd);
        fs.writeFileSync(LOG_FILE, buf);
        log('Log truncated');
      }
    }

    // Чистим логи Minecraft в gameDir/logs/, оставляя последние 20 файлов и не старше 30 дней
    const gameLogs = path.join(settings.gameDir || MC_DIR, 'logs');
    if (fs.existsSync(gameLogs)) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(gameLogs)
        .map((name) => {
          try {
            const full = path.join(gameLogs, name);
            return { name, full, mtime: fs.statSync(full).mtimeMs };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime);

      // Удаляем всё что старше cutoff и за пределами топ-20
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (i >= 20 || f.mtime < cutoff) {
          try { fs.unlinkSync(f.full); } catch {}
        }
      }
    }
  } catch (e) {
    log('autoClean error', e.message);
  }
}

ipcMain.handle('app:cleanLogs', () => {
  autoCleanLogs();
  return { ok: true };
});

// ============ Notifications IPC ============
ipcMain.handle('notify', (_, args) => {
  notifications.notify(args);
});

ipcMain.handle('notify:setEnabled', (_, enabled) => {
  notifications.setEnabled(enabled);
});

// ============ Modpacks (.mrpack) ============

// Поиск modpack-проектов на Modrinth
ipcMain.handle('modrinth:searchModpacks', async (_, { query, gameVersion, loader, limit, offset }) => {
  const facets = [['project_type:modpack']];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);

  const params = new URLSearchParams({
    query: query || '',
    limit: String(limit || 24),
    offset: String(offset || 0),
    index: 'relevance',
  });
  params.append('facets', JSON.stringify(facets));

  const url = `${MODRINTH_API}/search?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Modrinth: ${res.status}`);
  return res.json();
});

// Импорт .mrpack из Modrinth-version или локального файла
ipcMain.handle('modpack:install', async (event, { project, version, gameDir }) => {
  const target = gameDir || MC_DIR;
  const file = version.files.find((f) => f.primary) || version.files[0];
  if (!file) throw new Error('Нет файла в версии модпака');

  const send = (channel, payload) => {
    if (event.sender.isDestroyed()) return;
    try { event.sender.send(channel, payload); } catch {}
  };

  const tmpPath = path.join(APP_DIR, 'tmp', `${Date.now()}_${file.filename}`);
  send('modpack:progress', { phase: 'download', progress: 0, slug: project.slug });

  try {
    await downloadFile(file.url, tmpPath, (p) => {
      send('modpack:progress', { phase: 'download', progress: p, slug: project.slug });
    });
    const result = await applyMrpack(tmpPath, target, project.title, (phase, p) => {
      send('modpack:progress', { phase, progress: p, slug: project.slug });
    }, { slug: project.slug, version, project });
    try { fs.unlinkSync(tmpPath); } catch {}
    return { ok: true, ...result };
  } catch (e) {
    log('modpack install error', e.message);
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('modpack:importLocal', async (_, { gameDir }) => {
  const target = gameDir || MC_DIR;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбери .mrpack',
    properties: ['openFile'],
    filters: [{ name: 'Modrinth modpack', extensions: ['mrpack', 'zip'] }],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  const src = result.filePaths[0];
  try {
    const r = await applyMrpack(src, target, path.basename(src, path.extname(src)));
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

async function applyMrpack(packPath, gameDir, name, onProgress, modrinthMeta = null) {
  // .mrpack — это zip с modrinth.index.json и опц. папкой overrides/
  const zip = new AdmZip(packPath);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('Не найден modrinth.index.json в архиве');

  const index = JSON.parse(indexEntry.getData().toString('utf-8'));

  const fileCount = (index.files || []).length;
  let done = 0;

  // 1. Скачиваем все files в их path
  for (const f of index.files || []) {
    const url = f.downloads?.[0];
    if (!url) continue;
    const dest = path.join(gameDir, f.path);
    try {
      await downloadFile(url, dest);
    } catch (e) {
      log('mrpack file fail', f.path, e.message);
    }
    done++;
    if (onProgress) onProgress('files', done / fileCount);
  }

  // 2. Копируем содержимое overrides/ и client-overrides/ в gameDir
  for (const folder of ['overrides', 'client-overrides']) {
    for (const e of zip.getEntries()) {
      if (e.entryName.startsWith(`${folder}/`) && !e.isDirectory) {
        const rel = e.entryName.slice(folder.length + 1);
        if (!rel) continue;
        const out = path.join(gameDir, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, e.getData());
      }
    }
  }

  // 3. Сохраняем как кастомную версию через minecraft-блок dependencies
  // index.dependencies = { minecraft: "1.20.1", "fabric-loader": "0.15.0" }
  const mcVersion = index.dependencies?.minecraft;
  let loaderType, loaderVersion;
  if (index.dependencies?.['fabric-loader']) {
    loaderType = 'fabric';
    loaderVersion = index.dependencies['fabric-loader'];
  } else if (index.dependencies?.['forge']) {
    loaderType = 'forge';
    loaderVersion = index.dependencies['forge'];
  } else if (index.dependencies?.['quilt-loader']) {
    loaderType = 'quilt';
    loaderVersion = index.dependencies['quilt-loader'];
  } else if (index.dependencies?.['neoforge']) {
    loaderType = 'neoforge';
    loaderVersion = index.dependencies['neoforge'];
  }

  // Регистрируем модпак в installed.json для UI
  const meta = readJson(MODPACKS_FILE, {});
  const id = `mrpack:${index.name || name}`;
  meta[id] = {
    name: index.name || name,
    summary: index.summary || '',
    versionId: index.versionId,
    mcVersion,
    loader: loaderType,
    loaderVersion,
    fileCount,
    installedAt: Date.now(),
  };
  writeJson(MODPACKS_FILE, meta);

  // Также регистрируем в общем installed-реестре, чтобы карточка показывала "Установлено"
  if (modrinthMeta?.slug) {
    const installed = readJson(INSTALLED_FILE, {});
    installed[modrinthMeta.slug] = {
      title: modrinthMeta.project?.title || index.name || name,
      project_type: 'modpack',
      filename: '__mrpack__',
      versionId: modrinthMeta.version?.id,
      versionNumber: modrinthMeta.version?.version_number || index.versionId,
      folder: 'modpacks',
      mcVersion,
      loader: loaderType,
      loaderVersion,
      installedAt: Date.now(),
    };
    writeJson(INSTALLED_FILE, installed);
  }

  return {
    name: index.name || name,
    mcVersion,
    loader: loaderType,
    loaderVersion,
    fileCount,
  };
}

ipcMain.handle('modpacks:list', () => readJson(MODPACKS_FILE, {}));

// ============ Accounts ============
ipcMain.handle('accounts:list', () => readJson(ACCOUNTS_FILE, []));

ipcMain.handle('accounts:save', (_, accounts) => {
  writeJson(ACCOUNTS_FILE, accounts);
  return accounts;
});

ipcMain.handle('accounts:create', (_, { username }) => {
  const accounts = readJson(ACCOUNTS_FILE, []);
  const account = {
    id: crypto.randomUUID(),
    username,
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE, accounts);
  return account;
});

ipcMain.handle('accounts:delete', (_, { id }) => {
  let accounts = readJson(ACCOUNTS_FILE, []);
  accounts = accounts.filter((a) => a.id !== id);
  writeJson(ACCOUNTS_FILE, accounts);
  return accounts;
});

ipcMain.handle('accounts:toggleFavorite', (_, { id }) => {
  const accounts = readJson(ACCOUNTS_FILE, []);
  const acc = accounts.find((a) => a.id === id);
  if (acc) acc.favorite = !acc.favorite;
  writeJson(ACCOUNTS_FILE, accounts);
  return accounts;
});

ipcMain.handle('accounts:setActive', (_, { id }) => {
  const accounts = readJson(ACCOUNTS_FILE, []);
  const acc = accounts.find((a) => a.id === id);
  if (acc) {
    const profile = readJson(PROFILE_FILE, { username: 'Steve', uuid: null, type: 'offline' });
    profile.username = acc.username;
    writeJson(PROFILE_FILE, profile);
  }
  return acc || null;
});

// ============ Play Time ============
ipcMain.handle('playtime:get', () => readJson(PLAYTIME_FILE, {}));

ipcMain.handle('playtime:add', (_, { version, seconds }) => {
  const data = readJson(PLAYTIME_FILE, {});
  data[version] = (data[version] || 0) + seconds;
  writeJson(PLAYTIME_FILE, data);
  return data;
});

// ============ Servers ============
ipcMain.handle('servers:list', () => readJson(SERVERS_FILE, []));

ipcMain.handle('servers:save', (_, servers) => {
  writeJson(SERVERS_FILE, servers);
  return servers;
});
