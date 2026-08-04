@echo off
setlocal
chcp 65001 >nul
title GlassCraft Debug
pushd "%~dp0" || goto :path_error

call :check_environment || goto :error

echo.
echo Запуск GlassCraft с DevTools...
call npm run dev
if errorlevel 1 goto :error

popd
exit /b 0

:check_environment
where node >nul 2>&1 || (
  echo ОШИБКА: Node.js не найден.
  echo Установи Node.js 20 или новее: https://nodejs.org/
  exit /b 1
)
where npm >nul 2>&1 || (
  echo ОШИБКА: npm не найден. Переустанови Node.js с npm.
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
  echo ОШИБКА: не удалось определить версию Node.js.
  exit /b 1
)
if %NODE_MAJOR% LSS 20 (
  echo ОШИБКА: требуется Node.js 20 или новее. Установлена версия:
  node --version
  exit /b 1
)
if not exist "node_modules\electron\package.json" (
  echo Зависимости не установлены. Выполняю npm ci...
  call npm ci
  if errorlevel 1 exit /b 1
)
exit /b 0

:path_error
echo ОШИБКА: не удалось открыть папку проекта: %~dp0
goto :error_no_popd

:error
popd
:error_no_popd
echo.
echo Debug-запуск не выполнен. Смотри сообщение выше.
pause
exit /b 1
