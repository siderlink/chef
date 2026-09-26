# ==============================================================================
# Chef Cozinha — Instalador PowerShell do Agente Sync
# Compatível com: Windows 7 SP1, 8, 8.1, 10, 11 | PowerShell 2.0+
# Suporta TLS 1.2, execução não-interativa e auto-inicialização como serviço/tarefa
# ==============================================================================

[CmdletBinding()]
param(
    [string]$HubUrl = "https://hub.chefcozinha.com.br",
    [string]$ActivationKey = "",
    [int]$LocalPort = 3000,
    [switch]$Uninstall,
    [switch]$Silent
)

# Força TLS 1.2 (indispensável para Windows 7 SP1 e Windows 8)
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor 3072
} catch {
    # Em ambientes muito legados, tenta configurar protocolo seguro
}

$InstallDir = Join-Path $env:LOCALAPPDATA "ChefCozinha\Sync"
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")

function Write-ChefHeader {
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host "   CHEF COZINHA - AGENTE SYNC (Instalador PowerShell)" -ForegroundColor White
    Write-Host "   Compatível: Windows 7, 8, 8.1, 10, 11 | x86 / x64 / ARM64" -ForegroundColor Gray
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Do-Uninstall {
    Write-Host "[*] Desinstalando Chef Cozinha Sync..." -ForegroundColor Yellow
    Get-Process -Name "node", "Sync" -ErrorAction SilentlyContinue | Where-Object { 
        try { $_.Path -like "*$InstallDir*" } catch { $false } 
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    # Remove registro
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "ChefSync" -ErrorAction SilentlyContinue
    
    # Remove Startup shortcut
    $startupVbs = Join-Path $StartupFolder "ChefSync.vbs"
    if (Test-Path $startupVbs) { Remove-Item $startupVbs -Force -ErrorAction SilentlyContinue }

    # Remove agendador
    schtasks.exe /delete /tn "ChefCozinhaSync" /f 2>$null

    # Remove diretório
    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Chef Cozinha Sync desinstalado com sucesso." -ForegroundColor Green
    return
}

if ($Uninstall) {
    Do-Uninstall
    exit 0
}

Write-ChefHeader

# Pergunta chave de ativação interativamente caso não informada
if (-not $Silent -and [string]::IsNullOrEmpty($ActivationKey)) {
    Write-Host "Hub Conector: $HubUrl" -ForegroundColor Gray
    $promptKey = Read-Host "Digite a Chave de Ativação do Restaurante (ou Enter para pular)"
    if (-not [string]::IsNullOrEmpty($promptKey)) {
        $ActivationKey = $promptKey.Trim()
    }
}

# 1. Localiza ou instala Node.js
Write-Host "[*] Verificando runtime Node.js..." -ForegroundColor Yellow
$nodeExe = $null

$whereNode = Get-Command "node" -ErrorAction SilentlyContinue
if ($whereNode) {
    $nodeExe = $whereNode.Source
} else {
    $candidates = @(
        (Join-Path $PSScriptRoot "node.exe"),
        (Join-Path $PSScriptRoot "..\installer\node.exe"),
        "C:\ChefCozinha\node.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\ChefCozinha\node.exe"),
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        (Join-Path $InstallDir "node.exe")
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            $nodeExe = $cand
            break
        }
    }
}

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

if (-not $nodeExe) {
    Write-Host "[!] Node.js não encontrado. Baixando executável standalone portátil..." -ForegroundColor Yellow
    $destNode = Join-Path $InstallDir "node.exe"
    $wc = New-Object System.Net.WebClient
    try {
        $wc.DownloadFile("$HubUrl/api/sync/installers/node-portable.exe", $destNode)
    } catch {
        try {
            $wc.DownloadFile("https://nodejs.org/dist/v16.20.2/win-x86/node.exe", $destNode)
        } catch {
            Write-Warning "Falha ao baixar runtime Node.js automaticamente."
        }
    }
    if (Test-Path $destNode) {
        $nodeExe = $destNode
        Write-Host "[OK] Node.js portátil preparado." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Node.js detectado: $nodeExe" -ForegroundColor Green
}

# 2. Copia ou baixa sync-daemon.js
Write-Host "[*] Instalando arquivos do daemon..." -ForegroundColor Yellow
$daemonDest = Join-Path $InstallDir "sync-daemon.js"
$localDaemon = Join-Path $PSScriptRoot "..\sync-daemon.js"
if (-not (Test-Path $localDaemon)) {
    $localDaemon = Join-Path $PSScriptRoot "sync-daemon.js"
}

if (Test-Path $localDaemon) {
    Copy-Item $localDaemon $daemonDest -Force
} else {
    $wc = New-Object System.Net.WebClient
    try {
        $wc.DownloadFile("$HubUrl/api/sync/installers/sync-daemon.js", $daemonDest)
    } catch {
        Write-Error "Falha ao obter sync-daemon.js do servidor Hub: $_"
        exit 1
    }
}

# 3. Cria configuração sync_config.json
Write-Host "[*] Criando sync_config.json..." -ForegroundColor Yellow
$configObj = @{
    cloud_url = $HubUrl
    local_port = $LocalPort
    poll_interval_seconds = 10
    activation_key = $ActivationKey
    is_activated = [bool](-not [string]::IsNullOrEmpty($ActivationKey))
    auto_start = $true
    minimize_to_tray = $true
}

$configJson = ConvertTo-Json $configObj -Depth 3
$configFile = Join-Path $InstallDir "sync_config.json"
[System.IO.File]::WriteAllText($configFile, $configJson, [System.Text.Encoding]::UTF8)

# 4. Cria launcher silencioso VBS
$vbsPath = Join-Path $InstallDir "iniciar-sync.vbs"
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$InstallDir"
WshShell.Run """$nodeExe"" ""$daemonDest""", 0, False
"@
[System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::ASCII)

# 5. Configura Inicialização Automática
Write-Host "[*] Configurando inicialização automática no logon..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "ChefSync" -Value "wscript.exe `"$vbsPath`"" -Force

# Copia para pasta Inicializar
$startupVbs = Join-Path $StartupFolder "ChefSync.vbs"
Copy-Item $vbsPath $startupVbs -Force -ErrorAction SilentlyContinue

# Se for Administrador, cria tarefa no agendador com privilégios máximos
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    schtasks.exe /create /tn "ChefCozinhaSync" /tr "wscript.exe `"$vbsPath`"" /sc onlogon /rl highest /f 2>$null | Out-Null
}

# 6. Testa conectividade
Write-Host "[*] Testando conectividade com o Hub..." -ForegroundColor Yellow
if ($nodeExe) {
    & $nodeExe $daemonDest --test
}

# 7. Dispara execução
Write-Host "[*] Iniciando agente em segundo plano..." -ForegroundColor Yellow
Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`""

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
Write-Host "  Pasta: $InstallDir" -ForegroundColor White
Write-Host "  Hub:   $HubUrl" -ForegroundColor White
if ($ActivationKey) {
    Write-Host "  Chave: $ActivationKey" -ForegroundColor White
}
Write-Host "  O serviço agora roda silenciosamente em segundo plano." -ForegroundColor Gray
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
