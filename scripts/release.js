/* Релиз-скрипт GlassCraft.
 *
 * Делает:
 *  1. Проверки окружения (gh, git, remote)
 *  2. Бампит patch-версию в package.json
 *  3. Запускает npm run icons и npm run build с УЖЕ обновлённой версией
 *     (чтобы внутри собранного приложения было правильное число)
 *  4. Архивирует build/GlassCraft-latest в zip
 *  5. Коммитит, тегирует, пушит
 *  6. Публикует GitHub Release с зипом
 *
 * Требует: установленный gh (GitHub CLI), залогиненный через `gh auth login`.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

function log(stage, msg) {
  console.log(`[${stage}] ${msg}`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function commandExists(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'pipe' });
  return r.status === 0;
}

// ============ 1. Проверки окружения ============

if (!commandExists('gh')) {
  fail('Не установлен GitHub CLI (gh).\n  Поставь: winget install GitHub.cli\n  И залогинься: gh auth login');
}
if (!commandExists('git')) fail('Не установлен git.');

const remote = runCapture('git remote get-url origin');
if (!remote) fail('Нет remote origin. Сначала: git remote add origin https://github.com/USER/REPO.git');

const ghStatus = spawnSync('gh', ['auth', 'status'], { stdio: 'pipe' });
if (ghStatus.status !== 0) fail('GitHub CLI не залогинен. Сделай: gh auth login');

// ============ 2. Бамп версии ============

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
const oldVer = pkg.version;
const parts = oldVer.split('.').map((n) => parseInt(n, 10));
if (parts.length !== 3 || parts.some(isNaN)) fail(`Странная версия: ${oldVer}`);
parts[2]++; // patch+1
const newVer = parts.join('.');
pkg.version = newVer;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
log('version', `${oldVer} → ${newVer}`);

// ============ 3. Билд с уже обновлённой версией ============

log('build', 'Закрываю запущенные копии…');
spawnSync('taskkill', ['/F', '/IM', 'GlassCraft.exe'], { stdio: 'ignore' });

log('build', 'Генерирую иконки…');
run('npm run icons');

log('build', 'Собираю приложение…');
run('npm run build');

const BUILD_DIR = path.join(ROOT, 'build', 'GlassCraft-latest');
if (!fs.existsSync(path.join(BUILD_DIR, 'GlassCraft.exe'))) {
  fail(`Не найден ${BUILD_DIR}\\GlassCraft.exe после сборки.`);
}

// ============ 4. Архивация ============

const zipName = `GlassCraft-windows-x64-v${newVer}.zip`;
const zipPath = path.join(ROOT, 'build', zipName);
log('zip', `Архивирую → ${zipName}`);

const realBuildDir = fs.realpathSync(BUILD_DIR);
const zip = new AdmZip();
zip.addLocalFolder(realBuildDir, 'GlassCraft');
zip.writeZip(zipPath);
const sizeMB = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
log('zip', `Готово (${sizeMB} MB)`);

// ============ 5. Git commit + tag + push ============

const tag = `v${newVer}`;

log('git', 'Создаю коммит и тег…');
try {
  run(`git add package.json`);
  run(`git commit -m "Release ${tag}"`);
} catch {
  log('git', 'Нечего коммитить');
}

try { execSync(`git tag -d ${tag}`, { cwd: ROOT, stdio: 'ignore' }); } catch {}
run(`git tag -a ${tag} -m "Release ${tag}"`);

log('git', 'Пушу в origin…');

try {
  execSync('git pull --rebase origin HEAD', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  fail(`git pull --rebase упал. Реши конфликты вручную и запусти снова.\n${e.message}`);
}

run(`git push origin HEAD`);
run(`git push origin ${tag}`);

// ============ 6. GitHub Release ============

const releaseTitle = `GlassCraft ${tag}`;
const releaseNotes = `Auto-generated release ${tag}.\n\n**Установка:** скачай zip, распакуй и запусти \`GlassCraft.exe\`.`;

log('release', `Создаю GitHub Release ${tag}…`);

const existingCheck = spawnSync('gh', ['release', 'view', tag], { stdio: 'pipe' });
if (existingCheck.status === 0) {
  log('release', 'Релиз уже существует — обновляю asset');
  run(`gh release upload ${tag} "${zipPath}" --clobber`);
} else {
  run(`gh release create ${tag} "${zipPath}" --title "${releaseTitle}" --notes "${releaseNotes}"`);
}

// ============ 7. Готово ============

console.log('\n============================================');
console.log(`  ✓ Релиз ${tag} опубликован`);
console.log('============================================');
const repoUrl = remote.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');
console.log(`  ${repoUrl}/releases/tag/${tag}`);
console.log('');
