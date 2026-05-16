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

const launcher = new Client();

const APP_DIR = path.join(os.homedir(), '.glasscraft');
const MC_DIR = path.join(APP_DIR, 'minecraft');
const JAVA_DIR = path.join(APP_DIR, 'java');
const PROFILE_FILE = path.join(APP_DIR, 'profile.json');
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');
const INSTALLED_FILE = path.join(APP_DIR, 'installed.json');
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
  createWindow();
  createTray();
  discord.connect().catch(() => {});
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
    javaPath: '',
    gameDir: MC_DIR,
    loader: 'vanilla',
    loaderVersion: '',
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
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);

  const total = parseInt(res.headers.get('content-length') || '0', 10);
  let received = 0;

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const fileStream = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    res.body.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) onProgress(total ? received / total : 0, received, total);
    });
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
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

function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
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

  const opts = {
    authorization,
    root: gameDir,
    version: { number: mcVersionForJava, type: customManifest?.type || 'release' },
    memory: {
      max: settings?.memory?.max || '4G',
      min: settings?.memory?.min || '1G',
    },
    javaPath,
  };

  // Для кастомной версии ставим custom = имя папки. MCLC прочитает её JSON
  // и автоматически смерджит с базовой версией из inheritsFrom.
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

  log('Launching MC', { version, isCustom, username, root: opts.root, javaPath, loader: loader || 'vanilla', loaderVersion });

  launcher.removeAllListeners();
  launcher.on('debug', (m) => { log('[debug]', m); send('mc:log', { level: 'debug', msg: String(m) }); });
  launcher.on('data', (m) => { log('[data]', String(m).slice(0, 200)); send('mc:log', { level: 'data', msg: String(m) }); });
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
  });

  try {
    const proc = await launcher.launch(opts);
    if (!proc) return { ok: false, error: 'launcher.launch вернул null. Проверь логи.' };
    runningProc = proc;
    runningVersion = { version: mcVersionForJava, loader: loader || 'vanilla' };
    updateTrayMenu();
    discord.setInGame(mcVersionForJava, loader || 'vanilla');
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
