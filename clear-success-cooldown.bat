@echo off
title Clear Success Cooldown
cd /d "%~dp0"

if not exist ".env" goto noenv
where node >nul 2>&1
if errorlevel 1 goto nonode

echo Running cleanup...
node clear-success-cooldown.js
echo.
echo DONE. You can test again now.
goto done

:noenv
echo [!] .env not found. Put these files next to run.bat.
goto done

:nonode
echo [!] Node.js not found in PATH.
goto done

:done
echo.
echo ==============================================
echo   Finished. This window stays open.
echo   Press any key to close it.
echo ==============================================
pause >nul
