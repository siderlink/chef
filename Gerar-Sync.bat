@echo off
title Chef Cozinha - Gerador de Pacote do Sync
cls
echo ====================================================================
echo   CHEF COZINHA - GERANDO INSTALADOR E PACOTE DO SYNC AGENT
echo ====================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-sync.ps1"
echo.
if %errorlevel% equ 0 (
    echo ====================================================================
    echo   SUCESSO! O instalador e o pacote ZIP foram gerados na raiz:
    echo   - Instalador-ChefSync.exe
    echo   - ChefSync-Distribuicao.zip
    echo ====================================================================
) else (
    echo [ERRO] Ocorreu uma falha durante o processo de build do Sync.
)
echo.
pause
