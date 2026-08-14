استخراج این zip را روی ریشهٔ پروژه barbarg-bot انجام بده
(Overwrite = Yes)، بعد هر دو را ری‌استارت کن:

  1) next dev
  2) worker  (اگر جدا اجرا می‌شود)

چه چیزی عوض شد
──────────────
• فیلدهای کمرنگ/disabled صفحهٔ جزئیات (که کپی هم نمی‌شوند)
  دیگر فقط با .value خوانده نمی‌شوند.
  حالا همزمان از این‌ها خوانده می‌شود:
    – value بومی + defaultValue + attribute
    – jQuery / Kendo / Select2
    – ::before/::after و accessibility
    – پاسخ JSON همان AJAX که صفحه را پر می‌کند
    – جدول تاریخچه (مثل قبل)

• خطای  unhandledRejection: undefined
  از HMR نکست هنگام باز بودن مرورگر Playwright می‌آمد.
  سشن import روی globalThis ماندگار شد، playwright از باندل خارج شد،
  و بستن مرورگر بی‌صدا شد.

بعد از ری‌استارت، دوباره «دریافت اطلاعات خودکار راننده» را بزن.
اگر هنوز فیلدی خالی ماند، فایل
  diagnostics/import-detail.json
را بفرست.
