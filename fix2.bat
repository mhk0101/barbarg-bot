@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title BarBarg Bot - Fix 2 (Prisma + tsx)

cd /d "%~dp0"

echo.
echo ==========================================================
echo        BarBarg Bot - Fix 2 : Prisma client + tsx
echo ==========================================================
echo.

REM ---------- 1. install tsx locally ----------
echo [1/4] Installing "tsx" ^(needed by the worker^) ...
if exist "node_modules\tsx" (
    echo       Already installed.
) else (
    call npm install --save-dev tsx
    if !errorlevel! neq 0 (
        echo.
        echo [!] npm could not reach the registry.
        echo     Set an Iranian mirror and retry:
        echo         npm config set registry https://registry.npmmirror.com
        echo         npm install --save-dev tsx
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 2. regenerate prisma client ----------
echo [2/4] Regenerating Prisma client ...
if exist "node_modules\.prisma" rmdir /s /q "node_modules\.prisma" 2>nul
call npx prisma generate
if %errorlevel% neq 0 (
    echo [!] prisma generate failed - check DATABASE_URL in .env
    pause
    exit /b 1
)

if exist "node_modules\.prisma\client" (
    echo       Client generated OK.
) else (
    echo [!] .prisma\client still missing. Try:  npm install @prisma/client
    pause
    exit /b 1
)

REM ---------- 3. clear next cache ----------
echo [3/4] Clearing Next.js cache ...
if exist ".next" rmdir /s /q ".next" 2>nul
echo       Done.

REM ---------- 4. verify ----------
echo [4/4] Verifying database connection ...
call npx prisma migrate status
echo.

echo ==========================================================
echo                       FIX 2 DONE
echo ==========================================================
echo.
echo   Now run:  start.bat
echo.
pause
