# Instala o Tailscale nesta estação e libera o SSH só para a rede Tailscale (100.64.0.0/10).
# Não abre a porta 22 no roteador. A chave SSH continua a mesma.
# Rodar no PowerShell já elevado (a sessão SSH da loja é elevada).
#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$TsHostname,
  [string]$AuthKeyFile = ""
)

$ErrorActionPreference = "Stop"
$TsHostname = $TsHostname.Trim().ToLower()
if ($TsHostname -notmatch '^[a-z0-9-]{3,32}$') {
  throw "Hostname invalido: $TsHostname"
}

$msiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-1.104.1-amd64.msi"
$msi = "C:\Windows\Temp\tailscale-setup-1.104.1-amd64.msi"
$tailscale = "C:\Program Files\Tailscale\tailscale.exe"

if (-not (Test-Path -LiteralPath $tailscale)) {
  Write-Host "Baixando Tailscale..."
  $ProgressPreference = "SilentlyContinue"
  & curl.exe -fL --retry 3 --retry-delay 2 -o $msi $msiUrl
  if ($LASTEXITCODE -ne 0) { throw "curl saiu com $LASTEXITCODE" }
  $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $msi, "/quiet", "/norestart") -Wait -PassThru
  if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
    throw "msiexec saiu com $($proc.ExitCode)"
  }
}
if (-not (Test-Path -LiteralPath $tailscale)) {
  throw "tailscale.exe nao apareceu depois do instalador"
}

$ruleName = "LojaGeek-SSH-Tailscale"
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) { Remove-NetFirewallRule -Name $ruleName }
New-NetFirewallRule -Name $ruleName -DisplayName "SSH so pela rede Tailscale" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -RemoteAddress "100.64.0.0/10" -Profile Any | Out-Null

$svc = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Running") { Start-Service -Name "Tailscale" }

Get-Process -Name "tailscale" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$outLog = Join-Path $env:TEMP "tailscale-up-out.txt"
$errLog = Join-Path $env:TEMP "tailscale-up-err.txt"
Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

# Com chave, entra na conta sem clique. Sem chave, o CLI fica esperando o login.
$url = $null
if ($AuthKeyFile -and (Test-Path -LiteralPath $AuthKeyFile)) {
  $authKey = (Get-Content -Raw -LiteralPath $AuthKeyFile).Trim()
  Remove-Item -LiteralPath $AuthKeyFile -Force
  if (-not $authKey) { throw "Chave Tailscale vazia" }
  & $tailscale up "--hostname=$TsHostname" --reset --ssh=false --timeout=40s "--auth-key=$authKey"
  if ($LASTEXITCODE -ne 0) { throw "tailscale up saiu com $LASTEXITCODE" }
} else {
  Start-Process -FilePath $tailscale -ArgumentList @("up", "--hostname=$TsHostname", "--reset", "--timeout=0s", "--ssh=false") -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(25)
  do {
    Start-Sleep -Seconds 1
    $text = ""
    if (Test-Path $outLog) { $text += Get-Content -Raw $outLog -ErrorAction SilentlyContinue }
    if (Test-Path $errLog) { $text += Get-Content -Raw $errLog -ErrorAction SilentlyContinue }
    if ($text -match "https://login\.tailscale\.com/\S+") { $url = $Matches[0] }
  } while (-not $url -and (Get-Date) -lt $deadline)
}

Write-Host "HOSTNAME=$TsHostname"
if ($url) { Write-Host "AUTHURL=$url" } else { Write-Host "AUTHURL=" }
Write-Host "STATUS_BEGIN"
& $tailscale status 2>&1 | Select-Object -First 8
Write-Host "STATUS_END"
