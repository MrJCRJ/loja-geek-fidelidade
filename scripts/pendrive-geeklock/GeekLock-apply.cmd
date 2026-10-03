@echo off
setlocal EnableExtensions
REM Aplicador empacotado com o ZIP — o GeekLock 1.1.12+ chama este script apos baixar.
REM Uso: GeekLock-apply.cmd "C:\caminho\payload" "C:\GeekLock"

set "SRC=%~1"
set "DST=%~2"
if "%SRC%"=="" exit /b 1
if "%DST%"=="" exit /b 1
if not exist "%SRC%\GeekLock.exe" (
  echo SRC sem GeekLock.exe > "%TEMP%\geeklock-apply-fail.txt"
  exit /b 2
)

timeout /t 2 /nobreak >nul
taskkill /IM GeekLock.exe /F >nul 2>&1
timeout /t 6 /nobreak >nul

if exist "%DST%\GeekLock.exe" (
  del /f /q "%DST%\GeekLock.exe.bak" >nul 2>&1
  ren "%DST%\GeekLock.exe" "GeekLock.exe.bak" >nul 2>&1
)

robocopy "%SRC%" "%DST%" /E /IS /IT /XF config.json GeekLock-apply.cmd /XD data /R:8 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np
set "RC=%ERRORLEVEL%"

if exist "%DST%\GeekLock.exe.bak" del /f /q "%DST%\GeekLock.exe.bak" >nul 2>&1

if exist "%DST%\GeekLock.exe" (
  start "" /D "%DST%" "%DST%\GeekLock.exe"
  exit /b 0
)

echo GeekLock.exe ausente apos robocopy rc=%RC% > "%TEMP%\geeklock-apply-fail.txt"
if exist "%DST%\GeekLock.exe.bak" (
  ren "%DST%\GeekLock.exe.bak" "GeekLock.exe" >nul 2>&1
)
exit /b 3
