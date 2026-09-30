@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
title GeekLock — instalador do pendrive
color 0A
cd /d "%~dp0"

set "GL_VER=1.1.8"
set "GL_SERVER=http://192.168.3.70:8787"
set "GL_HOST=192.168.3.70"
set "GL_DEST=C:\GeekLock"
set "GL_LOG=%TEMP%\geeklock-install.log"

call :LOG ==== GeekLock instalador iniciado ====
call :LOG bat=%~f0
call :LOG cwd=%CD%

echo.
echo  ========================================
echo    GeekLock %GL_VER% — instalador
echo  ========================================
echo.
echo  Destino : %GL_DEST%
echo  Central : %GL_SERVER%
echo  Log     : %GL_LOG%
echo.
echo  ATENCAO: apaga o GeekLock antigo e abre o CADASTRO.
echo.

net session >nul 2>&1
if %errorLevel%==0 goto :ADMIN

echo  [elevacao] Precisa de administrador. Abrindo o UAC...
echo             Clique em SIM.
echo.
call :LOG elevating via UAC

set "STAGE=%TEMP%\geeklock-inst"
if exist "%STAGE%" rd /s /q "%STAGE%"
mkdir "%STAGE%" >nul 2>&1
mkdir "%STAGE%\pack" >nul 2>&1

call :RESOLVE_SRC
if errorlevel 1 (
  echo  ERRO: GeekLock.exe nao encontrado neste pendrive.
  echo  Coloque o .bat na pasta GeekLock\ ou na raiz ao lado dela.
  call :LOG ERRO: fonte nao encontrada
  pause
  exit /b 1
)

echo  Preparando copia em TEMP...
robocopy "!SRC!" "%STAGE%\pack" /E /XF INSTALAR-GEEKLOCK.bat INSTALAR-GEEKLOCK.ps1 GeekLock-Setup-*.exe LEIA-ME.txt LEIA-ME-GEEKLOCK.txt /NFL /NDL /NJH /NJS /nc /ns /np >nul
copy /y "%~f0" "%STAGE%\INSTALAR-GEEKLOCK.bat" >nul
copy /y "%GL_LOG%" "%STAGE%\geeklock-install-prev.log" >nul 2>&1
if exist "%~dp0GeekLock-autostart.vbs" copy /y "%~dp0GeekLock-autostart.vbs" "%STAGE%\pack\GeekLock-autostart.vbs" >nul
if exist "%~dp0GeekLock\GeekLock-autostart.vbs" if not exist "%STAGE%\pack\GeekLock-autostart.vbs" copy /y "%~dp0GeekLock\GeekLock-autostart.vbs" "%STAGE%\pack\GeekLock-autostart.vbs" >nul
if not exist "%STAGE%\pack\GeekLock.exe" (
  echo  ERRO: falhou a copia para TEMP.
  call :LOG ERRO: copia TEMP sem GeekLock.exe
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%STAGE%\INSTALAR-GEEKLOCK.bat' -WorkingDirectory '%STAGE%' -Verb RunAs"
if errorlevel 1 (
  echo.
  echo  ERRO: o Windows nao abriu o UAC.
  echo  Clique com o BOTAO DIREITO neste arquivo e
  echo  escolha 'Executar como administrador'.
  call :LOG ERRO: UAC falhou
  pause
  exit /b 1
)
echo.
echo  Se o UAC nao aparecer: botao direito neste .bat
echo  ^> Executar como administrador.
echo  A instalacao continua na janela elevada.
timeout /t 8 /nobreak >nul
exit /b 0

:ADMIN
echo  Admin OK.
call :LOG admin OK
echo.

call :RESOLVE_SRC
if errorlevel 1 (
  echo  ERRO: GeekLock.exe nao encontrado.
  call :LOG ERRO: fonte admin
  pause
  exit /b 1
)
echo  Fonte: !SRC!
call :LOG fonte=!SRC!

echo.
echo  [0/7] Checando Central na lan (%GL_HOST%)...
ping -n 1 -w 1000 %GL_HOST% >nul 2>&1
if errorlevel 1 (
  echo        AVISO: %GL_HOST% nao respondeu ao ping.
  echo        Da para instalar mesmo assim; o CADASTRO
  echo        so conecta quando o GeekCentral estiver online.
  call :LOG ping FAIL %GL_HOST%
) else (
  echo        OK: %GL_HOST% respondeu.
  call :LOG ping OK %GL_HOST%
)
echo.

echo  [1/7] Encerrando GeekLock se estiver aberto...
taskkill /IM GeekLock.exe /F >nul 2>&1
taskkill /IM "GeekLock Setup.exe" /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [2/7] Limpando dados antigos (AppData + Run)...
if exist "%APPDATA%\GeekLock" rd /s /q "%APPDATA%\GeekLock"
if exist "%APPDATA%\geeklock-agent" rd /s /q "%APPDATA%\geeklock-agent"
if exist "%LOCALAPPDATA%\GeekLock" rd /s /q "%LOCALAPPDATA%\GeekLock"
if exist "%LOCALAPPDATA%\geeklock-agent" rd /s /q "%LOCALAPPDATA%\geeklock-agent"
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v GeekLock /f >nul 2>&1
call :LOG limpeza AppData/Run

echo  [3/7] Apagando %GL_DEST%...
if exist "%GL_DEST%" (
  taskkill /IM GeekLock.exe /F >nul 2>&1
  timeout /t 1 /nobreak >nul
  attrib -R -S -H "%GL_DEST%\*.*" /S /D >nul 2>&1
  rd /s /q "%GL_DEST%"
)
if exist "%GL_DEST%" (
  echo  ERRO: nao consegui apagar %GL_DEST%. Feche o GeekLock e tente de novo.
  call :LOG ERRO: rd C:\GeekLock falhou
  pause
  exit /b 1
)
mkdir "%GL_DEST%" >nul
call :LOG destino limpo

echo  [4/7] Copiando arquivos...
robocopy "!SRC!" "%GL_DEST%" /E /XF config.json INSTALAR-GEEKLOCK.bat INSTALAR-GEEKLOCK.ps1 GeekLock-Setup-*.exe LEIA-ME.txt LEIA-ME-GEEKLOCK.txt /R:2 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo  ERRO: falha ao copiar o pack.
  call :LOG ERRO: robocopy %ERRORLEVEL%
  pause
  exit /b 1
)
if not exist "%GL_DEST%\GeekLock.exe" (
  echo  ERRO: apos a copia, GeekLock.exe nao esta em %GL_DEST%.
  call :LOG ERRO: GeekLock.exe ausente no destino
  pause
  exit /b 1
)
call :LOG copia OK

