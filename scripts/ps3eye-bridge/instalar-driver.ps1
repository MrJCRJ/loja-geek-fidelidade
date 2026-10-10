# Instala o driver DirectShow da PlayStation Eye (SLEH-00448).
# O MSI não entra no git: baixa o release público do projeto PS3EyeDirectShow.
$ErrorActionPreference = "Stop"
$msiUrl = "https://github.com/jkevin/PS3EyeDirectShow/releases/download/1.0b2/PS3EyeInstallerBeta2.msi"
$msi = Join-Path $env:TEMP "PS3EyeInstallerBeta2.msi"
Write-Host "Baixando driver DirectShow da PlayStation Eye..."
Invoke-WebRequest -Uri $msiUrl -OutFile $msi -UseBasicParsing
Write-Host "Instalando (pede administrador)..."
$proc = Start-Process -FilePath "msiexec.exe" -Verb RunAs -ArgumentList @("/i", $msi, "/qn", "/norestart") -Wait -PassThru
if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
  throw "msiexec saiu com código $($proc.ExitCode)"
}
Write-Host "Driver instalado. Reconecte a câmera se o vídeo não aparecer."
