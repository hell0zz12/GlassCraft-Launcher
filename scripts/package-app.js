/* Сборка GlassCraft вручную, без electron-packager.
 * Копирует Electron runtime + наш код + prod node_modules в dist/GlassCraft-win32-x64/.
 * Никаких prune, никаких ignore-magic — что есть, то и копируется.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist');
const DIST = path.join(ROOT, 'build');

// Используем timestamp в имени папки, чтобы не пытаться удалять заблокированные старые сборки.
// Ярлык build/GlassCraft-latest (junction) переключаем на свежую.
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19);
const OUT = path.join(DIST, `GlassCraft-${STAMP}`);
const LATEST_LINK = path.join(DIST, 'GlassCraft-latest');
const OUT_RESOURCES = path.join(OUT, 'resources');
const OUT_APP = path.join(OUT_RESOURCES, 'app');

const APP_NAME = 'GlassCraft';

// Берём prod-зависимости автоматически из package.json — чтобы не забывать.
function readProdDeps() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  return Object.keys(pkg.dependencies || {});
}
const PROD_DEPS = readProdDeps();

function log(stage, msg) {
  console.log(`[${stage}] ${msg}`);
}

function copyDir(src, dst) {
  // Используем robocopy — нативный Windows-инструмент, обходит все блокировки и read-only.
  // /E — рекурсивно с пустыми папками, /NFL /NDL /NJH /NJS /NP — без шумного лога,
  // /R:2 /W:1 — 2 ретрая по 1 секунде на каждый файл
  fs.mkdirSync(dst, { recursive: true });
  const result = require('child_process').spawnSync(
    'robocopy',
    [src, dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1', '/MT:8'],
    { stdio: 'pipe', windowsHide: true }
  );
  // robocopy exit codes 0..7 — успех (8+ — реальная ошибка)
  if (result.status > 7) {
    throw new Error(`robocopy ${src} -> ${dst} failed: ${result.stderr?.toString() || result.stdout?.toString()}`);
  }
}

// ============ 0. Sanity ============
if (!fs.existsSync(SRC_ELECTRON)) {
  console.error('Electron runtime не найден:', SRC_ELECTRON);
  console.error('Запусти: npm install');
  process.exit(1);
}

// ============ 1. Создаём свежую папку сборки ============
log('clean', `Сборка пойдёт в ${path.basename(OUT)} (старые папки можешь удалить вручную после)`);
fs.mkdirSync(OUT, { recursive: true });

// ============ 2. Копируем Electron runtime ============
log('electron', `Копирую Electron из ${SRC_ELECTRON}…`);
copyDir(SRC_ELECTRON, OUT);

// ============ 3. Переименовываем exe ============
const oldExe = path.join(OUT, 'electron.exe');
const newExe = path.join(OUT, `${APP_NAME}.exe`);
if (fs.existsSync(oldExe)) {
  fs.renameSync(oldExe, newExe);
  log('rename', `electron.exe → ${APP_NAME}.exe`);
}

// ============ 4. Удаляем default_app.asar ============
const defaultApp = path.join(OUT_RESOURCES, 'default_app.asar');
if (fs.existsSync(defaultApp)) {
  fs.unlinkSync(defaultApp);
  log('clean', 'default_app.asar удалён');
}

// ============ 5. Копируем код приложения ============
log('app', 'Копирую код приложения…');
fs.mkdirSync(OUT_APP, { recursive: true });

// package.json
fs.copyFileSync(
  path.join(ROOT, 'package.json'),
  path.join(OUT_APP, 'package.json')
);

// src/
copyDir(path.join(ROOT, 'src'), path.join(OUT_APP, 'src'));

// assets/
copyDir(path.join(ROOT, 'assets'), path.join(OUT_APP, 'assets'));

// ============ 6. Собираем prod-зависимости транзитивно ============
log('deps', 'Собираю prod-зависимости транзитивно…');
const SRC_NM = path.join(ROOT, 'node_modules');
const DST_NM = path.join(OUT_APP, 'node_modules');
fs.mkdirSync(DST_NM, { recursive: true });

// Собираем имена всех транзитивных зависимостей
function readPkg(name) {
  const p = path.join(SRC_NM, name, 'package.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

const queue = [...PROD_DEPS];
const seen = new Set();
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  const pkg = readPkg(name);
  if (!pkg) {
    // Может быть scope (@foo/bar) или вложенная — пропустим, попробуем поискать вложенно
    continue;
  }
  seen.add(name);
  const deps = pkg.dependencies || {};
  for (const d of Object.keys(deps)) {
    if (!seen.has(d)) queue.push(d);
  }
}

log('deps', `Найдено ${seen.size} пакетов`);

let copied = 0;
for (const name of seen) {
  const src = path.join(SRC_NM, name);
  const dst = path.join(DST_NM, name);
  if (!fs.existsSync(src)) continue;
  // Создаём scope-папку если нужно
  if (name.includes('/')) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
  }
  copyDir(src, dst);
  copied++;
}
log('deps', `Скопировано ${copied} пакетов`);

// ============ 7. Подмена иконки в exe ============
log('icon', 'Меняю иконку exe…');
{
  const rcedit = path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const iconPath = path.join(ROOT, 'assets', 'icon.ico');

  if (!fs.existsSync(rcedit)) {
    log('icon', `пропуск: rcedit не найден (${rcedit}). Запусти: npm install --save-dev rcedit`);
  } else if (!fs.existsSync(iconPath)) {
    log('icon', `пропуск: ${iconPath} не существует. Запусти: npm run icons`);
  } else {
    try {
      execFileSync(rcedit, [
        newExe,
        '--set-icon', iconPath,
        '--set-version-string', 'CompanyName', 'GlassCraft',
        '--set-version-string', 'FileDescription', 'GlassCraft Launcher',
        '--set-version-string', 'ProductName', 'GlassCraft',
        '--set-version-string', 'OriginalFilename', 'GlassCraft.exe',
        '--set-version-string', 'InternalName', 'GlassCraft',
        '--set-file-version', '0.1.0.0',
        '--set-product-version', '0.1.0.0',
      ], { stdio: 'inherit' });
      log('icon', 'OK — иконка прибита к exe');
    } catch (e) {
      log('icon', `ошибка rcedit: ${e.message}`);
    }
  }
}

function findFile(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name === name) return full;
    }
  }
  return null;
}

// ============ 8. Готово ============
// Обновляем "указатель" GlassCraft-win32-x64 на свежую сборку
try {
  // Сначала пробуем удалить старый указатель (junction/симлинк/папку)
  if (fs.existsSync(LATEST_LINK)) {
    const stat = fs.lstatSync(LATEST_LINK);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      try { fs.rmSync(LATEST_LINK, { recursive: true, force: true }); } catch {}
    }
  }
  // Создаём junction (не требует админ-прав в отличие от symlink)
  if (!fs.existsSync(LATEST_LINK)) {
    fs.symlinkSync(OUT, LATEST_LINK, 'junction');
    log('link', `GlassCraft-win32-x64 → ${path.basename(OUT)}`);
  }
} catch (e) {
  log('link', `пропуск: ${e.message}`);
}

log('done', `Сборка готова: ${OUT}`);
log('done', `Запуск: ${path.join(OUT, APP_NAME + '.exe')}`);
log('done', `Или: ${path.join(LATEST_LINK, APP_NAME + '.exe')}`);
