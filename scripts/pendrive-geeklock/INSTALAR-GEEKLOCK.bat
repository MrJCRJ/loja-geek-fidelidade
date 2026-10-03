@echo off
setlocal EnableExtensions EnableDelayedExpansion
title GeekLock - instalador do pendrive
color 0A
cd /d "%~dp0"

set "GL_VER=1.1.14"
set "GL_SERVER=https://api.geekloja.com.br"
set "GL_DEST=C:\GeekLock"
set "GL_LOG=%TEMP%\geeklock-install.log"
set "STAGE=%TEMP%\geeklock-inst"

call :LOG ==== GeekLock instalador iniciado ====
call :LOG bat=%~f0

echo.
echo  ========================================
echo    GeekLock %GL_VER% - instalador
echo  ========================================
echo.
echo  Destino : %GL_DEST%
echo  Central : %GL_SERVER%
echo  Log     : %GL_LOG%
echo.
echo  ATENCAO: apaga o GeekLock antigo e abre o CADASTRO.
echo.

net session >nul 2>&1
if not errorlevel 1 goto :ADMIN

echo  [elevacao] Precisa de administrador. Abrindo o UAC...
echo             Clique em SIM.
echo.
call :LOG elevating via UAC

for %%I in ("%~dp0.") do set "HERE_NAME=%%~nxI"
if /i "!HERE_NAME!"=="geeklock-inst" goto :STAGE_READY
if exist "%STAGE%" rd /s /q "%STAGE%"
mkdir "%STAGE%" >nul 2>&1
mkdir "%STAGE%\pack" >nul 2>&1

call :RESOLVE_SRC
if errorlevel 1 (
  echo  ERRO: GeekLock.exe nao encontrado neste pendrive.
  call :LOG ERRO: fonte nao encontrada
  call :HOLD
  exit /b 1
)

echo  Preparando copia em TEMP (para o UAC nao perder a letra do USB)...
robocopy "!SRC!" "%STAGE%\pack" /E /XJ /XF INSTALAR-GEEKLOCK.bat INSTALAR-GEEKLOCK.ps1 LEIA-ME.txt LEIA-ME-GEEKLOCK.txt /NFL /NDL /NJH /NJS /nc /ns /np >nul
copy /y "%~f0" "%STAGE%\INSTALAR-GEEKLOCK.bat" >nul
call :COPY_PS1 "%STAGE%\INSTALAR-GEEKLOCK.ps1"
if exist "%~dp0GeekLock-harden.ps1" copy /y "%~dp0GeekLock-harden.ps1" "%STAGE%\pack\GeekLock-harden.ps1" >nul
if exist "%~dp0GeekLock\GeekLock-harden.ps1" if not exist "%STAGE%\pack\GeekLock-harden.ps1" copy /y "%~dp0GeekLock\GeekLock-harden.ps1" "%STAGE%\pack\GeekLock-harden.ps1" >nul
if exist "%~dp0GeekLock-autostart.vbs" copy /y "%~dp0GeekLock-autostart.vbs" "%STAGE%\pack\GeekLock-autostart.vbs" >nul
if exist "%~dp0GeekLock\GeekLock-autostart.vbs" if not exist "%STAGE%\pack\GeekLock-autostart.vbs" copy /y "%~dp0GeekLock\GeekLock-autostart.vbs" "%STAGE%\pack\GeekLock-autostart.vbs" >nul
if not exist "%STAGE%\pack\GeekLock.exe" (
  echo  ERRO: falhou a copia para TEMP.
  call :HOLD
  exit /b 1
)
if not exist "%STAGE%\INSTALAR-GEEKLOCK.ps1" (
  echo  ERRO: INSTALAR-GEEKLOCK.ps1 nao foi para TEMP.
  call :HOLD
  exit /b 1
)

