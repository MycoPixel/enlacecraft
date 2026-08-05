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
!macroend
