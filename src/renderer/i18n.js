/* Простая i18n-система. Ключи в формате 'category.key'.
 * Переключение языка через state.settings.lang ('ru' | 'en').
 * После смены языка — t() возвращает новые строки, нужно перерендерить UI
 * через applyI18n() для всех элементов с data-i18n.
 */

const dictionaries = {
  ru: {
    'nav.play': 'Играть',
    'nav.mods': 'Моды',
    'nav.resourcepacks': 'Ресурс-паки',
    'nav.shaders': 'Шейдеры',
    'nav.modpacks': 'Модпаки',
    'nav.library': 'Библиотека',
    'nav.settings': 'Настройки',

    'play.ready': 'Готов к запуску',
    'play.title': 'Minecraft',
    'play.sub': 'Выбери версию, загрузчик и нажми «Играть».',
    'play.version': 'Версия',
    'play.loader': 'Загрузчик',
    'play.loaderVersion': 'Версия загрузчика',
    'play.button': 'Играть',
    'play.stopButton': 'Закрыть игру',
    'play.installJava': 'Установить Java',
    'play.javaReady': 'Готов · Java {n}',
    'play.javaCustom': 'Готов · своя Java',
    'play.javaNeed': 'Нужна Java {n}',

    'page.mods.sub': 'Поиск через Modrinth API',
    'page.resourcepacks.sub': 'Текстуры и звуки от сообщества',
    'page.shaders.sub': 'Графические эффекты для Iris/OptiFine',
    'page.modpacks.sub': 'Готовые сборки модов',
    'page.library.sub': 'Установленный контент',
    'page.settings.sub': 'Профиль, Java и параметры запуска',

    'search.mods': 'Поиск модов',
    'search.resourcepacks': 'Поиск ресурс-паков',
    'search.shaders': 'Поиск шейдеров',
    'search.modpacks': 'Поиск модпаков',
    'search.allVersions': 'Все версии',
    'search.allLoaders': 'Все загрузчики',

    'lib.openFolder': 'Открыть папку',
    'lib.empty': 'Тут пока пусто. Установи что-нибудь со страницы поиска',

    'btn.install': 'Установить',
    'btn.reinstall': 'Переустановить',
    'btn.installed': 'Установлено',
    'btn.delete': 'Удалить',
    'btn.cancel': 'Отмена',
    'btn.save': 'Сохранить',
    'btn.close': 'Закрыть',
    'btn.update': 'Обновить',
    'btn.browse': 'Обзор',
    'btn.add': 'Добавить версию',

    'settings.profile': 'Профиль',
    'settings.username': 'Имя игрока',
    'settings.theme': 'Тема оформления',
    'settings.themeSub': 'Стиль интерфейса лаунчера',
    'settings.lang': 'Язык',
    'settings.langSub': 'Language / Язык',
    'settings.java': 'Java',
    'settings.javaSub': 'Скачивается с Eclipse Adoptium',
    'settings.javaPath': 'Свой путь к java.exe (необязательно)',
    'settings.javaAuto': 'Авто (использовать встроенную)',
    'settings.memMin': 'Минимум памяти',
    'settings.memMax': 'Максимум памяти',
    'settings.memAuto': 'Автоматически',
    'settings.gameDir': 'Игровая директория',
    'settings.folders': 'Папки',
    'settings.customVersions': 'Свои версии',
    'settings.about': 'О лаунчере',
    'settings.advanced': 'Дополнительно',
    'settings.jvmArgs': 'JVM аргументы',
    'settings.jvmArgsSub': 'Передаются процессу Java при старте',
    'settings.windowMode': 'Режим окна Minecraft',
    'settings.windowed': 'Окно',
    'settings.fullscreen': 'Полный экран',
    'settings.borderless': 'Без рамки',
    'settings.windowSize': 'Размер окна',
    'settings.debugConsole': 'Показывать консоль отладки',
    'settings.debugConsoleSub': 'Окно с логами Java при запуске',
    'settings.autoCleanLogs': 'Авто-очистка старых логов',
    'settings.autoUpdate': 'Автопроверка обновлений',
    'settings.checkUpdate': 'Проверить обновление',
    'settings.saved': '✓ Сохранено',

    'modpack.install': 'Установить модпак',
    'modpack.import': 'Импорт .mrpack',
    'modpack.imported': 'Модпак импортирован',
    'modpack.installing': 'Установка модпака…',
    'modpack.includes': 'модов внутри: {n}',

    'update.available': 'Доступна новая версия',
    'update.current': 'У тебя {current}, на гитхабе {latest}',
    'update.openPage': 'Открыть страницу',
    'update.upToDate': 'Лаунчер обновлён до последней версии',
    'update.checkFailed': 'Не удалось проверить обновление',

    'notif.gameStarted': 'Minecraft запускается',
    'notif.gameStartedBody': '{version}',
    'notif.gameClosed': 'Игра закрыта',
    'notif.installed': '{name} установлен',
    'notif.error': 'Ошибка',
    'notif.javaInstalled': 'Java {n} установлена',
    'notif.minimized': 'Лаунчер свернулся в трей',

    'about.title': 'О GlassCraft',
    'about.version': 'Версия {v}',
    'about.tagline': 'Minecraft-лаунчер в стиле Apple Liquid Glass',
    'about.repo': 'Исходники',
    'about.report': 'Сообщить об ошибке',
    'about.license': 'MIT License',
    'about.disclaimer': 'Minecraft is a trademark of Mojang Studios. Not affiliated.',
  },

  en: {
    'nav.play': 'Play',
    'nav.mods': 'Mods',
    'nav.resourcepacks': 'Resource Packs',
    'nav.shaders': 'Shaders',
    'nav.modpacks': 'Modpacks',
    'nav.library': 'Library',
    'nav.settings': 'Settings',

    'play.ready': 'Ready to launch',
    'play.title': 'Minecraft',
    'play.sub': 'Pick a version, loader and click "Play".',
    'play.version': 'Version',
    'play.loader': 'Loader',
    'play.loaderVersion': 'Loader version',
    'play.button': 'Play',
    'play.stopButton': 'Stop game',
    'play.installJava': 'Install Java',
    'play.javaReady': 'Ready · Java {n}',
    'play.javaCustom': 'Ready · custom Java',
    'play.javaNeed': 'Java {n} required',

    'page.mods.sub': 'Search via Modrinth API',
    'page.resourcepacks.sub': 'Textures & sounds from the community',
    'page.shaders.sub': 'Graphics effects for Iris/OptiFine',
    'page.modpacks.sub': 'Pre-built mod collections',
    'page.library.sub': 'Installed content',
    'page.settings.sub': 'Profile, Java and launch options',

    'search.mods': 'Search mods',
    'search.resourcepacks': 'Search resource packs',
    'search.shaders': 'Search shaders',
    'search.modpacks': 'Search modpacks',
    'search.allVersions': 'All versions',
    'search.allLoaders': 'All loaders',

    'lib.openFolder': 'Open folder',
    'lib.empty': 'Empty so far. Install something from the search page',

    'btn.install': 'Install',
    'btn.reinstall': 'Reinstall',
    'btn.installed': 'Installed',
    'btn.delete': 'Delete',
    'btn.cancel': 'Cancel',
    'btn.save': 'Save',
    'btn.close': 'Close',
    'btn.update': 'Update',
    'btn.browse': 'Browse',
    'btn.add': 'Add version',

    'settings.profile': 'Profile',
    'settings.username': 'Player name',
    'settings.theme': 'Theme',
    'settings.themeSub': 'Interface style',
    'settings.lang': 'Language',
    'settings.langSub': 'Язык / Language',
    'settings.java': 'Java',
    'settings.javaSub': 'Downloaded from Eclipse Adoptium',
    'settings.javaPath': 'Custom java.exe path (optional)',
    'settings.javaAuto': 'Auto (use bundled)',
    'settings.memMin': 'Min memory',
    'settings.memMax': 'Max memory',
    'settings.memAuto': 'Automatic',
    'settings.gameDir': 'Game directory',
    'settings.folders': 'Folders',
    'settings.customVersions': 'Custom versions',
    'settings.about': 'About launcher',
    'settings.advanced': 'Advanced',
    'settings.jvmArgs': 'JVM args',
    'settings.jvmArgsSub': 'Passed to Java process at start',
    'settings.windowMode': 'Minecraft window mode',
    'settings.windowed': 'Windowed',
    'settings.fullscreen': 'Fullscreen',
    'settings.borderless': 'Borderless',
    'settings.windowSize': 'Window size',
    'settings.debugConsole': 'Show debug console',
    'settings.debugConsoleSub': 'Window with Java logs at start',
    'settings.autoCleanLogs': 'Auto-clean old logs',
    'settings.autoUpdate': 'Auto-check updates',
    'settings.checkUpdate': 'Check for updates',
    'settings.saved': '✓ Saved',

    'modpack.install': 'Install modpack',
    'modpack.import': 'Import .mrpack',
    'modpack.imported': 'Modpack imported',
    'modpack.installing': 'Installing modpack…',
    'modpack.includes': 'mods inside: {n}',

    'update.available': 'New version available',
    'update.current': 'You have {current}, GitHub has {latest}',
    'update.openPage': 'Open page',
    'update.upToDate': 'Launcher is up to date',
    'update.checkFailed': 'Failed to check for updates',

    'notif.gameStarted': 'Minecraft starting',
    'notif.gameStartedBody': '{version}',
    'notif.gameClosed': 'Game closed',
    'notif.installed': '{name} installed',
    'notif.error': 'Error',
    'notif.javaInstalled': 'Java {n} installed',
    'notif.minimized': 'Launcher minimized to tray',

    'about.title': 'About GlassCraft',
    'about.version': 'Version {v}',
    'about.tagline': 'Apple Liquid Glass-style Minecraft launcher',
    'about.repo': 'Source code',
    'about.report': 'Report a bug',
    'about.license': 'MIT License',
    'about.disclaimer': 'Minecraft is a trademark of Mojang Studios. Not affiliated.',
  },
};

let currentLang = 'ru';

function setLang(lang) {
  if (dictionaries[lang]) currentLang = lang;
}

function getLang() {
  return currentLang;
}

/* t('key') или t('key', { name: 'Sodium' }) */
function t(key, vars = {}) {
  const dict = dictionaries[currentLang] || dictionaries.ru;
  let s = dict[key] || dictionaries.ru[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return s;
}

/* Применяет переводы ко всем элементам [data-i18n] */
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}

// Экспортируем в глобал, доступно через window.i18n
window.i18n = { t, setLang, getLang, applyI18n };
