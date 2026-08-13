@echo off
chcp 65001 >nul
setlocal EnableExtensions

echo ============================================================
echo   BarBarg Bot - Apply DB Migration
echo   حذف محدودیت تکراری بودن username در حساب‌های باربرگ
echo ============================================================
echo.

REM این فایل باید داخل ریشه پروژه اجرا شود؛ همان جایی که package.json و پوشه prisma هست.
cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] فایل package.json پیدا نشد.
  echo این فایل CMD را داخل ریشه پروژه barbarg-bot کپی کن و دوباره اجرا کن.
  pause
  exit /b 1
)

if not exist "prisma\schema.prisma" (
  echo [ERROR] فایل prisma\schema.prisma پیدا نشد.
  echo مسیر اجرای فایل اشتباه است.
  pause
  exit /b 1
)

if not exist "prisma\migrations\20260812123000_allow_duplicate_barbarg_account_username\migration.sql" (
  echo [ERROR] فایل migration جدید پیدا نشد:
  echo prisma\migrations\20260812123000_allow_duplicate_barbarg_account_username\migration.sql
  echo اول فایل‌های ZIP را کامل جایگزین کن.
  pause
  exit /b 1
)

echo [1/3] اجرای migration با Prisma...
call npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo [WARN] migrate deploy با خطا مواجه شد. تلاش مستقیم برای اجرای SQL...
  echo.
  call npx prisma db execute --schema prisma\schema.prisma --file prisma\migrations\20260812123000_allow_duplicate_barbarg_account_username\migration.sql
  if errorlevel 1 (
    echo.
    echo [ERROR] اجرای مستقیم SQL هم ناموفق بود.
    echo DATABASE_URL و اتصال دیتابیس را بررسی کن.
    pause
    exit /b 1
  )

  echo.
  echo [2/3] ثبت migration به عنوان applied در Prisma...
  call npx prisma migrate resolve --applied 20260812123000_allow_duplicate_barbarg_account_username
  if errorlevel 1 (
    echo [WARN] ثبت migrate resolve انجام نشد؛ اگر SQL اجرا شده باشد معمولاً مشکلی برای کار برنامه نیست.
  )
) else (
  echo [OK] migration با موفقیت اجرا شد.
)

echo.
echo [3/3] ساخت Prisma Client...
call npx prisma generate
if errorlevel 1 (
  echo.
  echo [ERROR] prisma generate ناموفق بود.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo [DONE] دیتابیس آماده شد.
echo حالا سرور و ورکر را ری‌استارت کن:
echo   npm run dev
echo   npm run worker   ^(اگر جدا اجرا می‌کنی^)
echo ============================================================
echo.
pause
