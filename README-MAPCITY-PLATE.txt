پچ گام ۵ و ۶ — MapCity + AddressSearch (تایپ اجباری + صبر)
══════════════════════════════════════════════════════════

HTML واقعی سایت (طبق نمونه کاربر)
──────────────────────────────────
گام ۵ (مبدا):
  #MapCity          → select2-MapCity-container / #select2-MapCity-results
  #AddressSearch    → select2-AddressSearch-container / #select2-AddressSearch-results
  placeholder شهر: «شهرستان مورد نظر را انتخاب نمایید»
  placeholder آدرس: «شهر/روستا/محله مورد نظر...»

گام ۶ (مقصد):
  #MapCity2         → select2-MapCity2-container / #select2-MapCity2-results
  #AddressSearch2   → select2-AddressSearch2-container / #select2-AddressSearch2-results

رفتار اجباری برای هر دو فیلد
────────────────────────────
  ۱) تشخیص استان/شهر از کد ایران پلاک (مثلاً ۴۸ → بوشهر)
  ۲) کلیک روی باکس Select2
  ۳) حتماً تایپ حرف‌به‌حرف در input.select2-search__field
  ۴) صبر ۱.۴–۱.۶ ثانیه + پایش تا li واقعی بیاید
     (پیام «موردی یافت نشد.» رد می‌شود، صبر اضافه هم دارد)
  ۵) کلیک روی گزینه (mousedown/mouseup/click)
  ۶) بعد از MapCity → AddressSearch با آدرس پروفایل

ترتیب متن تایپ MapCity
  شهر پروفایل → شهر از پلاک → استان از پلاک → استان پروفایل

ترتیب متن تایپ AddressSearch
  آدرس پروفایل → شهر پروفایل → شهر از پلاک

فایل
  src/automation/engine/step1-engine.js

نصب
  ۱) زیپ را روی ریشه پروژه Extract / Replace
  ۲) Worker را restart کن:
       npm run worker
  ۳) یک جاب تست

لاگ موفق تقریبی
  ═══ گام ۵: مبدا بارگیری ═══
  پلاک: ... ایران 48 | ایران: 48
  ⓘ از پلاک ایران 48 → بوشهر / بوشهر
  ── گام ۵: مبدا بارگیری: انتخاب شهرستان ( #MapCity ) ──
  ✔ شهرستان(MapCity): تایپ شد «بوشهر» — 1s صبر برای لیست...
  ⓘ شهرستان(MapCity) لیست: بوشهر | ...
  ✔ شهرستان(MapCity) انتخاب شد: «بوشهر»
  ── گام ۵: مبدا بارگیری: انتخاب آدرس/محله ( #AddressSearch ) ──
  ✔ آدرس(AddressSearch): تایپ شد «ریشهر» — 2s صبر برای لیست...
  ⓘ آدرس(AddressSearch) لیست: ریشهر | پارک ریشهر | ...
  ✔ آدرس(AddressSearch) انتخاب شد: «ریشهر»

  ═══ گام ۶: مقصد تخلیه ═══
  ... #MapCity2 و #AddressSearch2 ...
