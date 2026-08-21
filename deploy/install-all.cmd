@echo off
REM HoneyMoney - one-click uptime setup. RIGHT-CLICK -> "Run as administrator".
REM
REM Registers every scheduled task the public site depends on:
REM   HoneyMoney          boot + logon + 5-minute watchdog (the stack itself)
REM   HoneyMoney-Purge    03:00 daily - erase accounts past their 30-day grace
REM   HoneyMoney-Nudge    09:00 daily - proactive Honey nudges
REM   HoneyMoney-Demo     03:30 daily - roll demo personas into the current month
REM
REM All of it is idempotent: running this twice is free.
title HoneyMoney - install uptime tasks
echo.
echo === 1/2  stack autostart (boot + logon + 5-min watchdog) ===
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
echo.
echo === 2/2  daily maintenance tasks ===
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-maintenance-tasks.ps1"
echo.
echo === done - verifying ===
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ScheduledTask -TaskName 'HoneyMoney*' | Select-Object TaskName,State | Format-Table -AutoSize"
echo.
pause
