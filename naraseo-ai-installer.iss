; Naraseo AI Chrome Extension Installer
; Uses Inno Setup to create professional .exe installer
; Download Inno Setup: https://jrsoftware.org/isdl.php

[Setup]
AppName=Naraseo AI
AppVersion=1.0.0
AppPublisher=Naraseo AI
AppPublisherURL=https://seoai.app
AppSupportURL=https://seoai.app/support
DefaultDirName={pf}\Naraseo AI
DefaultGroupName=Naraseo AI
OutputDir={#SourcePath}
OutputBaseFilename=naraseo-ai-installer
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
AllowNoIcons=yes
DisableWelcomePage=no
DisableProgramGroupPage=yes
UsedUserAreasWarning=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "SETUP_LOCAL.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "naraseo-ai-installer.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\extension"
Name: "{app}\backend"

[Icons]
Name: "{group}\Naraseo AI"; Filename: "{app}\naraseo-ai-installer.bat"; IconFileName: "{app}\extension\icons\icon128.png"
Name: "{group}\Open Extensions (chrome://extensions)"; Filename: "chrome://extensions"; Parameters: ""
Name: "{group}\{cm:UninstallProgram,Naraseo AI}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Naraseo AI Installer"; Filename: "{app}\naraseo-ai-installer.bat"

[Run]
Filename: "{app}\naraseo-ai-installer.bat"; Description: "Load Extension in Chrome"; Flags: nowait postinstall

[UninstallDelete]
Type: dirifempty; Name: "{app}"

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption :=
    'This will install Naraseo AI Chrome Extension.' + #13#13 +
    'Steps:' + #13 +
    '1. Chrome will open' + #13 +
    '2. Toggle Developer mode (top right)' + #13 +
    '3. Extension appears automatically' + #13#13 +
    'No coding or complex setup required!';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox('Installation complete!' + #13#13 +
           'Naraseo AI is ready to use!' + #13#13 +
           'Quick start:' + #13 +
           '1. Visit any website' + #13 +
           '2. Press Ctrl+Shift+S' + #13 +
           '3. Extension sidebar opens',
           mbInformation, MB_OK);
  end;
end;
