@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title BarBarg Bot - Launcher

cd /d "%~dp0"

echo.
echo ==========================================================
echo              BarBarg Bot - Starting  (v2)
echo ==========================================================
echo.

REM ---- sanity checks ----
if not exist ".env" (
    echo [!] .env not found. Run fix-db.bat first.
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo [!] node_modules not found. Run: npm install
    pause
    exit /b 1
)
if not exist "node_modules\.prisma\client" (
    echo [!] Prisma client not generated. Run fix2.bat first.
    pause
    exit /b 1
)
if not exist "node_modules\tsx" (
    echo [!] tsx not installed - worker will fail. Run fix2.bat first.
    pause
    exit /b 1
)

REM ---- services ----
echo Checking services ...
for %%V in (18 17 16 15 14) do (
    sc query postgresql-x64-%%V >nul 2>&1 && net start postgresql-x64-%%V >nul 2>&1
)
sc query Memurai >nul 2>&1 && net start Memurai >nul 2>&1
sc query Redis >nul 2>&1 && net start Redis >nul 2>&1
echo   Done.
echo.

REM ---- write scheduler loop to its own file (inline loops break in cmd) ----
echo Creating scheduler helper ...
(
    echo @echo off
    echo chcp 65001 ^>nul
    echo title BarBarg - Scheduler
    echo echo Scheduler ticker running every 60s - close window to stop.
    echo echo.
    echo :loop
    echo curl -s http://localhost:3000/api/scheduler/tick ^>nul 2^>^&1
    echo echo [%%time:~0,8%%] tick sent
    echo timeout /t 60 /nobreak ^>nul
    echo goto loop
) > _scheduler.bat

REM ---- web app ----
echo Starting web app  ^(port 3000^) ...
start "BarBarg - Web" cmd /k "npm run dev"

echo Waiting for server to boot ...
set /a tries=0
:waitloop
timeout /t 3 /nobreak >nul
set /a tries+=1
curl -s -o nul http://localhost:3000 2>nul
if %errorlevel% equ 0 goto ready
if !tries! geq 20 (
    echo   Server slow to start - continuing anyway.
    goto ready
)
goto waitloop
:ready
echo   Server is up.
echo.

REM ---- worker ----
echo Starting queue worker ...
start "BarBarg - Worker" cmd /k "npm run worker"
timeout /t 2 /nobreak >nul

REM ---- scheduler ----
echo Starting scheduler ticker ...
start "BarBarg - Scheduler" cmd /k "_scheduler.bat"

timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo ==========================================================
echo                     RUNNING
echo ==========================================================
echo.
echo   Panel:  http://localhost:3000
echo   Login:  admin@barbarg.local  /  Admin123456
echo.
echo   Close the three opened windows to stop the bot.
echo.
pause
