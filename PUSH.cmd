@echo off
rem -- Double-click me to publish the Creator Hub --
rem Runs push.ps1 with the execution policy unlocked just for this run.
rem The pause below guarantees the window stays open even if something crashes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1"
echo.
pause
