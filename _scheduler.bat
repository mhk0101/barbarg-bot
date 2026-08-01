@echo off
chcp 65001 >nul
title BarBarg - Scheduler
echo Scheduler ticker running every 60s - close window to stop.
echo.
:loop
curl -s http://localhost:3000/api/scheduler/tick >nul 2>&1
echo [%time:~0,8%] tick sent
timeout /t 60 /nobreak >nul
goto loop
