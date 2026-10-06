# ==============================================================================
# Build script completo para Chef Cozinha Sync Agent
# Gera:
#   1. Sync.exe (GUI C# / Systray)
#   2. Instalador-ChefSync.exe (Instalador Inno Setup autônomo com node.exe embutido)
#   3. ChefSync-Distribuicao.zip (Pacote completo para distribuição e testes)
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  CHEF COZINHA - GERADOR DE PACOTE DE DISTRIBUICAO DO SYNC AGENT" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# 1. Localizar compilador C#
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) {
    Write-Error "Compilador C# (csc.exe) nao foi encontrado no sistema."
    exit 1
}

$source = Join-Path $PSScriptRoot "installer\Sync.cs"
$icon = Join-Path $PSScriptRoot "installer\icon.ico"
$output = Join-Path $PSScriptRoot "Sync.exe"
$outputDir = Join-Path $PSScriptRoot "installer\output"
$distOutput = Join-Path $outputDir "Sync.exe"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$compileArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/out:$output",
    "/win32icon:$icon",
    "/r:System.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
    "/r:System.Web.Extensions.dll",
    $source
)

Write-Host "`n[1/3] Compilando executavel nativo Sync.exe..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "installer")
try {
    & $csc $compileArgs
} finally {
    Pop-Location
}

if ($LASTEXITCODE -eq 0 -and (Test-Path $output)) {
    Copy-Item -Path $output -Destination $distOutput -Force
    $sizeKb = [math]::Round((Get-Item $output).Length / 1KB, 1)
    Write-Host "  -> Sync.exe compilado com sucesso ($sizeKb KB)" -ForegroundColor Green
} else {
    Write-Error "Falha na compilacao do Sync.exe."
    exit 1
}

# 2. Localizar Inno Setup e compilar Instalador-ChefSync.exe
Write-Host "`n[2/3] Compilando Instalador-ChefSync.exe (Inno Setup)..." -ForegroundColor Yellow
$iscc = $null
$isccCandidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    "C:\Program Files\Inno Setup 5\ISCC.exe"
)
foreach ($c in $isccCandidates) {
    if (Test-Path $c) {
        $iscc = $c
        break
    }
}
if (-not $iscc) {
    $cmd = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $iscc = $cmd.Source }
}

$installerExe = Join-Path $outputDir "Instalador-ChefSync.exe"
$installerRoot = Join-Path $PSScriptRoot "Instalador-ChefSync.exe"

if ($iscc) {
    Write-Host "  Localizado Inno Setup em: $iscc" -ForegroundColor Gray
    $issFile = Join-Path $PSScriptRoot "installer\setup-sync.iss"
    
    & "$iscc" "$issFile" | Out-Null
    
    if (Test-Path $installerExe) {
        Copy-Item -Path $installerExe -Destination $installerRoot -Force
        $instMb = [math]::Round((Get-Item $installerExe).Length / 1MB, 2)
        Write-Host "  -> Instalador-ChefSync.exe gerado com sucesso ($instMb MB)!" -ForegroundColor Green
        Write-Host "     Caminho: $installerExe" -ForegroundColor Green
    } else {
        Write-Warning "Inno Setup executado, mas nao foi possivel encontrar $installerExe."
    }
} else {
    Write-Warning "Inno Setup (ISCC.exe) nao foi encontrado. Instalador-ChefSync.bat disponivel como alternativa."
}

# 3. Gerar Pacote ZIP de Distribuicao
Write-Host "`n[3/3] Criando pacote ZIP de distribuicao (ChefSync-Distribuicao.zip)..." -ForegroundColor Yellow

$tempZipDir = Join-Path $env:TEMP "ChefSync_Build_$(Get-Random)"
if (Test-Path $tempZipDir) { Remove-Item -Recurse -Force $tempZipDir }
New-Item -ItemType Directory -Path $tempZipDir -Force | Out-Null

# Copiar arquivos do pacote
if (Test-Path $installerExe) {
    Copy-Item $installerExe -Destination $tempZipDir -Force
}
Copy-Item $output -Destination $tempZipDir -Force
Copy-Item (Join-Path $PSScriptRoot "sync-daemon.js") -Destination $tempZipDir -Force
Copy-Item (Join-Path $PSScriptRoot "installer\Instalador-ChefSync.bat") -Destination $tempZipDir -Force
Copy-Item (Join-Path $PSScriptRoot "installer\icon.ico") -Destination $tempZipDir -Force
if (Test-Path (Join-Path $PSScriptRoot "installer\node.exe")) {
    Copy-Item (Join-Path $PSScriptRoot "installer\node.exe") -Destination $tempZipDir -Force
}

# Arquivo LEIA-ME com instrucoes
$readmeContent = @"
====================================================================
CHEF COZINHA - AGENTE DE SINCRONIZACAO SYNC
====================================================================

COMO INSTALAR E TESTAR:

OPCAO 1 (RECOMENDADA - 1 CLIQUE):
  Execute o arquivo "Instalador-ChefSync.exe".
  Ele instalara o agente com icone na barra de tarefas (Systray)
  e inicializacao automatica com o Windows.

OPCAO 2 (PORTATIL / SCRIPT):
  Clique com o botao direito em "Instalador-ChefSync.bat" e execute.

OPCAO 3 (TESTE DIRETO):
  Execute diretamente o "Sync.exe" nesta pasta.

CONFIGURACOES:
- Por padrao, o agente conecta ao servidor local na porta 8080 ou 3000.
- Voce pode configurar o Hub Cloud e a Chave de Ativacao clicando no
  icone do Chef Cozinha Sync ao lado do relogio do Windows.

Suporte: Chef Cozinha Sistemas
"@
Set-Content -Path (Join-Path $tempZipDir "LEIA-ME.txt") -Value $readmeContent -Encoding UTF8

$zipOutput = Join-Path $outputDir "ChefSync-Distribuicao.zip"
$zipRoot = Join-Path $PSScriptRoot "ChefSync-Distribuicao.zip"

if (Test-Path $zipOutput) { Remove-Item -Force $zipOutput }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempZipDir, $zipOutput)
Copy-Item -Path $zipOutput -Destination $zipRoot -Force
Remove-Item -Recurse -Force $tempZipDir

$zipMb = [math]::Round((Get-Item $zipOutput).Length / 1MB, 2)
Write-Host "  -> Pacote ChefSync-Distribuicao.zip criado com sucesso ($zipMb MB)!" -ForegroundColor Green

Write-Host "`n====================================================================" -ForegroundColor Cyan
Write-Host "  BUILD CONCLUIDO COM SUCESSO!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Arquivos gerados para teste e distribuicao:" -ForegroundColor White
if (Test-Path $installerRoot) {
    Write-Host " [1] Instalador Windows: $installerRoot" -ForegroundColor Yellow
}
Write-Host " [2] Executavel Direto:  $output" -ForegroundColor Yellow
Write-Host " [3] Pacote Completo:    $zipRoot" -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
