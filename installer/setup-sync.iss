; Chef Cozinha — Inno Setup Script para o Agente Sync (Windows 7/8/8.1/10/11)
; Compila o Instalador-ChefSync.exe

#define AppName "Chef Cozinha Sync"
#define AppVersion "1.2.0"
#define AppPublisher "Chef Cozinha Sistemas"
#define AppURL "https://hub.chefcozinha.com.br"
#define AppExeName "Sync.exe"

[Setup]
AppId={{C8E91A2B-3C4D-5E6F-7A8B-9C0D1E2F3A4B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={userappdata}\ChefCozinha\Sync
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=Instalador-ChefSync
SetupIconFile=icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\icon.ico

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Iniciar automaticamente com o Windows (Recomendado)"; GroupDescription: "Inicialização:"; Flags: checkedonce

[Files]
Source: "..\sync-daemon.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Sync.exe"; DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\..\Sync.exe'))
Source: "node.exe"; DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\node.exe'))

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{app}\Sync.exe"; IconFilename: "{app}\icon.ico"; Comment: "Chef Cozinha Sync Agent"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\Sync.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon; Comment: "Chef Cozinha Sync Agent"
Name: "{userstartup}\{#AppName}"; Filename: "{app}\Sync.exe"; Tasks: startup; Comment: "Iniciar Chef Cozinha Sync com o Windows"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ChefSync"; ValueData: """{app}\Sync.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\Sync.exe"; Description: "Iniciar Chef Cozinha Sync agora"; Flags: nowait postinstall skipifsilent
