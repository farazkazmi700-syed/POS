#ifndef PayloadDir
  #error PayloadDir must point to the prepared offline release
#endif
#ifndef ReleaseVersion
  #error ReleaseVersion must match release.json
#endif
#ifndef InstallerOutput
  #error InstallerOutput must be an absolute release output directory
#endif

[Setup]
AppId={{3BA3C92E-80EC-4AB9-918D-FBB135F65E0D}
AppName=KazmiOn POS Offline
AppVersion={#ReleaseVersion}
AppPublisher=KazmiOn
DefaultDirName={autopf}\KazmiOn POS Offline
DefaultGroupName=KazmiOn POS
OutputDir={#InstallerOutput}
OutputBaseFilename=KazmiOn-POS-Offline-{#ReleaseVersion}
MinVersion=10.0.19045
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
PrivilegesRequired=admin
Compression=none
DiskSpanning=yes
DiskSliceSize=2100000000
SetupLogging=yes
UninstallDisplayName=KazmiOn POS Offline

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}\releases\{#ReleaseVersion}"; Flags: ignoreversion recursesubdirs

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Icons]
Name: "{group}\KazmiOn POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{#ReleaseVersion}\Start-POS.ps1"""; WorkingDir: "{app}"
Name: "{commondesktop}\KazmiOn POS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{#ReleaseVersion}\Start-POS.ps1"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\Offline setup and recovery"; Filename: "{app}\releases\{#ReleaseVersion}\OFFLINE-SETUP.txt"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{#ReleaseVersion}\Firewall.ps1"" -Action Add"; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{#ReleaseVersion}\Start-POS.ps1"""; Description: "Start KazmiOn POS"; Flags: postinstall runasoriginaluser nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{#ReleaseVersion}\Firewall.ps1"" -Action Remove"; Flags: runhidden waituntilterminated; RunOnceId: "KazmiOnOfflineFirewallRemove"

[Code]
function InitializeSetup(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.ProductType = 1) and
    ((Version.Build = 19045) or (Version.Build >= 22631));
  if not Result then
    MsgBox('KazmiOn requires supported 64-bit Windows 10 22H2 or Windows 11 23H2 and later. Check Docker Desktop support before installation.', mbError, MB_OK);
end;
