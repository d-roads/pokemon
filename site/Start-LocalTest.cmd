@echo off
rem Double-click to start the local test copy. Windows does not run .ps1 files on a double-click,
rem so this starts Start-LocalTest.ps1 with scripts allowed for this window only.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-LocalTest.ps1" %*
if errorlevel 1 pause
