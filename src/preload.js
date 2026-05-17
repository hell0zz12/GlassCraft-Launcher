const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Profile / settings
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (p) => ipcRenderer.invoke('profile:save', p),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  browseJava: () => ipcRenderer.invoke('settings:browseJava'),

  // Minecraft
  getVersions: () => ipcRenderer.invoke('mc:versions'),
  launch: (args) => ipcRenderer.invoke('mc:launch', args),

  // Custom versions
  listCustomVersions: (args) => ipcRenderer.invoke('versions:listCustom', args),
  importVersion: (args) => ipcRenderer.invoke('versions:import', args),
  deleteCustomVersion: (args) => ipcRenderer.invoke('versions:delete', args),
  setVersionBase: (args) => ipcRenderer.invoke('versions:setBase', args),
  openVersionsFolder: (args) => ipcRenderer.invoke('versions:openFolder', args),

  // Fabric
  getFabricLoaders: (gameVersion) => ipcRenderer.invoke('fabric:loaders', gameVersion),
  getFabricGameVersions: () => ipcRenderer.invoke('fabric:gameVersions'),

  // Java
  listJava: () => ipcRenderer.invoke('java:list'),
  recommendJava: (mcVersion) => ipcRenderer.invoke('java:recommendFor', mcVersion),
  installJava: (args) => ipcRenderer.invoke('java:install', args),
  openJavaFolder: () => ipcRenderer.invoke('java:openFolder'),

  // Modrinth
  search: (args) => ipcRenderer.invoke('modrinth:search', args),
  getProject: (slug) => ipcRenderer.invoke('modrinth:project', slug),
  getProjectVersions: (args) => ipcRenderer.invoke('modrinth:versions', args),
  install: (args) => ipcRenderer.invoke('modrinth:install', args),

  // Content
  listContent: (args) => ipcRenderer.invoke('content:list', args),
  deleteContent: (args) => ipcRenderer.invoke('content:delete', args),
  openContentFolder: (args) => ipcRenderer.invoke('content:openFolder', args),
  listInstalled: (args) => ipcRenderer.invoke('installed:list', args),

  // Events
  onInstallProgress: (cb) => ipcRenderer.on('install:progress', (_, d) => cb(d)),
  onJavaProgress: (cb) => ipcRenderer.on('java:progress', (_, d) => cb(d)),
  onMcLog: (cb) => ipcRenderer.on('mc:log', (_, d) => cb(d)),
  onMcProgress: (cb) => ipcRenderer.on('mc:progress', (_, d) => cb(d)),
  onMcClose: (cb) => ipcRenderer.on('mc:close', (_, d) => cb(d)),
  onTrayLaunch: (cb) => ipcRenderer.on('tray:launch', () => cb()),

  // Discord RPC
  setDiscordSection: (section) => ipcRenderer.invoke('discord:setSection', section),

  // Game control
  stopGame: () => ipcRenderer.invoke('app:stopGame'),

  // App / updates
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  cleanLogs: () => ipcRenderer.invoke('app:cleanLogs'),
  onUpdateAvailable: (cb) => ipcRenderer.on('app:updateAvailable', (_, d) => cb(d)),

  // Notifications
  notify: (args) => ipcRenderer.invoke('notify', args),
  setNotifications: (enabled) => ipcRenderer.invoke('notify:setEnabled', enabled),

  // Modpacks
  searchModpacks: (args) => ipcRenderer.invoke('modrinth:searchModpacks', args),
  installModpack: (args) => ipcRenderer.invoke('modpack:install', args),
  importModpackLocal: (args) => ipcRenderer.invoke('modpack:importLocal', args),
  listModpacks: () => ipcRenderer.invoke('modpacks:list'),
  onModpackProgress: (cb) => ipcRenderer.on('modpack:progress', (_, d) => cb(d)),
});
