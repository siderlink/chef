# =============================================================================
# build-pkg.ps1 — Empacota o .exe do CLIENTE sem o Super Admin.
#
# Pré-requisitos (rodar antes): npm run build, node sync-prod.js, node obfuscate.js
#
# O pkg embute a pasta `dist/**/*` do projeto. Para que o .exe NÃO contenha
# super-admin, este script:
#   1. renomeia dist/ -> dist.full (backup do frontend completo, usado pelo HUB)
#   2. gera dist/ sem super admin a partir do dist.full
#   3. roda o pkg (embute o dist sem super admin) -> installer/output/ChefCozinha-Server.exe
#   4. propaga o dist sem super admin p/ installer/output/dist e ubuntu-server/dist
#   5. restaura dist/ completo no repositório (finally)
# =============================================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$full = Join-Path $root 'dist.full'

# O Windows pode segurar handles no dist por um instante após o obfuscate/exit do
# node (ex.: antivírus escaneando arquivos recém-gerados). Tenta renomeação e
# remoção com retry para evitar 'acesso negado' transitório.
function Rename-WithRetry {
  param([string]$From, [string]$To, [int]$Tries = 20)
  for ($i = 1; $i -le $Tries; $i++) {
    try { Rename-Item -LiteralPath $From -NewName $To -ErrorAction Stop; return }
    catch {
      if ($i -eq $Tries) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
}

function Remove-WithRetry {
  param([string]$Path, [int]$Tries = 20)
  for ($i = 1; $i -le $Tries; $i++) {
    try {
      if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop }
      return
    }
    catch {
      if ($i -eq $Tries) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
}

if (-not (Test-Path $dist)) { throw 'dist/ nao encontrado. Rode: npm run build && node sync-prod.js && node obfuscate.js' }
if (-not (Test-Path (Join-Path $root 'server-prod.js'))) { throw 'server-prod.js nao encontrado. Rode: node sync-prod.js' }

# O vite dev (npm start) vigia os arquivos e trava o dist no Windows, impedindo a
# troca dist <-> dist.full. Aborta para nao deixar o repositorio em estado parcial.
$devPort = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
if ($devPort) { throw 'O dev server esta rodando (vite na porta 5173). Encerre com Ctrl+C no terminal do npm start antes de empacotar.' }

Write-Host '=== [1/5] Backup do dist completo (dist.full) ==='
if (Test-Path $full) { Remove-Item -Recurse -Force $full }
Rename-WithRetry -From $dist -To 'dist.full'

try {
  Write-Host '=== [2/5] Gerando dist sem super admin ==='
  Push-Location $root
  node strip-super-admin.js $full $dist
  Pop-Location
  if ($LASTEXITCODE -ne 0) { throw 'strip-super-admin falhou (dist).' }

  Write-Host '=== [3/5] Empacotando .exe (pkg) ==='
  Push-Location $root
  node compile-jsc.js
  npx pkg package.json --target node18-win-x64 --output installer/output/ChefCozinha-Server.exe
  Pop-Location
  if ($LASTEXITCODE -ne 0) { throw 'pkg falhou.' }

  Write-Host '=== [4/5] Propagando dist sem super admin aos pacotes de cliente ==='
  foreach ($pkg in @('installer\output\dist', 'ubuntu-server\dist')) {
    $dest = Join-Path $root $pkg
    Write-Host ("  -> " + $pkg)
    Push-Location $root
    node strip-super-admin.js $full $dest
    Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "strip-super-admin falhou para $pkg." }
  }
} finally {
  Write-Host '=== [5/5] Restaurando dist/ completo no repositório ==='
  Remove-WithRetry -Path $dist
  Rename-WithRetry -From $full -To 'dist'
}

Write-Host ''
Write-Host 'Concluído. .exe do cliente (SEM super admin): installer/output/ChefCozinha-Server.exe'