echo  [5/7] Gravando config da lan...
> "%GL_DEST%\config.json" (
  echo {
  echo   "serverUrl": "%GL_SERVER%",
  echo   "stationName": "",
  echo   "sharedSecret": "",
  echo   "absentSecondsToLock": 60,
  echo   "stationToken": "",
  echo   "setupComplete": false,
  echo   "openAtLogin": true
  echo }
)
if exist "%GL_DEST%\resources\config.json" del /f /q "%GL_DEST%\resources\config.json"
findstr /C:"serverUrl" "%GL_DEST%\config.json" >nul || (
  echo  ERRO: config.json invalido.
  call :LOG ERRO: config.json
  pause
  exit /b 1
)
echo        serverUrl=%GL_SERVER%

if not exist "%GL_DEST%\resources\shared\lan-discovery.cjs" (
  echo  AVISO: falta lan-discovery.cjs — descoberta automatica pode falhar.
  echo         No cadastro use Conectar manual: %GL_SERVER%
  call :LOG AVISO: sem lan-discovery.cjs
)

echo  [6/7] Autostart no login do Windows...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%" mkdir "%STARTUP%"
if exist "%STARTUP%\GeekLock.lnk" del /f /q "%STARTUP%\GeekLock.lnk"
if exist "!SRC!\GeekLock-autostart.vbs" copy /y "!SRC!\GeekLock-autostart.vbs" "%STARTUP%\GeekLock.vbs" >nul
if exist "%~dp0GeekLock-autostart.vbs" if not exist "%STARTUP%\GeekLock.vbs" copy /y "%~dp0GeekLock-autostart.vbs" "%STARTUP%\GeekLock.vbs" >nul
if not exist "%STARTUP%\GeekLock.vbs" (
  echo  AVISO: autostart VBS nao foi copiado.
  call :LOG AVISO: sem VBS startup
) else (
  echo        OK: %STARTUP%\GeekLock.vbs
  call :LOG autostart OK
)

echo  [7/7] Abrindo GeekLock...
copy /y "%GL_LOG%" "%GL_DEST%\install.log" >nul 2>&1
echo.
echo  ========================================
echo    OK — GeekLock %GL_VER% em %GL_DEST%
echo  ========================================
echo  Proximo passo no PC:
echo    1. Nome unico da estacao (ex.: PC-02^)
echo    2. Conectar a Central (%GL_SERVER%^)
echo  PC controle precisa estar com GeekCentral ligado.
echo.
echo  Updates depois: GitHub (PC travado / sem VIP^).
echo  Log desta instalacao: %GL_DEST%\install.log
echo.
call :LOG sucesso — abrindo exe
start "" /D "%GL_DEST%" "%GL_DEST%\GeekLock.exe"
if errorlevel 1 (
  echo  AVISO: nao abriu sozinho. Rode %GL_DEST%\GeekLock.exe
  call :LOG AVISO: start exe falhou
)
echo.
pause
exit /b 0

:RESOLVE_SRC
set "SRC="
if exist "%~dp0pack\GeekLock.exe" set "SRC=%~dp0pack"
if not defined SRC if exist "%~dp0GeekLock.exe" set "SRC=%~dp0."
if not defined SRC if exist "%~dp0GeekLock\GeekLock.exe" set "SRC=%~dp0GeekLock"
if not defined SRC exit /b 1
exit /b 0

:LOG
>> "%GL_LOG%" echo [%DATE% %TIME%] %*
exit /b 0
