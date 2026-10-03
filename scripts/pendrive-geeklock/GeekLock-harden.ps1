# GeekLock — aplica Policy USB storage + DisableTaskMgr conforme harden-state.txt
# Roda como SYSTEM via tarefa agendada "GeekLockHarden" (criada pelo INSTALAR).
# Webcam / teclado / mouse (HID) NAO sao bloqueados — so Removable Disks (pendrive).
$ErrorActionPreference = "SilentlyContinue"
$stateFile = "C:\GeekLock\harden-state.txt"
$locked = $false
if (Test-Path $stateFile) {
  $raw = (Get-Content -LiteralPath $stateFile -Raw -ErrorAction SilentlyContinue)
  if ($raw) { $locked = ($raw.Trim().ToLowerInvariant() -eq "locked") }
}

$diskGuid = "{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}"
$diskKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\$diskGuid"

if ($locked) {
  New-Item -Path $diskKey -Force | Out-Null
  New-ItemProperty -Path $diskKey -Name Deny_Read -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $diskKey -Name Deny_Write -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $diskKey -Name Deny_Execute -Value 1 -PropertyType DWord -Force | Out-Null
} else {
  if (Test-Path $diskKey) { Remove-Item -LiteralPath $diskKey -Recurse -Force }
}

# DisableTaskMgr para usuarios logados (HKU\S-1-5-21-*)
Get-ChildItem "Registry::HKEY_USERS" -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match '^S-1-5-21-\d+(-\d+){2}-\d+$' } |
  ForEach-Object {
    $sys = Join-Path $_.PSPath "Software\Microsoft\Windows\CurrentVersion\Policies\System"
    if ($locked) {
      New-Item -Path $sys -Force | Out-Null
      New-ItemProperty -Path $sys -Name DisableTaskMgr -Value 1 -PropertyType DWord -Force | Out-Null
    } else {
      Remove-ItemProperty -Path $sys -Name DisableTaskMgr -Force -ErrorAction SilentlyContinue
    }
  }
