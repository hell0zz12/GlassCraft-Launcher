@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ============================================
echo   GlassCraft - Push to GitHub
echo ============================================
echo.

REM ---- Проверка git ----
where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo ОШИБКА: git не найден. Поставь Git: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

REM ---- Инициализация репо если ещё нет ----
if not exist ".git" (
    echo Локальный репозиторий не найден. Инициализирую...
    git init -b main
    if errorlevel 1 (
        echo ОШИБКА git init
        pause
        exit /b 1
    )
)

REM ---- Проверим есть ли remote origin ----
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo.
    echo Remote origin не настроен.
    set /p REMOTE_URL="Введи URL репозитория ^(https://github.com/USER/REPO.git^): "
    if "%REMOTE_URL%"=="" (
        echo Пустой URL, выход.
        pause
        exit /b 1
    )
    git remote add origin %REMOTE_URL%
    if errorlevel 1 (
        echo ОШИБКА: не удалось добавить remote
        pause
        exit /b 1
    )
)

REM ---- Сообщение коммита ----
echo.
set /p COMMIT_MSG="Сообщение коммита (Enter = 'Update'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update

REM ---- Добавление и коммит ----
echo.
echo [1/3] git add .
git add .
if errorlevel 1 (
    echo ОШИБКА git add
    pause
    exit /b 1
)

echo [2/3] git commit -m "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo Нечего коммитить ^(возможно, изменений нет^). Продолжаю на push.
)

REM ---- Определяем текущую ветку ----
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if "%BRANCH%"=="" set BRANCH=main

REM ---- Пуш ----
echo.
echo [3/3] git push origin %BRANCH%
git push -u origin %BRANCH%
if errorlevel 1 (
    echo.
    echo ОШИБКА push. Возможно, нужно залогиниться.
    echo.
    echo Если просит логин/пароль:
    echo   - Логин:  твой GitHub username
    echo   - Пароль: Personal Access Token ^(https://github.com/settings/tokens^)
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Готово!
echo ============================================
echo.
for /f "delims=" %%u in ('git remote get-url origin') do echo Репозиторий: %%u
echo.

pause
