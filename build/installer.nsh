; RA Assistant – extra install/uninstall steps (included by electron-builder's NSIS template).

!macro customInstall
  ; A dev copy may have left shortcuts that start "electron.exe <folder>"; the installed app owns them now.
  Delete "$SMPROGRAMS\Electron.lnk"
  ; RA's own autostart shortcut is (re)written by the app on first start; point it at the installed exe now.
  IfFileExists "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\RA Assistant.lnk" 0 +2
    CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\RA Assistant.lnk" "$INSTDIR\RA Assistant.exe" "" "$INSTDIR\RA Assistant.exe" 0
!macroend

!macro customUnInstall
  ; The island ignores close requests by design; make sure no copy keeps files locked.
  nsExec::Exec 'taskkill /f /im "RA Assistant.exe"'
  ; Shortcuts RA creates itself (autostart, Start Menu self-heal).
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\RA Assistant.lnk"
  Delete "$SMPROGRAMS\Electron.lnk"
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Hapus juga pengaturan, data, dan cache RA Assistant?$\r$\n(Pilih Tidak bila ingin memasang ulang nanti tanpa kehilangan pengaturan.)" /SD IDNO IDNO keepData
      RMDir /r "$APPDATA\RAAssistant"
      RMDir /r "$LOCALAPPDATA\RAAssistant"
    keepData:
  ${endIf}
!macroend