:STAGE_READY
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory '%STAGE%' -Verb RunAs -ArgumentList '/k \"\"%STAGE%\INSTALAR-GEEKLOCK.bat\"\"'"
if errorlevel 1 (
  echo  ERRO: o Windows nao abriu o UAC.
  echo  Botao direito neste .bat ^> Executar como administrador.
  call :HOLD
  exit /b 1
)
echo.
echo  UAC pedido. Continue na janela ELEVADA.
pause
exit /b 0

:ADMIN
echo  Admin OK. Chamando instalador PowerShell...
call :LOG admin OK - delegando ao ps1
echo.

set "PS1="
if exist "%~dp0INSTALAR-GEEKLOCK.ps1" set "PS1=%~dp0INSTALAR-GEEKLOCK.ps1"
if not defined PS1 if exist "%~dp0GeekLock\INSTALAR-GEEKLOCK.ps1" set "PS1=%~dp0GeekLock\INSTALAR-GEEKLOCK.ps1"
if not defined PS1 if exist "%~dp0pack\INSTALAR-GEEKLOCK.ps1" set "PS1=%~dp0pack\INSTALAR-GEEKLOCK.ps1"
if not defined PS1 (
  echo  ERRO: INSTALAR-GEEKLOCK.ps1 nao encontrado ao lado deste .bat.
  call :LOG ERRO: ps1 ausente
  call :HOLD
  exit /b 1
)

echo  PS1: !PS1!
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!PS1!"
set "RC=!ERRORLEVEL!"
call :LOG ps1 exit=!RC!

echo.
if not "!RC!"=="0" (
  echo  ERRO: instalador PowerShell falhou ^(codigo !RC!^).
  call :HOLD
  exit /b 1
)

if not exist "%GL_DEST%\GeekLock.exe" (
  echo  ERRO: C:\GeekLock\GeekLock.exe nao existe apos o instalador.
  echo  A copia NAO concluiu. Veja a mensagem do PowerShell acima.
  call :LOG ERRO: exe ausente apos ps1
  call :HOLD
  exit /b 1
)

for %%A in ("%GL_DEST%\GeekLock.exe") do echo  Verificado: %GL_DEST%\GeekLock.exe  (%%~zA bytes)
if exist "%GL_DEST%\config.json" (
  echo  Verificado: config.json
) else (
  echo  AVISO: config.json ausente
)
echo.
echo  ========================================
echo    INSTALACAO CONCLUIDA
echo  ========================================
echo  Se o cadastro nao abriu, rode: %GL_DEST%\GeekLock.exe
echo.
pause
exit /b 0

:RESOLVE_SRC
set "SRC="
if exist "%~dp0pack\GeekLock.exe" (
  for %%I in ("%~dp0pack") do set "SRC=%%~fI"
)
if not defined SRC if exist "%~dp0GeekLock.exe" (
  for %%I in ("%~dp0.") do set "SRC=%%~fI"
)
if not defined SRC if exist "%~dp0GeekLock\GeekLock.exe" (
  for %%I in ("%~dp0GeekLock") do set "SRC=%%~fI"
)
if not defined SRC exit /b 1
exit /b 0

:COPY_PS1
set "PS1DST=%~1"
if exist "%~dp0INSTALAR-GEEKLOCK.ps1" copy /y "%~dp0INSTALAR-GEEKLOCK.ps1" "%PS1DST%" >nul & exit /b 0
if exist "%~dp0GeekLock\INSTALAR-GEEKLOCK.ps1" copy /y "%~dp0GeekLock\INSTALAR-GEEKLOCK.ps1" "%PS1DST%" >nul & exit /b 0
if exist "!SRC!\INSTALAR-GEEKLOCK.ps1" copy /y "!SRC!\INSTALAR-GEEKLOCK.ps1" "%PS1DST%" >nul & exit /b 0
exit /b 1

:HOLD
echo.
echo  ----------------------------------------
echo  Leia o erro acima. Janela fica 2 minutos.
echo  Log: %GL_LOG%
echo  ----------------------------------------
timeout /t 120 /nobreak
pause
exit /b 0

:LOG
>> "%GL_LOG%" echo [%DATE% %TIME%] %*
exit /b 0
