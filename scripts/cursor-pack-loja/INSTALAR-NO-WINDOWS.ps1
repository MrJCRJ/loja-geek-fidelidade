# Copia rules + skills do pack para o perfil do Windows (mesmo comportamento grill-me).
$ErrorActionPreference = "Stop"
$Pack = Split-Path -Parent $MyInvocation.MyCommand.Path
$User = $env:USERPROFILE
$Rules = Join-Path $User ".cursor\rules"
$Skills = Join-Path $User ".cursor\skills"

New-Item -ItemType Directory -Force -Path $Rules | Out-Null
New-Item -ItemType Directory -Force -Path $Skills | Out-Null

Copy-Item -Force (Join-Path $Pack "cursor-rules\*.mdc") $Rules
Copy-Item -Force -Recurse (Join-Path $Pack "cursor-skills\*") $Skills

Write-Host "OK: rules em $Rules"
Write-Host "OK: skills em $Skills"
Write-Host "Feche e reabra o Cursor. Abra o repo da loja e cole PROMPT-PARA-O-AGENT.txt"
