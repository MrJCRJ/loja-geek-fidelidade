# Instala GeekLock do pendrive em C:\GeekLock.
# APAGA a pasta antiga (pareamento incluso) e abre o assistente para ligar de novo no Central.
$ErrorActionPreference = "Stop"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  $self = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $self
  )
  exit 0
}

$here = Split-Path -Parent $(if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path })
$src = $here
if (-not (Test-Path (Join-Path $src "GeekLock.exe"))) {
  $alt = Join-Path $here "GeekLock"
  if (Test-Path (Join-Path $alt "GeekLock.exe")) { $src = $alt }
}

if (-not (Test-Path (Join-Path $src "GeekLock.exe"))) {
  Write-Host "ERRO: GeekLock.exe nao encontrado."
  Write-Host "Coloque este instalador na pasta GeekLock do pendrive, ou na raiz ao lado da pasta GeekLock."
  Read-Host "Enter para sair"
  exit 1
}

$dest = "C:\GeekLock"
$srcFull = (Resolve-Path $src).Path.TrimEnd("\")
if ($srcFull -ieq $dest) {
  Write-Host "ERRO: nao rode o instalador de C:\GeekLock. Use o pendrive."
  Read-Host "Enter para sair"
  exit 1
}

$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$vbsSrc = Join-Path $src "GeekLock-autostart.vbs"
if (-not (Test-Path $vbsSrc)) {
  $vbsSrc = Join-Path $here "GeekLock-autostart.vbs"
}

Write-Host "Fonte: $src"
Write-Host "Destino: $dest"
Write-Host "A pasta antiga sera APAGADA. Vai precisar do codigo de 6 digitos de novo."
Write-Host ""

Get-Process -Name "GeekLock" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

if (Test-Path $dest) {
  Write-Host "Apagando C:\GeekLock antigo..."
  $ok = $false
  foreach ($try in 1..4) {
    try {
      Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction Stop
      $ok = $true
      break
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $ok -and (Test-Path $dest)) {
    cmd /c "rd /s /q `"$dest`""
  }
  if (Test-Path $dest) {
    Write-Host "ERRO: nao consegui apagar C:\GeekLock. Feche o GeekLock e tente de novo."
    Read-Host "Enter para sair"
    exit 1
  }
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$xf = @("config.json", "INSTALAR-GEEKLOCK.bat", "INSTALAR-GEEKLOCK.ps1")
$robolog = Join-Path $env:TEMP "geeklock-install-robocopy.log"
& robocopy $src $dest /E /R:2 /W:1 /XF @xf /NFL /NDL /NP /TEE /LOG:"$robolog" | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Host "ERRO: falha ao copiar arquivos (robocopy $LASTEXITCODE)."
  Write-Host "Log: $robolog"
  Read-Host "Enter para sair"
  exit 1
}

$fresh = @{
  serverUrl           = "http://192.168.3.70:8787"
  stationName         = ""
  sharedSecret        = ""
  staffPin            = "2580"
  absentSecondsToLock = 60
  stationToken        = ""
  setupComplete       = $false
  openAtLogin         = $true
}
$fresh | ConvertTo-Json | Set-Content -Path (Join-Path $dest "config.json") -Encoding ASCII
Write-Host "config.json novo: sem token. Assistente vai pedir o codigo de 6 digitos."

$lan = Join-Path $dest "resources\shared\lan-discovery.cjs"
if (-not (Test-Path $lan)) {
  Write-Host "AVISO: falta resources\shared\lan-discovery.cjs - o .exe pode abrir erro JavaScript."
}

New-Item -ItemType Directory -Force -Path $startup | Out-Null
$lnk = Join-Path $startup "GeekLock.lnk"
if (Test-Path $lnk) { Remove-Item -Force $lnk }

Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "GeekLock" -ErrorAction SilentlyContinue

$vbsDest = Join-Path $startup "GeekLock.vbs"
if (-not (Test-Path $vbsSrc)) {
  Write-Host "ERRO: GeekLock-autostart.vbs nao encontrado no pendrive."
  Read-Host "Enter para sair"
  exit 1
}
Copy-Item -Force $vbsSrc $vbsDest

Write-Host "Autostart: $vbsDest"
Write-Host ""

Start-Process -FilePath (Join-Path $dest "GeekLock.exe") -WorkingDirectory $dest

Write-Host "OK: GeekLock reinstalado em C:\GeekLock"
Write-Host "OK: no reinicio o Windows abre o Lock."
Write-Host "Agora no assistente: confirme a URL http://192.168.3.70:8787"
Write-Host "nome da estacao (ex. PC-01) + codigo de 6 digitos do celular / Central."
Read-Host "Enter para fechar"
exit 0
