!include "nsDialogs.nsh"
!include "x64.nsh"
; Keep the display name and shortcut labels; the installation folder is named Tijori.
!undef APP_FILENAME
!define APP_FILENAME "Tijori"

!macro tijoriRun SCRIPT ARGUMENTS
  ${DisableX64FSRedirection}
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${SCRIPT}" ${ARGUMENTS}'
  Pop $R7
  ${EnableX64FSRedirection}
  ${If} $R7 != "0"
    MessageBox MB_ICONSTOP "Tijori setup could not finish this step. See the installer details." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Section "-Check installation location"
      InitPluginsDir
      SetOutPath "$PLUGINSDIR"
      File "/oname=maintenance.ps1" "${BUILD_RESOURCES_DIR}\..\installer\maintenance.ps1"
      !insertmacro tijoriRun "$PLUGINSDIR\maintenance.ps1" '-Action CheckLocation -InstallDir "$INSTDIR"'
    SectionEnd
  !else
    ; Executes after the user starts the uninstall, before electron-builder moves or removes files.
    Section "un.Stop Tijori services"
      InitPluginsDir
      SetOutPath "$PLUGINSDIR"
      File "/oname=maintenance.ps1" "${BUILD_RESOURCES_DIR}\..\installer\maintenance.ps1"
      !insertmacro tijoriRun "$INSTDIR\resources\service\install.ps1" '-Mode Uninstall -InstallDir "$INSTDIR"'
      !insertmacro tijoriRun "$PLUGINSDIR\maintenance.ps1" "-Action CloseFirewall"
    SectionEnd
  !endif
!macroend

!macro customInstall
  !insertmacro tijoriRun "$INSTDIR\resources\service\install.ps1" '-Mode Install -InstallDir "$INSTDIR"'
  !insertmacro tijoriRun "$PLUGINSDIR\maintenance.ps1" '-Action OpenFirewall -InstallDir "$INSTDIR"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Tijori POS" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  Var /GLOBAL tijoriErase
  Var /GLOBAL tijoriEraseCheckbox
  UninstPage custom un.TijoriDataPage un.TijoriDataLeave
  Function un.TijoriDataPage
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 36u "Uninstalling Tijori normally keeps your shop database, backups and logs for future use."
    Pop $0
    ${NSD_CreateCheckbox} 0 42u 100% 36u "Permanently erase the shop database, backups and logs on this computer"
    Pop $tijoriEraseCheckbox
    nsDialogs::Show
  FunctionEnd
  Function un.TijoriDataLeave
    ${NSD_GetState} $tijoriEraseCheckbox $tijoriErase
  FunctionEnd
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Tijori POS"
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
  ${AndIf} $tijoriErase == ${BST_CHECKED}
    !insertmacro tijoriRun "$PLUGINSDIR\maintenance.ps1" "-Action EraseData"
  ${EndIf}
!macroend
