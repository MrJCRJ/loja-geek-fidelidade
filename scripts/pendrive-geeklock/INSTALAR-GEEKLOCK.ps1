# Instalador GeekLock 1.1.14 (chamado pelo INSTALAR-GEEKLOCK.bat ou direto).
# Copia o pack do pendrive para C:\GeekLock, grava config e abre o cadastro.
$GlVer = "1.1.14"
$ErrorActionPreference = "Stop"
$dest = "C:\GeekLock"
$minExeBytes = 50MB

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Wait-Exit([string]$msg, [int]$code = 1) {
  Write-Host ""
  Write-Host $msg
  Write-Host "Pressione Enter para fechar (ou espere 120s)..."
  try { $null = Read-Host -ErrorAction Stop } catch { Start-Sleep -Seconds 120 }
  exit $code
}

if (-not (Test-Admin)) {
  $self = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  try {
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $self
    ) | Out-Null
  } catch {
    Wait-Exit "ERRO: nao abriu o UAC. Botao direito > Executar como administrador."
  }
  Write-Host "Se nao apareceu o UAC, botao direito > Executar como administrador."
  Read-Host "Enter para fechar"
  exit 0
}

$here = Split-Path -Parent $(if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path })
$src = $null
foreach ($cand in @(
  $here,
  (Join-Path $here "GeekLock"),
  (Join-Path $here "pack")
)) {
  if (Test-Path (Join-Path $cand "GeekLock.exe")) { $src = $cand; break }
}

if (-not $src) {
  Wait-Exit "ERRO: GeekLock.exe nao encontrado (pasta do .ps1, GeekLock\ ou pack\)."
}

