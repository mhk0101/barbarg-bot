@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title BarBarg Bot - Setup

echo.
echo ==========================================================
echo            BarBarg Bot - Automatic Setup  (v2)
echo ==========================================================
echo.

cd /d "%~dp0"

REM ============ ADMIN CHECK ============
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] This script must run as Administrator.
    echo     Right-click setup.bat  ^>  "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM ============ ASK DB PASSWORD ============
echo Enter your PostgreSQL "postgres" user password.
set "PGPASS="
set /p "PGPASS=Password (press Enter for 'root'): "
if "!PGPASS!"=="" set "PGPASS=root"
echo.

REM ============ WINGET CHECK ============
set "HAS_WINGET="
where winget >nul 2>&1 && set "HAS_WINGET=1"

REM ============ 1. NODE.JS ============
echo [1/9] Checking Node.js ...
where node >nul 2>&1
if %errorlevel% neq 0 (
    if defined HAS_WINGET (
        echo       Not found. Installing Node.js LTS ...
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        set "PATH=%PATH%;%ProgramFiles%\nodejs"
    ) else (
        echo [!] Node.js not found and winget unavailable. Install Node 20+ manually.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('node -v') do echo       Found Node %%v
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node installed but not on PATH. Open a NEW terminal and re-run setup.bat
    pause
    exit /b 1
)

REM ============ 2. POSTGRESQL ============
echo [2/9] Checking PostgreSQL ...
where psql >nul 2>&1
if %errorlevel% neq 0 (
    set "PGFOUND="
    for %%V in (18 17 16 15 14) do (
        if not defined PGFOUND if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" (
            set "PATH=%PATH%;%ProgramFiles%\PostgreSQL\%%V\bin"
            set "PGFOUND=1"
            echo       Found at PostgreSQL\%%V
        )
    )
    if not defined PGFOUND (
        if defined HAS_WINGET (
            echo       Not found. Installing PostgreSQL 17 ...
            winget install -e --id PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements --silent
            set "PATH=%PATH%;%ProgramFiles%\PostgreSQL\17\bin"
            timeout /t 15 /nobreak >nul
        ) else (
            echo [!] PostgreSQL not found. Install it manually.
            pause
            exit /b 1
        )
    )
) else (
    echo       Already installed.
)

REM ============ 3. REDIS ============
echo [3/9] Checking Redis ...
set "REDIS_OK="
where redis-server >nul 2>&1 && set "REDIS_OK=1"
if exist "%ProgramFiles%\Memurai\memurai.exe" set "REDIS_OK=1"
if not defined REDIS_OK (
    if defined HAS_WINGET (
        echo       Not found. Installing Memurai ^(Redis for Windows^) ...
        winget install -e --id Memurai.MemuraiDeveloper --accept-source-agreements --accept-package-agreements --silent
        timeout /t 10 /nobreak >nul
    ) else (
        echo [!] Redis/Memurai not found. Install Memurai manually.
    )
) else (
    echo       Already installed.
)

REM ============ 4. GOOGLE CHROME ============
echo [4/9] Checking Google Chrome ...
set "CHROME_OK="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_OK=1"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_OK=1"
if defined CHROME_OK (
    echo       Found.  ^(bot uses system Chrome^)
) else (
    if defined HAS_WINGET (
        echo       Not found. Installing Chrome ...
        winget install -e --id Google.Chrome --accept-source-agreements --accept-package-agreements --silent
    ) else (
        echo [!] Chrome not found - the bot REQUIRES it. Install Chrome manually.
    )
)

REM ============ 5. NPM INSTALL ============
echo [5/9] Installing npm packages ...
call npm install
if %errorlevel% neq 0 (
    echo [!] npm install failed. Check internet / proxy.
    pause
    exit /b 1
)

REM ============ 6. PLAYWRIGHT (OPTIONAL) ============
echo [6/9] Playwright browser ^(optional^) ...
echo       SKIPPED - all code uses channel:'chrome' ^(system Chrome^).
echo       The bundled Chromium download is blocked in Iran and is NOT needed.
echo       If you ever need it, run manually with a VPN:  npx playwright install chromium

REM ============ 7. .ENV FILE ============
echo [7/9] Configuring .env ...
if exist ".env" (
    echo       .env exists - updating DATABASE_URL password ...
    powershell -NoProfile -Command "$p='%PGPASS%'; $f='.env'; $c=Get-Content $f -Raw; if($c -match 'DATABASE_URL'){ $c = $c -replace 'DATABASE_URL\s*=\s*\"?[^\r\n\"]*\"?', ('DATABASE_URL=\"postgresql://postgres:'+$p+'@localhost:5432/barbarg?schema=public\"') } else { $c += \"`nDATABASE_URL=`\"postgresql://postgres:$p@localhost:5432/barbarg?schema=public`\"`n\" }; Set-Content $f $c -NoNewline"
    echo       Done.
) else (
    (
        echo DATABASE_URL="postgresql://postgres:!PGPASS!@localhost:5432/barbarg?schema=public"
        echo REDIS_URL="redis://localhost:6379"
        echo BARBARG_PASSWORD_KEY="change-this-key-to-something-random-32chars!"
        echo JWT_SECRET="change-this-jwt-secret-to-random-string"
        echo AUTH_SECRET="change-this-auth-secret-to-random-string"
        echo NEXTAUTH_URL="http://localhost:3000"
        echo API_URL="http://localhost:3000"
    ) > .env
    echo       .env created.
)

REM ============ 8. DATABASE ============
echo [8/9] Setting up database ...
set "PGPASSWORD=!PGPASS!"

psql -U postgres -h localhost -d postgres -t -c "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] Cannot connect to PostgreSQL with that password.
    echo     Check the password and re-run setup.bat
    echo.
    pause
    exit /b 1
)
echo       Connection OK.

psql -U postgres -h localhost -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='barbarg'" 2>nul | findstr "1" >nul
if %errorlevel% neq 0 (
    echo       Creating database "barbarg" ...
    psql -U postgres -h localhost -d postgres -c "CREATE DATABASE barbarg" >nul 2>&1
) else (
    echo       Database "barbarg" already exists - OK.
)

echo       Running migrations ...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [!] Migration failed. Check DATABASE_URL in .env
    pause
    exit /b 1
)

echo       Generating Prisma client ...
call npx prisma generate

echo       Seeding admin user ...
call node seed.js

REM ============ 9. GITIGNORE ============
echo [9/9] Securing .gitignore ...
findstr /c:"automation-data/" .gitignore >nul 2>&1
if %errorlevel% neq 0 (
    (
        echo.
        echo # --- added by setup.bat ---
        echo automation-data/
        echo diagnostics/
        echo *.log
        echo login-output.txt
        echo login-error.txt
        echo build-output.txt
        echo poc-output.txt
    ) >> .gitignore
    echo       Secured.
) else (
    echo       Already secured.
)

echo.
echo ==========================================================
echo                    SETUP COMPLETE
echo ==========================================================
echo.
echo   Panel login:  admin@barbarg.local
echo   Password:     Admin123456
echo.
echo   Now run:  start.bat
echo.
pause
