# Liga o OpenSSH neste PC da loja para o Kali 192.168.3.198.
# Rodar uma vez, no PowerShell como administrador.
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$pubkey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK9s23KObKlaafQzB9FObqVVpOjdgbAK472TftEp/5uS loja-geek-pcs@192.168.3.198"
$lan = "192.168.3.0/24"
$sshDir = "C:\ProgramData\ssh"
$adminKeys = Join-Path $sshDir "administrators_authorized_keys"
$config = Join-Path $sshDir "sshd_config"

Write-Host "Instalando OpenSSH da loja..."
$dest = "C:\Program Files\OpenSSH"
$existing = Get-CimInstance Win32_Service -Filter "Name='sshd'" -ErrorAction SilentlyContinue
$serviceOk = $existing -and ($existing.PathName -like "*\OpenSSH\sshd.exe*") -and ($existing.PathName -notlike "*System32*")
if (-not $serviceOk) {
  $work = "C:\ProgramData\loja-ssh-setup"
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $zip = Join-Path $work "OpenSSH-Win64.zip"
  $expand = Join-Path $work "expand"
  Write-Host "Baixando o pacote deste computador da loja..."
  Invoke-WebRequest -Uri "http://192.168.3.198:8971/OpenSSH-Win64.zip" -OutFile $zip
  if (Test-Path -LiteralPath $expand) { Remove-Item -LiteralPath $expand -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $expand -Force
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path "$expand\OpenSSH-Win64\*" -Destination $dest -Recurse -Force
  Push-Location $dest
  & .\install-sshd.ps1 -Confirm:$false
  Pop-Location
}
$service = Get-Service -Name sshd -ErrorAction SilentlyContinue
if (-not $service) { throw "O servico sshd nao foi criado." }

Set-Service -Name sshd -StartupType Automatic
sc.exe config sshd start= delayed-auto | Out-Null
sc.exe failure sshd reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
$boot = New-ScheduledTaskAction -Execute "sc.exe" -Argument "start sshd"
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$bootPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "LojaGeekSshdBoot" -Action $boot -Trigger $bootTrigger -Principal $bootPrincipal -Force | Out-Null
$keep = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"if ((Get-Service sshd -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Service sshd }`""
$keepTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "LojaGeekSshdKeep" -Action $keep -Trigger $keepTrigger -Principal $bootPrincipal -Force | Out-Null
Start-Service sshd

New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
if (-not (Test-Path $config)) {
  Copy-Item -Force "$dest\sshd_config_default" $config
}
Set-Content -Path $adminKeys -Value $pubkey -Encoding ascii
icacls $adminKeys /setowner "*S-1-5-32-544" | Out-Null
icacls $adminKeys /inheritance:r | Out-Null
icacls $adminKeys /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null

$script:lines = @(Get-Content $config)
function Set-SshLine([string]$name, [string]$value) {
  $pattern = "^\s*#?\s*$name\s+"
  $hit = $false
  for ($i = 0; $i -lt $script:lines.Count; $i++) {
    if ($script:lines[$i] -match $pattern) {
      $script:lines[$i] = "$name $value"
      $hit = $true
    }
  }
  if (-not $hit) { $script:lines += "$name $value" }
}
Set-SshLine "PubkeyAuthentication" "yes"
Set-SshLine "PasswordAuthentication" "no"
for ($i = 0; $i -lt $script:lines.Count; $i++) {
  if ($script:lines[$i] -match "Match Group administrators" -or $script:lines[$i] -match "administrators_authorized_keys") {
    $script:lines[$i] = "# " + ($script:lines[$i] -replace "^\s*#\s*", "")
  }
}
Set-Content -Path $config -Value $script:lines -Encoding ascii

$members = @()
$members += @(Get-LocalGroupMember -Group "Administradores" -ErrorAction SilentlyContinue)
$members += @(Get-LocalGroupMember -Group "Administrators" -ErrorAction SilentlyContinue)
$seen = @{}
foreach ($m in $members) {
  $name = ($m.Name -split "\\")[-1]
  if ($seen.ContainsKey($name)) { continue }
  $seen[$name] = $true
  $userHome = $null
  $localUser = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
  if ($localUser) {
    $sid = $localUser.Sid.Value
    $userHome = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
  }
  if (-not $userHome) { $userHome = Join-Path "$env:SystemDrive\Users" $name }
  if (-not (Test-Path -LiteralPath $userHome)) { continue }
  $sshHome = Join-Path $userHome ".ssh"
  New-Item -ItemType Directory -Force -Path $sshHome | Out-Null
  $ak = Join-Path $sshHome "authorized_keys"
  Set-Content -Path $ak -Value $pubkey -Encoding ascii
  icacls $sshHome /inheritance:r | Out-Null
  icacls $sshHome /grant:r "${name}:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
  icacls $ak /inheritance:r | Out-Null
  icacls $ak /grant:r "${name}:F" "*S-1-5-18:F" | Out-Null
  Write-Host "Chave gravada para $name"
}

Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -match "OpenSSH" -and $_.Direction -eq "Inbound" } |
  ForEach-Object { Set-NetFirewallRule -Name $_.Name -RemoteAddress $lan -Action Allow -Enabled True }

$ruleName = "LojaGeek-SSH-LAN"
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) { Remove-NetFirewallRule -Name $ruleName }
New-NetFirewallRule -Name $ruleName -DisplayName "SSH so na rede da loja" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -RemoteAddress $lan -Profile Any | Out-Null

$tsRule = "LojaGeek-SSH-Tailscale"
$tsExisting = Get-NetFirewallRule -Name $tsRule -ErrorAction SilentlyContinue
if ($tsExisting) { Remove-NetFirewallRule -Name $tsRule }
New-NetFirewallRule -Name $tsRule -DisplayName "SSH so pela rede Tailscale" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -RemoteAddress "100.64.0.0/10" -Profile Any | Out-Null

Restart-Service sshd
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "SSH ligado. Senha desligada. So a chave deste Kali entra, da rede 192.168.3.x ou do Tailscale."
Write-Host "Contas administrador deste PC:"
Get-LocalGroupMember -Group "Administradores" -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("  " + $_.Name) }
Get-LocalGroupMember -Group "Administrators" -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("  " + $_.Name) }
Write-Host "IP:"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.3.*" } |
  ForEach-Object { Write-Host ("  " + $_.IPAddress) }
Write-Host "Pronto. Pode abrir o GeekLock de novo. O SSH continua."
