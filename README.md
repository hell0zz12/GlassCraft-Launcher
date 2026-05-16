# GlassCraft Launcher

<p align="center">
  <img src="assets/icon.svg" width="120" alt="GlassCraft logo">
</p>

<p align="center">
  <b>Лаунчер Minecraft в стиле Apple Liquid Glass</b><br>
  Modrinth · Fabric · встроенный менеджер Java · Discord RPC · tray-контроль
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img src="https://img.shields.io/badge/electron-31-purple.svg">
  <img src="https://img.shields.io/badge/platform-windows-lightgrey.svg">
</p>

---

## Возможности

- **Запуск любой версии Minecraft** — клиент скачивается напрямую с серверов Mojang
- **Modrinth API** — установка модов, ресурс-паков и шейдеров в один клик
- **Fabric из коробки** — выбор Loader-версии прямо на главной
- **Кастомные версии** — импорт собственных профилей (Forge, NeoForge, Authlib, OptiFine и др.)
- **Менеджер Java** — Java 8/17/21 устанавливаются прямо из лаунчера через Eclipse Adoptium
- **Discord Rich Presence** — статус «В лаунчере / Играет в Minecraft»
- **System Tray** — контроль игры из системного трея
- **Liquid Glass UI** — нативный размытый фон Windows (Acrylic) и macOS (Vibrancy), Apple-стилистика, SF Pro Rounded
- **Offline-режим** — никаких аккаунтов не требуется

## Скриншоты

<details>
<summary>Открыть</summary>

> Тут будут скриншоты после первого билда. PR с картинками приветствуется.

</details>

## Установка

### Из исходников (требуется Node.js 20+)

```bash
git clone https://github.com/<your-username>/glasscraft.git
cd glasscraft
npm install
npm start
```

### Сборка portable Windows-версии

```bash
build.bat
```

или

```bash
npm run icons     # генерация иконок из assets/icon.svg
npm run build     # сборка
```

Результат: `build/GlassCraft-latest/GlassCraft.exe`. Папку можно копировать целиком — портативная.

## Структура проекта

```
src/
├── main.js              # Electron main: IPC, Modrinth, Fabric, Java manager, tray, Discord RPC
├── preload.js           # contextBridge API
├── discord.js           # Discord Rich Presence
└── renderer/
    ├── index.html
    ├── app.js
    └── styles/
        ├── fonts.css    # SF Pro Rounded font stack
        └── main.css     # Liquid Glass стили + анимации

scripts/
├── package-app.js       # кастомный packager (без electron-packager-багов)
└── build-icons.js       # генерация PNG/ICO из icon.svg

assets/
└── icon.svg             # исходник логотипа

landing/
├── index.html           # лендинг для GitHub Pages
├── styles.css
└── script.js
```

## Где живут данные пользователя

- `~/.glasscraft/profile.json` — имя игрока, настройки профиля
- `~/.glasscraft/settings.json` — память, путь к Java, игровая директория
- `~/.glasscraft/installed.json` — реестр установленных модов с Modrinth
- `~/.glasscraft/java/<major>/` — встроенные сборки Java (Adoptium)
- `~/.glasscraft/minecraft/` — игровая директория (`versions/`, `mods/`, `assets/`, `libraries/`)
- `~/.glasscraft/launcher.log` — лог запусков и ошибок

## Конфигурация Discord Rich Presence

В `src/discord.js` стоит placeholder Client ID. Чтобы появилась картинка приложения:

1. Создай новое приложение на https://discord.com/developers/applications
2. Rich Presence → Art Assets → загрузи иконку 512×512 с именем `glasscraft_logo`
3. Скопируй Application ID и замени `CLIENT_ID` в `src/discord.js`

Если Discord не запущен или RPC отключён в настройках Discord — лаунчер просто пропустит шаг, без ошибок.

## Стек

- **[Electron 31](https://www.electronjs.org/)** — runtime
- **[minecraft-launcher-core](https://www.npmjs.com/package/minecraft-launcher-core)** — запуск Minecraft
- **[Modrinth API](https://docs.modrinth.com/)** — поиск и установка контента
- **[Fabric Meta API](https://meta.fabricmc.net/)** — версии Fabric Loader
- **[Eclipse Adoptium API](https://api.adoptium.net/)** — скачивание Java
- **[discord-rpc](https://www.npmjs.com/package/discord-rpc)** — Rich Presence
- **[@resvg/resvg-js](https://www.npmjs.com/package/@resvg/resvg-js)** + **[png-to-ico](https://www.npmjs.com/package/png-to-ico)** — генерация иконок

## Сборка релиза

Для распространения готового exe-файла используй portable build:

```bash
build.bat
```

В `build/GlassCraft-latest/` лежит самодостаточная папка с `GlassCraft.exe`. Можно заархивировать в zip и приложить к GitHub Release.

## Известные проблемы

- На Windows 7/8 не работает acrylic-эффект (нужна Win10+)
- При ошибке `EPERM/EBUSY` во время сборки — закрой проводник на папке `build/` и попробуй снова. Windows Defender может временно блокировать запись в свежий exe.
- Кастомные версии без `inheritsFrom` не запускаются автоматически — лаунчер попросит указать базовую vanilla-версию через диалог. Этот выбор записывается в манифест.

## Лицензия

[MIT](LICENSE) © GlassCraft contributors

## Дисклеймер

Minecraft — торговая марка Mojang Studios. Этот проект не аффилирован с Mojang/Microsoft.
Используя лаунчер, вы соглашаетесь соблюдать [Minecraft EULA](https://www.minecraft.net/eula).
