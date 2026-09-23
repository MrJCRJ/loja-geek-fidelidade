@echo off
setlocal EnableExtensions
title Instalar GeekLock
set "DIR=%~dp0"
set "PS1=%DIR%INSTALAR-GEEKLOCK.ps1"
if not exist "%PS1%" if exist "%DIR%GeekLock\INSTALAR-GEEKLOCK.ps1" set "PS1=%DIR%GeekLock\INSTALAR-GEEKLOCK.ps1"
if not exist "%PS1%" (
  echo ERRO: INSTALAR-GEEKLOCK.ps1 nao encontrado.
  echo Coloque este .bat na pasta GeekLock do pendrive, ou na raiz ao lado da pasta GeekLock.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
exit /b %ERRORLEVEL%
