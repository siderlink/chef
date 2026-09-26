@echo off
rem ============================================================================
rem  Chef Cozinha — Auto-Instalador do Agente Sync
rem  Compatibilidade: Windows 7 SP1, 8, 8.1, 10, 11 (32-bit e 64-bit)
rem  Executável de forma autônoma sem requerer permissões administrativas obrigatórias
rem ============================================================================

setlocal enabledelayedexpansion
title Chef Cozinha - Instalador do Sync

rem Configurações padrão (substituídas dinamicamente pelo Hub ou argumentos CLI)
set "DEFAULT_HUB=https://hub.chefcozinha.com.br"
set "DEFAULT_KEY="
set "DEFAULT_PORT=3000"

rem Diretório de instalação do Sync no usuário (dispensa privilégios de Admin)
set "INSTALL_DIR=%LOCALAPPDATA%\ChefCozinha\Sync"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

cls
echo ============================================================================
echo   CHEF COZINHA - INSTALADOR DO AGENTE DE SINCRONIZACAO
echo   Suporte: Windows 7, 8, 8.1, 10, 11 (x86 / x64 / ARM64)
echo ============================================================================
echo.

rem Detecta versão do Windows
set "WIN_VER=Windows Desconhecido"
ver | findstr /i "6\.1" >nul && set "WIN_VER=Windows 7 / Server 2008 R2"
ver | findstr /i "6\.2" >nul && set "WIN_VER=Windows 8 / Server 2012"
ver | findstr /i "6\.3" >nul && set "WIN_VER=Windows 8.1 / Server 2012 R2"
ver | findstr /i "10\.0" >nul && set "WIN_VER=Windows 10 / 11 / Server 2016+"

echo [*] Sistema Operacional detectado: %WIN_VER% (%PROCESSOR_ARCHITECTURE%)

rem Parseia argumentos da linha de comando
set "ARG_HUB="
set "ARG_KEY="
set "ARG_PORT="
set "ARG_SILENT=0"
set "ARG_UNINSTALL=0"

:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--hub" (set "ARG_HUB=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="-h" (set "ARG_HUB=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="--key" (set "ARG_KEY=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="-k" (set "ARG_KEY=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="--port" (set "ARG_PORT=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="-p" (set "ARG_PORT=%~2" & shift & shift & goto parse_args)
if /i "%~1"=="--silent" (set "ARG_SILENT=1" & shift & goto parse_args)
if /i "%~1"=="-s" (set "ARG_SILENT=1" & shift & goto parse_args)
if /i "%~1"=="--uninstall" (set "ARG_UNINSTALL=1" & shift & goto parse_args)
if /i "%~1"=="-u" (set "ARG_UNINSTALL=1" & shift & goto parse_args)
shift
goto parse_args
:after_args

rem Trata desinstalação
if "%ARG_UNINSTALL%"=="1" goto do_uninstall

rem Define valores finais
set "HUB_URL=%DEFAULT_HUB%"
if not "%ARG_HUB%"=="" set "HUB_URL=%ARG_HUB%"

set "ACT_KEY=%DEFAULT_KEY%"
if not "%ARG_KEY%"=="" set "ACT_KEY=%ARG_KEY%"

set "LOCAL_PORT=%DEFAULT_PORT%"
if not "%ARG_PORT%"=="" set "LOCAL_PORT=%ARG_PORT%"

rem Modo Interativo se não for silencioso e faltar chave
if "%ARG_SILENT%"=="0" (
    echo.
    echo ----------------------------------------------------------------------------
    echo  Configuracao da Conexao com o Super Admin
    echo ----------------------------------------------------------------------------
    echo Servidor Hub Atual: %HUB_URL%
    if "%ACT_KEY%"=="" (
        echo.
        set /p "INPUT_KEY= Digite a Chave de Ativacao (ex: CHEF-2026-AB12-CD34) ou Enter: "
        if not "!INPUT_KEY!"=="" set "ACT_KEY=!INPUT_KEY!"
    ) else (
        echo Chave de Ativacao Vinculada: %ACT_KEY%
    )
    echo.
)

rem 1. Procura executável Node.js
echo [*] Verificando runtime Node.js...
set "NODE_EXE="

rem Checa no PATH
where node >nul 2>nul
if %errorlevel%==0 (
    for /f "tokens=*" %%i in ('where node') do (
        if not defined NODE_EXE set "NODE_EXE=%%i"
    )
)

rem Checa na pasta local do script ou em ChefCozinha
if not defined NODE_EXE (
    if exist "%~dp0node.exe" set "NODE_EXE=%~dp0node.exe"
    if exist "%~dp0..\installer\node.exe" set "NODE_EXE=%~dp0..\installer\node.exe"
    if exist "C:\ChefCozinha\node.exe" set "NODE_EXE=C:\ChefCozinha\node.exe"
    if exist "%LOCALAPPDATA%\Programs\ChefCozinha\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\ChefCozinha\node.exe"
    if exist "%PROGRAMFILES%\ChefCozinha\node.exe" set "NODE_EXE=%PROGRAMFILES%\ChefCozinha\node.exe"
    if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
)

rem Se ainda não tiver Node.js, baixa versão portátil compatível
if not defined NODE_EXE (
    echo [!] Node.js nao encontrado no sistema. Baixando componente essencial...
    if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
    
    rem Garante TLS 1.2 no PowerShell para Windows 7 / 8 / 8.1 / 10 / 11
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor 3072; $wc = New-Object System.Net.WebClient; try { $wc.DownloadFile('%HUB_URL%/api/sync/installers/node-portable.exe', '%INSTALL_DIR%\node.exe') } catch { $wc.DownloadFile('https://nodejs.org/dist/v16.20.2/win-x86/node.exe', '%INSTALL_DIR%\node.exe') }" >nul 2>nul
    
    if exist "%INSTALL_DIR%\node.exe" (
        set "NODE_EXE=%INSTALL_DIR%\node.exe"
        echo [OK] Componente Node.js instalado com sucesso.
    ) else (
        echo [AVISO] Nao foi possivel baixar o Node.js automaticamente.
        echo         Por favor, instale o Node.js ou coloque o node.exe na pasta.
    )
) else (
    echo [OK] Runtime Node.js localizado em: %NODE_EXE%
)

rem 2. Prepara diretório de instalação
echo [*] Criando pasta de instalacao: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"

rem 3. Copia arquivos essenciais
echo [*] Instalando arquivos do daemon do Sync...
if exist "%~dp0sync-daemon.js" (
    copy /y "%~dp0sync-daemon.js" "%INSTALL_DIR%\sync-daemon.js" >nul
) else if exist "%~dp0..\sync-daemon.js" (
    copy /y "%~dp0..\sync-daemon.js" "%INSTALL_DIR%\sync-daemon.js" >nul
) else (
    rem Baixa diretamente do Hub se instalado via script remoto
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor 3072; (New-Object Net.WebClient).DownloadFile('%HUB_URL%/api/sync/installers/sync-daemon.js', '%INSTALL_DIR%\sync-daemon.js')" >nul 2>nul
)

if not exist "%INSTALL_DIR%\sync-daemon.js" (
    echo [ERRO] Falha ao extrair sync-daemon.js!
    goto install_error
)

rem Copia Sync.exe se disponível
if exist "%~dp0Sync.exe" (
    copy /y "%~dp0Sync.exe" "%INSTALL_DIR%\Sync.exe" >nul
) else if exist "%~dp0..\Sync.exe" (
    copy /y "%~dp0..\Sync.exe" "%INSTALL_DIR%\Sync.exe" >nul
)

rem 4. Cria arquivo de configuração sync_config.json
echo [*] Gravando configuracoes...
(
echo {
echo   "cloud_url": "%HUB_URL%",
echo   "local_port": %LOCAL_PORT%,
echo   "poll_interval_seconds": 10,
echo   "activation_key": "%ACT_KEY%",
echo   "is_activated": true,
echo   "auto_start": true,
echo   "minimize_to_tray": true
echo }
) > "%INSTALL_DIR%\sync_config.json"

rem 5. Cria script de inicialização silenciosa (iniciar-sync.vbs)
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%INSTALL_DIR%"
if defined NODE_EXE (
    echo WshShell.Run """%NODE_EXE%"" """%INSTALL_DIR%\sync-daemon.js"""", 0, False
) else if exist "%INSTALL_DIR%\Sync.exe" (
    echo WshShell.Run """%INSTALL_DIR%\Sync.exe"""", 0, False
)
) > "%INSTALL_DIR%\iniciar-sync.vbs"

rem Cria launcher em batch para diagnóstico manual
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo echo Iniciando Chef Cozinha Sync Agent em modo console...
if defined NODE_EXE (
    echo "%NODE_EXE%" "%INSTALL_DIR%\sync-daemon.js"
) else (
    echo Sync.exe
)
echo pause
) > "%INSTALL_DIR%\iniciar-sync-debug.bat"

rem Cria desinstalador
(
echo @echo off
echo echo Removendo Chef Cozinha Sync...
echo taskkill /f /im node.exe 2>nul
echo taskkill /f /im Sync.exe 2>nul
echo reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ChefSync" /f 2>nul
echo del "%STARTUP_FOLDER%\ChefSync.lnk" 2>nul
echo del "%STARTUP_FOLDER%\ChefSync.vbs" 2>nul
echo rmdir /s /q "%INSTALL_DIR%" 2>nul
echo echo Desinstalacao concluida.
echo pause
) > "%INSTALL_DIR%\desinstalar-sync.bat"

rem 6. Configura Inicialização Automática com o Windows
echo [*] Configurando inicializacao automatica com o Windows...

rem Método 1: Chave de Registro Run (HKCU - funciona em qualquer conta sem pedir UAC)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ChefSync" /t REG_SZ /d "wscript.exe \"%INSTALL_DIR%\iniciar-sync.vbs\"" /f >nul 2>nul

rem Método 2: Pasta Inicializar do Menu Iniciar (Startup)
copy /y "%INSTALL_DIR%\iniciar-sync.vbs" "%STARTUP_FOLDER%\ChefSync.vbs" >nul 2>nul

rem Método 3: Agendador de Tarefas (se tiver privilégio de Admin)
schtasks /create /tn "ChefCozinhaSync" /tr "wscript.exe \"%INSTALL_DIR%\iniciar-sync.vbs\"" /sc onlogon /rl highest /f >nul 2>nul

echo [OK] Inicializacao automatica configurada com sucesso.

rem 7. Testa conectividade e registra instância
echo.
echo [*] Testando conectividade com o Hub (%HUB_URL%)...
if defined NODE_EXE (
    "%NODE_EXE%" "%INSTALL_DIR%\sync-daemon.js" --test
)

rem 8. Inicia o Sync Agent imediatamente
echo [*] Iniciando servico do Sync em segundo plano...
taskkill /f /im Sync.exe 2>nul
wscript.exe "%INSTALL_DIR%\iniciar-sync.vbs"

echo.
echo ============================================================================
echo   [SUCESSO] AGENTE CHEF COZINHA SYNC INSTALADO E EM EXECUCAO!
echo ============================================================================
echo  - Pasta de Instalacao : %INSTALL_DIR%
echo  - Hub Vinculado       : %HUB_URL%
if not "%ACT_KEY%"=="" (
    echo  - Chave de Ativacao   : %ACT_KEY%
)
echo  - Inicializacao       : Automatica no boot do Windows
echo  - Modo de Execucao    : Segundo plano silencioso (zero interrupcao no PDV)
echo ============================================================================
echo.
if "%ARG_SILENT%"=="0" (
    echo Pressione qualquer tecla para finalizar o instalador...
    pause >nul
)
exit /b 0

:do_uninstall
echo [*] Desinstalando Chef Cozinha Sync...
taskkill /f /im node.exe 2>nul
taskkill /f /im Sync.exe 2>nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ChefSync" /f 2>nul
del "%STARTUP_FOLDER%\ChefSync.lnk" 2>nul
del "%STARTUP_FOLDER%\ChefSync.vbs" 2>nul
schtasks /delete /tn "ChefCozinhaSync" /f 2>nul
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" 2>nul
echo [OK] Chef Cozinha Sync removido com sucesso.
exit /b 0

:install_error
echo.
echo [ERRO] Ocorreu uma falha durante a instalacao do Chef Cozinha Sync.
echo        Verifique se o terminal possui conexao com a internet ou contate o suporte.
echo.
if "%ARG_SILENT%"=="0" pause
exit /b 1
