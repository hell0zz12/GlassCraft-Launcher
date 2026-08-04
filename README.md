<div align="center">

<img src="assets/icon.svg" width="120" alt="GlassCraft">

# GlassCraft Launcher

**Лаунчер Minecraft в стиле Apple Liquid Glass**

Modrinth · Fabric · встроенный менеджер Java · Discord RPC · System Tray

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-31-9feaf9?style=flat-square)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows-0a84ff?style=flat-square)]()

</div>

---

## Возможности

- **Любая версия Minecraft.** Клиент скачивается с CDN Mojang.
- **Modrinth API.** Поиск и установка модов, ресурс-паков, шейдеров одним кликом.
- **Fabric из коробки.** Выбор Loader-версии прямо на главной.
- **Кастомные версии.** Импорт Forge / NeoForge / OptiFine / Authlib и любых других профилей.
- **Менеджер Java.** Java 8/17/21 ставятся прямо из лаунчера через Eclipse Adoptium.
- **Discord Rich Presence.** Статус «В лаунчере / Играет в Minecraft».
- **System Tray.** Запуск, остановка и переход к лаунчеру из системного трея.
- **Liquid Glass UI.** Нативный Acrylic на Windows и Vibrancy на macOS, SF Pro Rounded.
- **Offline-режим.** Работает без аккаунтов сразу из коробки.

---

## Запуск

Нужен **Node.js 20+**.

```bash
git clone https://github.com/hell0zz12/GlassCraft-Launcher.git
cd GlassCraft-Launcher
npm install
npm start
```

История изменений: [CHANGELOG.md](CHANGELOG.md).

---

## Сборка

Двойной клик по `build.bat`, либо:

```bash
npm run icons
npm run build
```

Результат для Windows лежит в `dist/`: portable `.exe` и `.zip`.

Платформенные сборки:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

DMG собирается на macOS, AppImage/deb — на Linux. Workflow `.github/workflows/build.yml` запускает все платформы и прикладывает артефакты к тегам `v*`.

`npm run release` требует чистое рабочее дерево: команда поднимает patch-версию, запускает тесты и Windows-сборку, создаёт коммит и тег. Публикацию артефактов завершает GitHub Actions.

---

## Структура

```
src/
├── main.js              Electron main: IPC, Modrinth, Fabric, Java, Tray, Discord
├── core.js              Валидация настроек, URL и безопасные файловые пути
├── preload.js           contextBridge API
├── discord.js           Discord Rich Presence
└── renderer/            UI (HTML + CSS + vanilla JS)

scripts/
├── package-app.js       прежний ручной Windows-сборщик
└── build-icons.js       генерация PNG/ICO из icon.svg

assets/icon.svg          исходник логотипа
landing/                 лендинг для GitHub Pages
```

---

## Данные пользователя

Лаунчер хранит свои данные в `~/.glasscraft/`:

| Файл / папка | Что внутри |
|---|---|
| `profile.json` | Имя игрока |
| `settings.json` | Память, Java, директория игры |
| `installed.json` | Реестр установленных модов |
| `java/` | Встроенные Java-сборки Adoptium |
| `minecraft/` | Игровая директория |
| `launcher.log` | Лог запусков |
| `accounts.json` | Локальные offline-профили |
| `servers.json` | Сохранённые серверы |
| `playtime.json` | Время игры по версиям |
| `modpacks.json` | Реестр установленных модпаков |

---

## Discord Rich Presence

В `src/discord.js` стоит placeholder Client ID. Чтобы появилась картинка:

1. Создай приложение на [discord.com/developers/applications](https://discord.com/developers/applications)
2. Rich Presence → Art Assets → загрузи иконку 512×512 с именем `glasscraft_logo`
3. Скопируй Application ID и замени `CLIENT_ID` в `src/discord.js`

Если Discord не запущен — лаунчер просто пропустит шаг.

---

## Стек

[Electron](https://www.electronjs.org/) · [minecraft-launcher-core](https://www.npmjs.com/package/minecraft-launcher-core) · [Modrinth API](https://docs.modrinth.com/) · [Fabric Meta API](https://meta.fabricmc.net/) · [Adoptium API](https://api.adoptium.net/) · [discord-rpc](https://www.npmjs.com/package/discord-rpc)

---

## Известные проблемы

- Acrylic-эффект работает только на Windows 10+; на macOS используется vibrancy, на Linux — непрозрачный фон
- macOS-сборки пока не подписаны и не notarized, поэтому Gatekeeper может запросить ручное подтверждение
- Linux tray зависит от окружения рабочего стола и установленной реализации StatusNotifier/AppIndicator
- Кастомные версии без `inheritsFrom` — лаунчер запросит базовую vanilla-версию через диалог
- `minecraft-launcher-core` тянет устаревшие транзитивные зависимости; сетевые и файловые входы ограничены, но движок запуска планируется заменить

---

## Лицензия

[MIT](LICENSE) · Minecraft is a trademark of Mojang Studios. Not affiliated.
