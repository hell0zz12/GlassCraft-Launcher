/* Discord Rich Presence для GlassCraft.
 * Если Discord не запущен — тихо пропускает.
 * Можно отключить через settings.discordRpc = false.
 */
const RPC = require('discord-rpc');

// Публичный Client ID нашего Discord-приложения. Если хочешь свою картинку — создай
// своё application на https://discord.com/developers/applications, загрузи туда лого
// под именем `glasscraft_logo` и поменяй CLIENT_ID на свой.
const CLIENT_ID = '1505270597947752478'; // placeholder — будет работать без иконок

let rpc = null;
let connected = false;
let connecting = false;
let startTimestamp = null;
let lastActivity = null;

function safeSet(activity) {
  if (!rpc || !connected) return;
  try {
    rpc.setActivity(activity);
    lastActivity = activity;
  } catch (e) {
    // тихо игнорируем
  }
}

async function connect() {
  if (connected || connecting) return;
  connecting = true;
  try {
    RPC.register(CLIENT_ID);
  } catch {}
  rpc = new RPC.Client({ transport: 'ipc' });
  rpc.on('ready', () => {
    connected = true;
    connecting = false;
    startTimestamp = Math.round(Date.now() / 1000);
    setIdle();
  });
  rpc.on('disconnected', () => {
    connected = false;
  });
  try {
    await rpc.login({ clientId: CLIENT_ID });
  } catch (e) {
    // Discord не запущен или нет соединения — тихо пропускаем
    connected = false;
    connecting = false;
    rpc = null;
  }
}

function disconnect() {
  if (rpc) {
    try { rpc.destroy(); } catch {}
    rpc = null;
    connected = false;
  }
}

function setIdle() {
  safeSet({
    details: 'В лаунчере',
    state: 'GlassCraft Launcher',
    largeImageKey: 'glasscraft_logo',
    largeImageText: 'GlassCraft',
    startTimestamp,
    instance: false,
  });
}

function setBrowsing(section) {
  const map = {
    play: 'Главная',
    mods: 'Просматривает моды',
    resourcepacks: 'Просматривает ресурс-паки',
    shaders: 'Просматривает шейдеры',
    library: 'Библиотека',
    settings: 'Настройки',
  };
  safeSet({
    details: map[section] || 'В лаунчере',
    state: 'GlassCraft Launcher',
    largeImageKey: 'glasscraft_logo',
    largeImageText: 'GlassCraft',
    startTimestamp,
    instance: false,
  });
}

function setInGame(versionId, loader) {
  const loaderName = loader && loader !== 'vanilla'
    ? `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`
    : 'Vanilla';
  safeSet({
    details: `Играет в Minecraft`,
    state: `${versionId} · ${loaderName}`,
    largeImageKey: 'glasscraft_logo',
    largeImageText: 'GlassCraft',
    smallImageKey: 'minecraft',
    smallImageText: 'Minecraft',
    startTimestamp: Math.round(Date.now() / 1000),
    instance: true,
  });
}

module.exports = {
  connect,
  disconnect,
  setIdle,
  setBrowsing,
  setInGame,
  isConnected: () => connected,
};
