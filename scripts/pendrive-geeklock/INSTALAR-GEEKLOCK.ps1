# Fallback PowerShell (o fluxo principal e o INSTALAR-GEEKLOCK.bat).
# Instala GeekLock 1.1.9 do pendrive em C:\GeekLock.
# APAGA a pasta antiga (pareamento incluso) e abre o assistente para ligar de novo no Central.
$ErrorActionPreference = "Stop"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  $self = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  try {
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $self
    ) | Out-Null
  } catch {
    Write-Host "ERRO: nao abriu o UAC. Botao direito neste arquivo > Executar como administrador."
    Read-Host "Enter para sair"
    exit 1
  }
  Write-Host "Se nao apareceu o UAC, botao direito > Executar como administrador."
  Read-Host "Enter para fechar"
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

Write-Host "Fonte: $src (GeekLock 1.1.9)"
Write-Host "Destino: $dest"
Write-Host "Instalacao NOVA: apaga C:\GeekLock, config, token e dados do app. Vai para o cadastro."
Write-Host ""

Get-Process -Name "GeekLock" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Apagando dados antigos do GeekLock (AppData)..."
foreach ($p in @(
  (Join-Path $env:APPDATA "GeekLock"),
  (Join-Path $env:APPDATA "geeklock-agent"),
  (Join-Path $env:LOCALAPPDATA "GeekLock"),
  (Join-Path $env:LOCALAPPDATA "geeklock-agent")
)) {
  if (Test-Path $p) {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Get-ChildItem $env:TEMP -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "geeklock-*" } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

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

$xf = @("config.json", "INSTALAR-GEEKLOCK.bat", "INSTALAR-GEEKLOCK.ps1", "GeekLock-Setup-*.exe", "LEIA-ME.txt")
$robolog = Join-Path $env:TEMP "geeklock-install-robocopy.log"
& robocopy $src $dest /E /R:2 /W:1 /XF @xf /NFL /NDL /NP /TEE /LOG:"$robolog" | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Host "ERRO: falha ao copiar arquivos (robocopy $LASTEXITCODE)."
  Write-Host "Log: $robolog"
  Read-Host "Enter para sair"
  exit 1
}

$fresh = @{
  serverUrl           = "https://api.geekloja.com.br"
  stationName         = ""
  sharedSecret        = ""
  absentSecondsToLock = 60
  stationToken        = ""
  setupComplete       = $false
  openAtLogin         = $true
}
$fresh | ConvertTo-Json | Set-Content -Path (Join-Path $dest "config.json") -Encoding ASCII
$resCfg = Join-Path $dest "resources\config.json"
if (Test-Path $resCfg) { Remove-Item -Force $resCfg }
Write-Host "Sistema novo: sem token, sem nome. Proximo passo: cadastro (Conectar a Central)."

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

$hardenSrc = Join-Path $src "GeekLock-harden.ps1"
if (-not (Test-Path $hardenSrc)) { $hardenSrc = Join-Path $here "GeekLock-harden.ps1" }
if (Test-Path $hardenSrc) {
  Copy-Item -Force $hardenSrc (Join-Path $dest "GeekLock-harden.ps1")
  $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\GeekLock\GeekLock-harden.ps1'
  & schtasks /Create /F /TN "GeekLockHarden" /RU SYSTEM /RL HIGHEST /SC ONCE /ST 23:59 /SD 01/01/2099 /TR $tr | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Tarefa GeekLockHarden registrada (USB bloqueado so no lock)."
  } else {
    Write-Host "AVISO: nao registrou GeekLockHarden."
  }
}

Write-Host "Autostart: $vbsDest"
Write-Host ""

Start-Process -FilePath (Join-Path $dest "GeekLock.exe") -WorkingDirectory $dest

Write-Host "OK: GeekLock 1.1.9 em C:\GeekLock — vai abrir o CADASTRO, nao a camera VIP."
Write-Host "OK: no reinicio o Windows abre o Lock."
Write-Host "Central: https://api.geekloja.com.br"
Write-Host "No assistente: nome unico (PC-02, PC-03...) + Conectar a Central."
Read-Host "Enter para fechar"
exit 0
