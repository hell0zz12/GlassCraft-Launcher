@echo off
setlocal
chcp 65001 >nul
title GlassCraft Build
pushd "%~dp0" || goto path_error

echo.
echo ============================================
echo   GlassCraft Launcher
echo ============================================
echo.

where node >nul 2>&1 || goto node_missing
where npm >nul 2>&1 || goto npm_missing
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto node_unknown
if %NODE_MAJOR% LSS 20 goto node_old

if not exist "node_modules\electron\package.json" (
    echo Зависимости не установлены. Выполняю npm ci...
    call npm ci
    if errorlevel 1 goto build_error
)

set /p RELEASE_CHOICE="Выложить релиз на GitHub? (y/N): "

if /i "%RELEASE_CHOICE%"=="y" goto release

REM ===== Локальный билд =====
echo.
echo Локальная сборка...
echo.

taskkill /F /IM GlassCraft.exe >nul 2>&1
timeout /t 1 /nobreak >nul

call npm run icons
if errorlevel 1 (
    echo ОШИБКА генерации иконок
    goto build_error
)

call npm run build
if errorlevel 1 (
    echo ОШИБКА сборки
    goto build_error
)

echo.
echo ============================================
echo   Готово!
echo ============================================
echo Артефакты: dist\
echo.
pause
popd
exit /b 0


REM ===== Релиз =====
:release
echo.
echo ============================================
echo   Публикация релиза
echo ============================================
echo.

where gh >nul 2>&1
if errorlevel 1 (
    echo.
    echo ✗ GitHub CLI ^(gh^) не установлен.
    echo   Установка:    winget install GitHub.cli
    echo   Авторизация:  gh auth login
    goto build_error
)

REM release-скрипт делает bump → test → Windows build → commit/tag/push.
REM GitHub Actions собирает и публикует артефакты всех ОС.
call npm run release
if errorlevel 1 (
    echo.
    echo ОШИБКА публикации релиза. Смотри лог выше.
    goto build_error
)

echo.
pause
popd
exit /b 0

:node_missing
echo ОШИБКА: Node.js не найден.
echo Установи Node.js 20 или новее: https://nodejs.org/
goto build_error

:npm_missing
echo ОШИБКА: npm не найден. Переустанови Node.js с npm.
goto build_error

:node_old
echo ОШИБКА: требуется Node.js 20 или новее. Установлена версия:
node --version
goto build_error

:node_unknown
echo ОШИБКА: не удалось определить версию Node.js.
goto build_error

:path_error
echo ОШИБКА: не удалось открыть папку проекта: %~dp0
goto error_no_popd

:build_error
popd
:error_no_popd
echo.
echo Операция не выполнена. Смотри сообщение выше.
pause
exit /b 1
