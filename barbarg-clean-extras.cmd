@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo Cleaning extra Barbarg repair files...
echo.

REM Stop old Next dev server on port 3000, if any.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /c:":3000" ^| findstr /i "LISTENING"') do (
  echo Stopping old server PID %%P
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM Delete generated Next/cache folders.
if exist ".next" rmdir /s /q ".next" 2>nul
if exist ".turbo" rmdir /s /q ".turbo" 2>nul
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul

REM Delete repair folders and old backups created during debugging.
for /d %%D in (patch-files backups-root404 backups-route-doctor backups-deep-route backups-complete-route backups-route-repair-v3 _old_route_repair_files_* app.bak-* pages.bak-*) do (
  if exist "%%D" (
    echo Deleting folder %%D
    rmdir /s /q "%%D" 2>nul
  )
)

REM Delete repair/check command files and scripts.
for %%F in (
  "barbarg-auto-fix.cmd"
  "barbarg-fix-root-404.cmd"
  "barbarg-route-doctor.cmd"
  "barbarg-deep-route-fix.cmd"
  "barbarg-complete-route-repair.cmd"
  "barbarg-repair-routes-safe.cmd"
  "barbarg-fix-root-404.ps1"
  "barbarg-route-doctor.ps1"
  "barbarg-deep-route-fix.ps1"
  "barbarg-complete-route-repair.ps1"
  "barbarg-repair-routes-safe.ps1"
  "dev-runner.bat"
  "dev-root404-runner.bat"
  "route-doctor-dev-runner.bat"
  "deep-route-dev-runner.bat"
  "complete-route-dev-runner.bat"
  "route-repair-v3-dev-runner.cmd"
  "cleanup-repair-files.cmd"
  "start.bat"
) do (
  if exist %%F del /f /q %%F 2>nul
)

REM Delete repair/check logs and reports.
for %%F in (
  "check-result.txt"
  "dev-check.log"
  "root404-fix-result.txt"
  "dev-root404.log"
  "route-doctor-result.txt"
  "route-doctor-dev.log"
  "deep-route-result.txt"
  "deep-route-dev.log"
  "complete-route-result.txt"
  "complete-route-dev.log"
  "route-repair-v3-result.txt"
  "route-repair-v3-dev.log"
  "route-repair-v3-install.log"
  "complete-route-install.log"
  "deep-route-install.log"
  "route-doctor-install.log"
) do (
  if exist %%F del /f /q %%F 2>nul
)

REM Delete repair readme files.
for %%F in (
  "README-FIX-ROOT404.txt"
  "README-ROUTE-DOCTOR.txt"
  "README-DEEP-ROUTE-FIX.txt"
  "README-COMPLETE-ROUTE-REPAIR.txt"
  "README-FA-ROUTE-REPAIR-V3.txt"
  "README-BACK-TO-NORMAL.txt"
) do (
  if exist %%F del /f /q %%F 2>nul
)

REM Delete zip archives if they were copied into the project folder.
for %%F in (
  "barbarg-auto-fix.zip"
  "barbarg-root404-fix.zip"
  "barbarg-root404-fix-direct.zip"
  "barbarg-root404-fix-safe.zip"
  "barbarg-route-doctor.zip"
  "barbarg-deep-route-fix.zip"
  "barbarg-complete-route-repair.zip"
  "barbarg-route-repair-v3.zip"
  "barbarg-back-to-normal-run.zip"
  "barbarg-step5-6-select2-only.zip"
) do (
  if exist %%F del /f /q %%F 2>nul
)

REM Delete backup files left beside source files.
for %%F in (middleware.ts.bak-* proxy.ts.bak-* "src\app\page.tsx.bak-*" "src\proxy.ts.bak-*") do (
  if exist %%F del /f /q %%F 2>nul
)

REM If a conflicting root app/pages folder still exists, do NOT keep it.
REM The real project routes are under src\app.
if exist "app" if exist "src\app" (
  echo Deleting conflicting root app folder
  rmdir /s /q "app" 2>nul
)
if exist "pages" if exist "src\app" (
  echo Deleting conflicting root pages folder
  rmdir /s /q "pages" 2>nul
)

echo.
echo Cleanup done.
echo Now run: run.bat
echo.

REM Delete this cleanup file too, so the folder stays clean.
start "" cmd /c "timeout /t 2 /nobreak >nul & del /f /q ""%~f0"""
exit /b 0
