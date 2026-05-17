/* Native Windows toast notifications через Electron Notification API.
 * На Windows работает только если AppUserModelID правильно установлен (это делается в main.js).
 */
const { Notification } = require('electron');
const path = require('path');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon-128.png');

let enabled = true;
let recentTitles = new Map(); // защита от спама — повторные уведомления с тем же заголовком в течение 3 секунд игнорируются

function setEnabled(v) {
  enabled = !!v;
}

function isEnabled() {
  return enabled && Notification.isSupported();
}

function notify({ title, body, urgency = 'normal', silent = false, onClick }) {
  if (!isEnabled() || !title) return null;

  const now = Date.now();
  const last = recentTitles.get(title);
  if (last && now - last < 3000) return null;
  recentTitles.set(title, now);

  // Cleanup старых записей
  if (recentTitles.size > 50) {
    for (const [k, v] of recentTitles) {
      if (now - v > 10000) recentTitles.delete(k);
    }
  }

  const n = new Notification({
    title,
    body: body || '',
    icon: ICON_PATH,
    silent,
    urgency: urgency === 'critical' ? 'critical' : 'normal',
  });

  if (onClick) n.on('click', onClick);
  n.show();
  return n;
}

module.exports = { notify, setEnabled, isEnabled };
