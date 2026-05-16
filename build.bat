@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ============================================
echo   GlassCraft Launcher - Build
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

echo [1/3] Закрываю запущенные копии лаунчера...
taskkill /F /IM GlassCraft.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Генерация иконок...
call npm run icons
if errorlevel 1 (
    echo ОШИБКА генерации иконок
    pause
    exit /b 1
)

echo.
echo [3/3] Сборка приложения...
echo.

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
echo.
echo Папка:  build\GlassCraft-latest\
echo Запуск: build\GlassCraft-latest\GlassCraft.exe
echo.

pause
