# Contributing

Спасибо за интерес к GlassCraft! Принимаем PR и issues.

## Локальный запуск

```bash
npm install
npm start
```

С DevTools:

```bash
npm run dev
```

## Структура

- `src/main.js` — Electron main, IPC, всё что про систему
- `src/preload.js` — мост renderer ↔ main
- `src/discord.js` — Discord RPC
- `src/renderer/` — UI (HTML + CSS + vanilla JS, без сборщиков)
- `scripts/` — packager и генератор иконок

## Стиль кода

- Без сборщиков на стороне renderer — пишем чистый ES6+ JS
- Все взаимодействия с системой — только через IPC, renderer не имеет node-доступа
- CSS-переменные определены в `:root` в `main.css` — переиспользуй их
- Анимации — только через CSS transitions с easing-переменными `--ease-out` / `--ease-spring`

## Перед PR

1. `npm start` — проверь, что лаунчер запускается без ошибок в консоли
2. `npm run icons && npm run build` — проверь, что сборка собирается
3. Запусти `build/GlassCraft-latest/GlassCraft.exe` — проверь, что собранный exe тоже работает
4. Проверь основные сценарии: запуск vanilla, Fabric, поиск на Modrinth, переключение страниц

## Идеи для контрибуций

- Microsoft / Xbox login (через `@xmcl/user`)
- Forge installer integration
- Auto-update лаунчера
- Локализация
- macOS / Linux сборки
- Импорт/экспорт профилей
- Кастомизация темы

## Отчёты о багах

Прикладывай:
- ОС и версия Windows
- Версия лаунчера (видно в `package.json`)
- Последние 50 строк из `~/.glasscraft/launcher.log`
- Шаги воспроизведения

