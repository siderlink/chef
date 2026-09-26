# build-installer.ps1
# Script de build completo do instalador Chef Cozinha
# Execute: powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
#
# O instalador (cliente) NÃO pode conter o Super Admin. Por isso, antes do pkg e
# da cópia do frontend, o dist é stripado com strip-super-admin.js (mesmo fluxo
# do build-pkg.ps1). O HUB (com super admin) é montado separadamente (build-hub.ps1).

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $ROOT 'dist'
$full = Join-Path $ROOT 'dist.full'

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

Write-Host "=== Chef Cozinha - Build Instalador ===" -ForegroundColor Cyan
Set-Location $ROOT

# O vite dev (npm start) vigia os arquivos e trava o dist no Windows, impedindo a
# troca dist <-> dist.full. Aborta para nao deixar o repositorio em estado parcial.
$devPort = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
if ($devPort) { throw 'O dev server esta rodando (vite na porta 5173). Encerre com Ctrl+C no terminal do npm start antes de empacotar.' }

# 1. Build frontend
Write-Host "`n[1/5] Compilando frontend (Vite)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Falha no vite build" }

# 2. Sincronizar servidor de produção e ofuscar o código
Write-Host "`n[2/5] Sincronizando e ofuscando código..." -ForegroundColor Yellow
node sync-prod.js
if ($LASTEXITCODE -ne 0) { throw "Falha no sync-prod" }
node obfuscate.js
if ($LASTEXITCODE -ne 0) { throw "Falha na ofuscação" }

# 3. Empacotar servidor com pkg + compilar GUI C# usando dist SEM super admin
Write-Host "`n[3/5] Empacotando servidor (pkg) e GUI C#..." -ForegroundColor Yellow
if (Test-Path $full) { Remove-Item -Recurse -Force $full }
Rename-WithRetry -From $dist -To 'dist.full'
try {
  # dist da raiz sem super admin (o pkg embute o dist/ para o .exe)
  node strip-super-admin.js $full $dist
  if ($LASTEXITCODE -ne 0) { throw "strip-super-admin falhou (dist)." }

  npx pkg package.json --target node18-win-x64 --output installer/output/ChefCozinha-Server.exe
  if ($LASTEXITCODE -ne 0) { throw "Falha no pkg" }

  # frontend sem super admin copiado para o instalador
  Remove-Item -Path ".\installer\output\dist" -Recurse -ErrorAction SilentlyContinue
  node strip-super-admin.js $full ".\installer\output\dist"
  if ($LASTEXITCODE -ne 0) { throw "strip-super-admin falhou (installer output)." }

  Write-Host "Compilando GUI C# com WebView2 (ChefCozinha.exe)..." -ForegroundColor Yellow
  $csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  & $csc /target:winexe /out:installer\output\ChefCozinha.exe /win32icon:installer\icon.ico /reference:installer\webview2\lib\net45\Microsoft.Web.WebView2.Core.dll /reference:installer\webview2\lib\net45\Microsoft.Web.WebView2.WinForms.dll installer\ChefCozinhaWebView2.cs
  if ($LASTEXITCODE -ne 0) { throw "Falha na compilação do C# GUI com WebView2" }

  Write-Host "Compilando Sync Agent (Sync.exe)..." -ForegroundColor Yellow
  & $csc /nologo /target:winexe /optimize+ /out:installer\output\Sync.exe /win32icon:installer\icon.ico /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll installer\Sync.cs
  if ($LASTEXITCODE -ne 0) { throw "Falha na compilação do Sync.exe" }
  Copy-Item -Path "installer\output\Sync.exe" -Destination "Sync.exe" -Force
} finally {
  # Restaura o dist/ completo no repositório
  Remove-WithRetry -Path $dist
  Rename-WithRetry -From $full -To 'dist'
}

# 4. Copiar dependências e certificado para installer/output
Write-Host "`n[4/5] Copiando dependências e certificado..." -ForegroundColor Yellow
Copy-Item -Path ".\node_modules\sqlite3\build\Release\node_sqlite3.node" -Destination ".\installer\output\node_sqlite3.node" -Force
Copy-Item -Path ".\node_modules\bcrypt\prebuilds\win32-x64\bcrypt.node" -Destination ".\installer\output\bcrypt.node" -Force
if (Test-Path ".\database.sqlite") {
  Copy-Item -Path ".\database.sqlite" -Destination ".\installer\output\database.sqlite" -Force
} else {
  Write-Host "database.sqlite da raiz não encontrado — mantendo o template existente em installer\output\database.sqlite" -ForegroundColor Yellow
}

# Copiar DLLs do WebView2
Copy-Item -Path ".\installer\webview2\lib\net45\Microsoft.Web.WebView2.Core.dll" -Destination ".\installer\output\Microsoft.Web.WebView2.Core.dll" -Force
Copy-Item -Path ".\installer\webview2\lib\net45\Microsoft.Web.WebView2.WinForms.dll" -Destination ".\installer\output\Microsoft.Web.WebView2.WinForms.dll" -Force
Copy-Item -Path ".\installer\webview2\build\native\x64\WebView2Loader.dll" -Destination ".\installer\output\WebView2Loader.dll" -Force


# Gerar/Copiar certificado SSL PFX
$certPath = ".\installer\output\cert.pfx"
if (-not (Test-Path $certPath)) {
  if (Test-Path ".\installer\cert.pfx") {
    Copy-Item -Path ".\installer\cert.pfx" -Destination $certPath -Force
  } else {
    Write-Host "Gerando certificado autoassinado (SSL)..." -ForegroundColor Yellow
    $password = ConvertTo-SecureString -String "chefcozinha" -Force -AsPlainText
    $cert = New-SelfSignedCertificate -DnsName "ChefCozinha", "localhost", "127.0.0.1" -CertStoreLocation "cert:\CurrentUser\My" -FriendlyName "Chef Cozinha Self-Signed"
    Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $password | Out-Null
  }
}

# 5. Gerar instalador com Inno Setup
Write-Host "`n[5/5] Gerando instalador .exe (Inno Setup)..." -ForegroundColor Yellow

$iscc = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Host "Inno Setup não encontrado. Baixando..." -ForegroundColor Yellow
  $installer_url = "https://jrsoftware.org/download.php/is.exe"
  $installer_path = "$env:TEMP\innosetup.exe"
  Invoke-WebRequest -Uri $installer_url -OutFile $installer_path -UseBasicParsing
  Start-Process -Wait -FilePath $installer_path -ArgumentList "/VERYSILENT /SP-"
  $iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
}

& $iscc ".\installer\setup.iss"
if ($LASTEXITCODE -ne 0) { throw "Falha no Inno Setup" }

Write-Host "`n✅ Instalador gerado em: installer\ChefCozinha-Setup.exe" -ForegroundColor Green
$size = [math]::Round((Get-Item ".\installer\ChefCozinha-Setup.exe").Length / 1MB, 1)
Write-Host "Tamanho: ${size}MB" -ForegroundColor Green
