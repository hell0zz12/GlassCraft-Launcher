const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  normalizeSettings,
  safeComponent,
  safeRelativePath,
  validateHttpsUrl,
  validateUsername,
} = require('../src/core');

test('safeRelativePath keeps paths below the root', () => {
  const root = path.resolve('tmp-root');
  assert.equal(safeRelativePath(root, 'mods/example.jar'), path.join(root, 'mods', 'example.jar'));
  for (const unsafe of ['../file', 'mods/../../file', '/absolute', 'C:\\file', '\\\\server\\share', 'a//b']) {
    assert.throws(() => safeRelativePath(root, unsafe));
  }
});

test('safeComponent rejects traversal and separators', () => {
  assert.equal(safeComponent('1.21.1'), '1.21.1');
  for (const unsafe of ['', '.', '..', '../x', 'a/b', 'a\\b']) assert.throws(() => safeComponent(unsafe));
});

test('offline usernames follow Minecraft constraints', () => {
  assert.equal(validateUsername('Steve_123'), 'Steve_123');
  assert.throws(() => validateUsername('ab'));
  assert.throws(() => validateUsername('Игрок'));
});

test('settings are clamped and unknown properties are discarded', () => {
  const settings = normalizeSettings({
    memory: { min: '8G', max: '2G' },
    windowWidth: 99,
    lang: 'unknown',
    gameDir: 'relative',
    surprise: true,
  }, path.resolve('minecraft'));
  assert.deepEqual(settings.memory, { min: '8G', max: '8G' });
  assert.equal(settings.windowWidth, 320);
  assert.equal(settings.lang, 'ru');
  assert.equal(settings.gameDir, path.resolve('minecraft'));
  assert.equal('surprise' in settings, false);
});

test('external URLs require HTTPS and an allowed host', () => {
  assert.equal(validateHttpsUrl('https://github.com/example/repo', ['github.com']).hostname, 'github.com');
  assert.throws(() => validateHttpsUrl('file:///tmp/a', ['github.com']));
  assert.throws(() => validateHttpsUrl('https://example.com', ['github.com']));
});
