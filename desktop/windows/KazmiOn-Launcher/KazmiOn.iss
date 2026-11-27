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
Source: "KazmiOn-Start.ps1"; DestDir: "{app}\desktop\windows\KazmiOn-Launcher"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
Source: "KazmiOn-Launch.bat"; DestDir: "{app}\desktop\windows\KazmiOn-Launcher"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
; Full offline POS installer requires the application sources/images and Docker runtime provisioner.
; Select the root of an existing POS checkout when installing.

[Icons]
Name: "{group}\KazmiOn POS Launcher"; Filename: "{app}\desktop\windows\KazmiOn-Launcher\KazmiOn-Launch.bat"
Name: "{autodesktop}\KazmiOn POS Launcher"; Filename: "{app}\desktop\windows\KazmiOn-Launcher\KazmiOn-Launch.bat"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not FileExists(ExpandConstant('{app}\docker\compose\compose.yaml')) then
    Result := 'Select the root directory of an existing KazmiOn POS checkout.';
end;