$srcFull = (Resolve-Path $src).Path.TrimEnd("\")
if ($srcFull -ieq $dest) {
  Wait-Exit "ERRO: nao rode o instalador de C:\GeekLock. Use o pendrive."
}

$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$vbsSrc = Join-Path $src "GeekLock-autostart.vbs"
if (-not (Test-Path $vbsSrc)) { $vbsSrc = Join-Path $here "GeekLock-autostart.vbs" }
if (-not (Test-Path $vbsSrc)) { $vbsSrc = Join-Path $here "pack\GeekLock-autostart.vbs" }

Write-Host "Fonte : $srcFull"
Write-Host "Destino: $dest"
Write-Host "Versao : $GlVer"
Write-Host "Instalacao NOVA: apaga C:\GeekLock e dados antigos. Depois abre o CADASTRO."
Write-Host ""

Get-Process -Name "GeekLock" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

Write-Host "[1/6] Limpando AppData / Run..."
foreach ($p in @(
  (Join-Path $env:APPDATA "GeekLock"),
  (Join-Path $env:APPDATA "geeklock-agent"),
  (Join-Path $env:LOCALAPPDATA "GeekLock"),
  (Join-Path $env:LOCALAPPDATA "geeklock-agent")
)) {
  if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
}
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "GeekLock" -ErrorAction SilentlyContinue

# Nao apagar geeklock-inst (staging do .bat) nem logs uteis em uso.
Get-ChildItem $env:TEMP -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "geeklock-*" -and $_.Name -ne "geeklock-inst" -and -not $_.Name.EndsWith(".log") } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[2/6] Apagando C:\GeekLock antigo..."
if (Test-Path $dest) {
  $ok = $false
  foreach ($try in 1..5) {
    try {
      Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction Stop
      $ok = $true
      break
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $ok -and (Test-Path $dest)) { cmd /c "rd /s /q `"$dest`"" | Out-Null }
  if (Test-Path $dest) {
    Wait-Exit "ERRO: nao consegui apagar C:\GeekLock. Feche o GeekLock e tente de novo."
  }
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "[3/6] Copiando arquivos (~300 MB). Aguarde..."
$xf = @("config.json", "INSTALAR-GEEKLOCK.bat", "INSTALAR-GEEKLOCK.ps1", "LEIA-ME.txt", "LEIA-ME-GEEKLOCK.txt")
$robolog = Join-Path $env:TEMP "geeklock-install-robocopy.log"
$rc = 0
try {
  & robocopy $srcFull $dest /E /XJ /R:3 /W:2 /XF @xf /XD "System Volume Information" /NP /NFL /NDL /TEE /LOG:"$robolog"
  $rc = $LASTEXITCODE
} catch {
  $rc = 16
}
Write-Host "       robocopy codigo=$rc (0-7 = ok)"

$exe = Join-Path $dest "GeekLock.exe"
$needFallback = ($rc -ge 8) -or (-not (Test-Path $exe)) -or ((Test-Path $exe) -and ((Get-Item $exe).Length -lt $minExeBytes))

if ($needFallback) {
  Write-Host "       robocopy insuficiente. Copiando com PowerShell..."
  try {
    Get-ChildItem -LiteralPath $srcFull -Force | Where-Object {
      $_.Name -notin $xf -and $_.Name -notlike "GeekLock-Setup-*"
    } | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Recurse -Force -ErrorAction Stop
    }
  } catch {
    Wait-Exit "ERRO: falha ao copiar. $($_.Exception.Message)`nLog: $robolog"
  }
}

if (-not (Test-Path $exe)) {
  Wait-Exit "ERRO: C:\GeekLock\GeekLock.exe nao apareceu apos a copia.`nLog: $robolog"
}
$exeLen = (Get-Item $exe).Length
if ($exeLen -lt $minExeBytes) {
  Wait-Exit "ERRO: GeekLock.exe muito pequeno ($exeLen bytes). Copia incompleta.`nLog: $robolog"
}
Write-Host "       OK GeekLock.exe = $([int]($exeLen/1MB)) MB"

Write-Host "[4/6] Gravando config.json (API publica)..."
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

$lan = Join-Path $dest "resources\shared\lan-discovery.cjs"
if (-not (Test-Path $lan)) {
  Write-Host "AVISO: falta resources\shared\lan-discovery.cjs"
} else {
  Write-Host "       OK lan-discovery.cjs"
}

Write-Host "[5/6] Autostart + harden..."
New-Item -ItemType Directory -Force -Path $startup | Out-Null
$lnk = Join-Path $startup "GeekLock.lnk"
if (Test-Path $lnk) { Remove-Item -Force $lnk }
if (-not (Test-Path $vbsSrc)) {
  Wait-Exit "ERRO: GeekLock-autostart.vbs nao encontrado no pendrive/pack."
}
$vbsDest = Join-Path $startup "GeekLock.vbs"
Copy-Item -Force $vbsSrc $vbsDest
Write-Host "       Autostart: $vbsDest"

$hardenSrc = Join-Path $srcFull "GeekLock-harden.ps1"
if (-not (Test-Path $hardenSrc)) { $hardenSrc = Join-Path $here "GeekLock-harden.ps1" }
if (-not (Test-Path $hardenSrc)) { $hardenSrc = Join-Path $here "pack\GeekLock-harden.ps1" }
if (Test-Path $hardenSrc) {
  Copy-Item -Force $hardenSrc (Join-Path $dest "GeekLock-harden.ps1")
  $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\GeekLock\GeekLock-harden.ps1'
  & schtasks /Create /F /TN "GeekLockHarden" /RU SYSTEM /RL HIGHEST /SC ONCE /ST 23:59 /SD 01/01/2099 /TR $tr | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "       OK tarefa GeekLockHarden" }
  else { Write-Host "       AVISO: nao registrou GeekLockHarden" }
} else {
  Write-Host "       AVISO: GeekLock-harden.ps1 ausente"
}

Write-Host "[6/6] Abrindo GeekLock (cadastro)..."
Start-Process -FilePath $exe -WorkingDirectory $dest
Start-Sleep -Seconds 2
$alive = Get-Process -Name "GeekLock" -ErrorAction SilentlyContinue
if (-not $alive) {
  Write-Host "AVISO: GeekLock.exe nao ficou em execucao. Abra manualmente: $exe"
} else {
  Write-Host "       OK processo GeekLock em execucao (PID $($alive.Id))"
}

Write-Host ""
Write-Host "========================================"
Write-Host " INSTALACAO OK - GeekLock $GlVer"
Write-Host " Pasta: C:\GeekLock"
Write-Host " Exe : $([int]($exeLen/1MB)) MB"
Write-Host "========================================"
Write-Host "No cadastro: nome unico (PC-02...) + Conectar"
Write-Host "Central: https://api.geekloja.com.br"
Write-Host "Admin:  https://admin.geekloja.com.br"
Read-Host "Enter para fechar"
exit 0
