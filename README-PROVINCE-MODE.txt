پچ: انتخاب حالت تشخیص استان در پنل پروفایل + موتور
══════════════════════════════════════════════════

چی اضافه شد؟
  در صفحه «پروفایل‌ها» → مرحله مبدا/مقصد:

  • تشخیص خودکار از پلاک
      → کاربر فقط «شهر یا محله» را وارد می‌کند
      → ربات استان را از کد ایران پلاک می‌گیرد
      → در MapCity/MapCity2 تایپ می‌کند و انتخاب می‌کند
      → بعد AddressSearch/AddressSearch2 با همان شهر/محله

  • ورود دستی استان
      → کاربر استان + شهر + محله/آدرس را خودش وارد می‌کند
      → ربات همان‌ها را تایپ و انتخاب می‌کند

فیلدهای دیتابیس (RegistrationProfile)
  originProvinceMode  TEXT  default 'auto_plate'
  destProvinceMode    TEXT  default 'auto_plate'
  مقادیر: auto_plate | manual

فایل‌های تغییر یافته
  prisma/schema.prisma
  prisma/migrations/20260805120000_add_province_detect_mode/migration.sql
  src/app/api/registration-profiles/route.ts
  src/app/api/registration-profiles/[id]/route.ts
  src/app/(panel)/panel/profiles/page.tsx
  src/automation/engine/step1-engine.js

نصب
  ۱) زیپ را روی ریشه پروژه Extract/Replace
  ۲) مایگریشن:
       npx prisma migrate deploy
       npx prisma generate
  ۳) پنل و Worker را restart کن
       npm run dev
       npm run worker

نکته
  پروفایل‌های قبلی به‌صورت پیش‌فرض auto_plate می‌شوند.
  اگر استان مقصد با استان پلاک فرق دارد، برای مقصد «ورود دستی» بگذار.
