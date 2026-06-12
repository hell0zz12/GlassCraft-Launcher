@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ============================================
echo   GlassCraft Launcher
echo ============================================
echo.

if not exist "node_modules" (
    echo Зависимости не установлены. Устанавливаю...
    call npm install
    if errorlevel 1 (
        echo ОШИБКА npm install
        pause
        exit /b 1
    )
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
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo ОШИБКА сборки
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Готово!
echo ============================================
echo Папка:  build\GlassCraft-latest\
echo Запуск: build\GlassCraft-latest\GlassCraft.exe
echo.
pause
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
    pause
    exit /b 1
)

REM release-скрипт сам сделает: bump → icons → build → zip → push → release
call npm run release
if errorlevel 1 (
    echo.
    echo ОШИБКА публикации релиза. Смотри лог выше.
    pause
    exit /b 1
)

echo.
pause
