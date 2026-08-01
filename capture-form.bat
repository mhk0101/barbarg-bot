@echo off
chcp 65001 >nul
title BarBarg - Capture Form Structure

cd /d "%~dp0"

if not exist "automation-data\sessions\default.json" (
    echo [!] Session not found: automation-data\sessions\default.json
    echo     Log in from the panel first, then copy your session file
    echo     and rename the copy to default.json
    pause
    exit /b 1
)

node capture-form.js

pause
