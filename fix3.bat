@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title BarBarg Bot - Fix 3 (env + db + redis)

cd /d "%~dp0"

echo.
echo ==========================================================
echo      BarBarg Bot - Fix 3 : rewrite .env, DB, Redis
echo ==========================================================
echo.

REM ---------- find psql ----------
where psql >nul 2>&1
if %errorlevel% neq 0 (
    for %%V in (18 17 16 15 14) do (
        if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" set "PATH=!PATH!;%ProgramFiles%\PostgreSQL\%%V\bin"
    )
)
where psql >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] psql not found. Add PostgreSQL\bin to PATH.
    pause
    exit /b 1
)

REM ---------- password ----------
set "PGPASS="
set /p "PGPASS=PostgreSQL password for 'postgres' [Enter = root]: "
if "!PGPASS!"=="" set "PGPASS=root"
set "PGPASSWORD=!PGPASS!"
echo.

echo [1/6] Testing PostgreSQL connection ...
psql -U postgres -h localhost -d postgres -t -c "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Wrong password or server down.
    pause
    exit /b 1
)
echo       OK.

REM ---------- create BOTH names so either works ----------
echo [2/6] Ensuring database "barbarg_bot" exists ...
psql -U postgres -h localhost -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='barbarg_bot'" 2>nul | findstr "1" >nul
if %errorlevel% neq 0 (
    psql -U postgres -h localhost -d postgres -c "CREATE DATABASE barbarg_bot" >nul 2>&1
    echo       Created.
) else (
    echo       Already exists.
)

REM ---------- detect redis port ----------
echo [3/6] Detecting Redis port ...
set "RPORT="
netstat -an | findstr /c:"127.0.0.1:6379" | findstr /i "LISTENING" >nul 2>&1 && set "RPORT=6379"
if not defined RPORT netstat -an | findstr /c:":6379" | findstr /i "LISTENING" >nul 2>&1 && set "RPORT=6379"
if not defined RPORT netstat -an | findstr /c:":6380" | findstr /i "LISTENING" >nul 2>&1 && set "RPORT=6380"

if not defined RPORT (
    echo       No Redis listening. Trying to start service ...
    net start Memurai >nul 2>&1
    net start Redis >nul 2>&1
    timeout /t 4 /nobreak >nul
    netstat -an | findstr /c:":6379" | findstr /i "LISTENING" >nul 2>&1 && set "RPORT=6379"
    if not defined RPORT netstat -an | findstr /c:":6380" | findstr /i "LISTENING" >nul 2>&1 && set "RPORT=6380"
)

if not defined RPORT (
    set "RPORT=6379"
    echo       [!] Redis NOT running. Defaulting to 6379.
    echo           Start Memurai from Services, or the worker queue will not run.
) else (
    echo       Redis found on port !RPORT!
)

REM ---------- rewrite .env from scratch ----------
echo [4/6] Writing a clean .env ...
if exist ".env" copy /y ".env" ".env.old" >nul 2>&1
> .env echo DATABASE_URL="postgresql://postgres:!PGPASS!@localhost:5432/barbarg_bot?schema=public"
>> .env echo REDIS_URL="redis://127.0.0.1:!RPORT!"
>> .env echo BARBARG_PASSWORD_KEY="barbarg-local-key-please-change-me-32ch!"
>> .env echo JWT_SECRET="barbarg-local-jwt-secret-change-me-now"
>> .env echo AUTH_SECRET="barbarg-local-auth-secret-change-me-now"
>> .env echo NEXTAUTH_URL="http://localhost:3000"
>> .env echo API_URL="http://localhost:3000"
echo       Done ^(old file saved as .env.old^).
echo.
echo       ---- new .env ----
type .env
echo       ------------------
echo.

REM ---------- migrate ----------
echo [5/6] Running migrations ...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [!] Migration failed.
    pause
    exit /b 1
)
call npx prisma generate

REM ---------- seed ----------
echo [6/6] Creating admin user ...
call node seed.js

echo.
echo ==========================================================
echo                      FIX 3 DONE
echo ==========================================================
echo.
echo   Login:  admin@barbarg.local  /  Admin123456
echo.
echo   IMPORTANT: close ALL old BarBarg windows before running
echo              start.bat, so the new .env is picked up.
echo.
pause
