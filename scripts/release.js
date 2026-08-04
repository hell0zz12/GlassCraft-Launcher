/* Bumps the patch version, verifies the project, and pushes a release tag.
 * GitHub Actions builds and publishes platform artifacts from that tag.
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: ROOT,
  stdio: 'inherit',
  ...options,
});
const capture = (command, args) => execFileSync(command, args, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

if (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git']).status !== 0) {
  fail('Git не установлен.');
}
if (capture('git', ['status', '--porcelain'])) {
  fail('Рабочее дерево должно быть чистым перед релизом.');
}
if (!capture('git', ['remote', 'get-url', 'origin'])) {
  fail('Не настроен remote origin.');
}

const packagePath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const parts = pkg.version.split('.').map(Number);
if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
  fail(`Некорректная версия ${pkg.version}`);
}
parts[2] += 1;
const version = parts.join('.');
const tag = `v${version}`;

run('npm', ['version', version, '--no-git-tag-version']);
run('npm', ['test']);
run('npm', ['run', 'icons']);
run('npm', ['run', 'build:win', '--', '--publish', 'never']);

run('git', ['add', 'package.json', 'package-lock.json']);
run('git', ['commit', '-m', `Release ${tag}`]);
run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);
run('git', ['push', 'origin', 'HEAD']);
run('git', ['push', 'origin', tag]);

console.log(`\n${tag} отправлен. GitHub Actions соберёт Windows, macOS и Linux артефакты.\n`);
