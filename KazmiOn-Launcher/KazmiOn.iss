#define MyAppName "KazmiOn POS Launcher"
#define MyAppVersion "1.0.0"
[Setup]
AppId={{8A2F13B5-91A6-4D84-84DA-38C4A7A0CB29}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\KazmiOn
DefaultGroupName=KazmiOn
OutputDir=output
OutputBaseFilename=KazmiOn-Launcher-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "KazmiOn-Start.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "KazmiOn-Launch.bat"; DestDir: "{app}"; Flags: ignoreversion
; Full offline POS installer requires the application sources/images and Docker runtime provisioner.
; This script installs ONLY the launcher; copy it to the existing POS repository root.

[Icons]
Name: "{group}\KazmiOn POS Launcher"; Filename: "{app}\KazmiOn-Launch.bat"
Name: "{autodesktop}\KazmiOn POS Launcher"; Filename: "{app}\KazmiOn-Launch.bat"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"
