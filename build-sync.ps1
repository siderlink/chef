# Build script para Chef Cozinha Sync Agent (Sync.exe)
$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Chef Cozinha - Compilando Sync.exe" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (-not (Test-Path $csc)) {
    Write-Error "Compilador C# (csc.exe) não foi encontrado no sistema."
    exit 1
}

$source = Join-Path $PSScriptRoot "installer\Sync.cs"
$icon = Join-Path $PSScriptRoot "installer\icon.ico"
$output = Join-Path $PSScriptRoot "Sync.exe"
$distOutput = Join-Path $PSScriptRoot "installer\output\Sync.exe"

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

Write-Host "Compilando $source ..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "installer")
try {
    & $csc $compileArgs
} finally {
    Pop-Location
}

if ($LASTEXITCODE -eq 0) {
    if (-not (Test-Path (Join-Path $PSScriptRoot "installer\output"))) {
        New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "installer\output") -Force | Out-Null
    }
    Copy-Item -Path $output -Destination $distOutput -Force
    Write-Host "Sync.exe compilado com sucesso!" -ForegroundColor Green
    Write-Host "Binário gerado em: $output e $distOutput" -ForegroundColor Green
} else {
    Write-Error "Falha na compilação do Sync.exe."
    exit 1
}
