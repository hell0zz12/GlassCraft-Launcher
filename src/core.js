const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  memory: { min: '1G', max: '4G' },
  memoryAuto: true,
  javaPath: '',
  jvmArgs: '',
  gameDir: '',
  loader: 'vanilla',
  loaderVersion: '',
  windowMode: 'windowed',
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeComponent(value, label = 'name') {
  const result = String(value || '').trim();
  if (!result || result.length > 180 || result === '.' || result === '..' || /[\0/\\]/.test(result)) {
    throw new Error(`Invalid ${label}`);
  }
  return result;
}

function safeRelativePath(root, relative, label = 'path') {
  if (typeof relative !== 'string' || !relative.trim() || relative.includes('\0')) {
    throw new Error(`Invalid ${label}`);
  }
  const portable = relative.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:/.test(portable) || portable.startsWith('//')) {
    throw new Error(`Invalid ${label}`);
  }
  const parts = portable.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid ${label}`);
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...parts);
  const rel = path.relative(base, resolved);
  if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) {
    throw new Error(`Invalid ${label}`);
  }
  return resolved;
}

function ensureNoSymlinkParents(root, destination) {
  const base = path.resolve(root);
  const parent = path.dirname(path.resolve(destination));
  const rel = path.relative(base, parent);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Destination escapes root');
  let current = base;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Destination contains a symbolic link');
    }
  }
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    throw new Error('Ник должен содержать 3-16 латинских букв, цифр или _');
  }
  return username;
}

function parseMemory(value, fallback) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : fallback;
  const match = /^(\d{1,5})([MG])$/.exec(text);
  if (!match) return fallback;
  const mb = Number(match[1]) * (match[2] === 'G' ? 1024 : 1);
  return mb >= 256 && mb <= 65536 ? text : fallback;
}

function normalizeSettings(value, defaultGameDir) {
  const source = isPlainObject(value) ? value : {};
  const memorySource = isPlainObject(source.memory) ? source.memory : {};
  const min = parseMemory(memorySource.min, DEFAULT_SETTINGS.memory.min);
  let max = parseMemory(memorySource.max, DEFAULT_SETTINGS.memory.max);
  const toMb = (v) => Number(v.slice(0, -1)) * (v.endsWith('G') ? 1024 : 1);
  if (toMb(max) < toMb(min)) max = min;
  const gameDir = typeof source.gameDir === 'string' && path.isAbsolute(source.gameDir.trim())
    ? path.resolve(source.gameDir.trim())
    : path.resolve(defaultGameDir);
  const javaPath = typeof source.javaPath === 'string' && source.javaPath.length <= 1024
    ? source.javaPath.trim()
    : '';
  const jvmArgs = typeof source.jvmArgs === 'string' && source.jvmArgs.length <= 4096 && !/[\0\r\n]/.test(source.jvmArgs)
    ? source.jvmArgs.trim()
    : '';
  const themes = new Set(['glass', 'flat-dark', 'flat-light', 'midnight', 'sunset', 'custom']);
  const custom = isPlainObject(source.customTheme) ? source.customTheme : null;
  const customTheme = custom && /^#[0-9a-f]{6}$/i.test(custom.accent) && /^#[0-9a-f]{6}$/i.test(custom.bg) && /^#[0-9a-f]{6}$/i.test(custom.text)
    ? { accent: custom.accent, bg: custom.bg, text: custom.text, bgAlpha: Math.max(0, Math.min(100, Number(custom.bgAlpha) || 0)) }
    : null;
  return {
    memory: { min, max },
    memoryAuto: source.memoryAuto !== false,
    javaPath,
    jvmArgs,
    gameDir,
    loader: source.loader === 'fabric' ? 'fabric' : 'vanilla',
    loaderVersion: typeof source.loaderVersion === 'string' ? source.loaderVersion.slice(0, 80) : '',
    windowMode: source.windowMode === 'fullscreen' ? 'fullscreen' : 'windowed',
    windowWidth: Math.max(320, Math.min(16384, Number.parseInt(source.windowWidth, 10) || DEFAULT_SETTINGS.windowWidth)),
    windowHeight: Math.max(240, Math.min(16384, Number.parseInt(source.windowHeight, 10) || DEFAULT_SETTINGS.windowHeight)),
    debugConsole: source.debugConsole === true,
    autoUpdate: source.autoUpdate !== false,
    autoCleanLogs: source.autoCleanLogs !== false,
    notifications: source.notifications !== false,
    discordRpc: source.discordRpc !== false,
    lang: source.lang === 'en' ? 'en' : 'ru',
    theme: themes.has(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    customTheme,
  };
}

function normalizeProfile(value) {
  const source = isPlainObject(value) ? value : {};
  return { username: validateUsername(source.username || 'Steve'), uuid: null, type: 'offline' };
}

function validateHttpsUrl(value, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Only HTTPS URLs are allowed');
  }
  if (allowedHosts && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('URL host is not allowed');
  }
  return url;
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureNoSymlinkParents,
  normalizeProfile,
  normalizeSettings,
  safeComponent,
  safeRelativePath,
  validateHttpsUrl,
  validateUsername,
};
