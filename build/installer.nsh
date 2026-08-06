; Custom NSIS include for EnlaceCraft's Windows installer.
; Wired in via package.json's "nsis.include" setting.
;
; electron-builder's own built-in "please close the app first" check
; only looks for a process matching the app's own executable name
; (${APP_EXECUTABLE_FILENAME}, i.e. EnlaceCraft.exe). It has no idea
; about nmrgraph_server.exe - the bundled NMR-prediction helper process
; EnlaceCraft spawns as a *separate* OS process (see electron/server.cjs)
; - so if a copy of it is ever left running (an older build that predates
; the shutdown-ordering fix, a crash, anything that skipped a clean
; exit), it can still be holding a file lock inside the install
; directory even when no EnlaceCraft window is visible anywhere. The
; installer's check has nothing that would explain that to the user,
; so it just shows the generic "cannot be closed - close it manually
; and click Retry" prompt.
;
; customInit runs before electron-builder's own running-instance check.
; Force-closing both process names here first means that check almost
; always finds nothing left to complain about, so the manual prompt
; shouldn't need to appear at all - this is the "force close" step,
; just automatic rather than a button someone has to click.
;
; nsExec::Exec runs the command hidden (no flashing console window) and
; ignores a nonzero exit code (e.g. "process not found") on purpose -
; that's the expected, harmless outcome most of the time.
!macro customInit
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::Exec 'taskkill /F /IM "nmrgraph_server.exe" /T'

  ; Works around a known electron-builder bug (see
  ; electron-userland/electron-builder#9593): when a new installer
  ; finds a previous version installed, electron-builder's own NSIS
  ; template silently runs the OLD uninstaller first, in the
  ; background, before installing the new files. That background
  ; uninstall run has its own "is the app running?" check, and in
  ; recent electron-builder versions that check can misfire and
  ; report "can't be closed" even with nothing running anywhere -
  ; exactly the symptom that only goes away by uninstalling manually
  ; first, since that's the one path that skips this broken step.
  ;
  ; The fix is to remove the old uninstaller's registry pointers here,
  ; before electron-builder's template gets a chance to invoke it, so
  ; that background auto-uninstall step never happens. customInstall
  ; below then forces the new build's files to overwrite the old ones
  ; directly instead of relying on the (broken) uninstall-then-install
  ; flow.
  SetRegView 64
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  SetRegView 32
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
!macroend

!macro customInstallMode
  ; Skip electron-builder's "is a previous version already installed?"
  ; prompt/branch entirely - just proceed as a direct install now that
  ; the old uninstall pointers are gone.
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  ; Overwrite the old build's files directly rather than relying on
  ; the uninstall-then-install flow this whole macro exists to avoid.
  SetOverwrite on
!macroend
