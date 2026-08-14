# گزارش بررسی فنی پروژه `barbarg-bot`

تاریخ بررسی: ۱۴۰۵/۰۵/۲۲ (2026-08-13)

## ۱) دامنه‌ی بررسی

ساختار پروژه، مسیرهای API، مدل‌های Prisma، پنل حساب‌های باربرگ، موتور Playwright، Worker/BullMQ، ورود، مدیریت خطا، تنظیمات build و وضعیت وابستگی‌ها بررسی شد.

تصویر کلی پروژه در زمان بررسی:

- Next.js 16 + React 19 و App Router
- PostgreSQL + Prisma 7
- Redis + BullMQ برای صف اتوماسیون
- Playwright برای ورود و ثبت بارنامه
- موتور اصلی فعال: `src/automation/engine/step1-engine.js`
- Worker اصلی: `worker/processor.ts`
- حدود ۳۱ هزار خط کد در `src`، `worker`، `scripts` و Prisma
- ۹۴ صفحه/Route در خروجی build

---

## ۲) معماری فعلی

### پنل و API

صفحات پنل در `src/app/(panel)` و APIها در `src/app/api` قرار دارند. پنل از کوکی `access_token` استفاده می‌کند. سطح دسترسی نقش‌ها در `src/lib/auth/permissions.ts` تعریف شده است.

### موتور اتوماسیون

مسیر واقعی پنل اتوماسیون و Worker از موتور مشترک زیر استفاده می‌کند:

```text
src/automation/engine/step1-engine.js
```

این موتور ورود، کپچا، تشخیص بلاک IP، سرور مشغول، WAF، timeout، صفحه‌ی مرده، پرکردن فرم و ثبت نهایی را انجام می‌دهد.

فایل‌های قدیمی‌تر `LoginFlow.ts`، `WaybillFlow.ts` و `AutomationEngine.ts` هنوز در پروژه هستند، ولی Worker اصلی عملاً از `step1-engine.js` استفاده می‌کند. یک کپی قدیمی دیگر هم در `automation/engine/step1-engine.js` وجود دارد که خطر دوگانگی کد ایجاد می‌کند.

### صف و Worker

- صف: `worker/queue.ts`
- Worker: `worker/worker.ts`
- پردازش اصلی: `worker/processor.ts`
- منبع داده: `RegistrationProfile` متصل به `BarBargAccount`

### حساب‌های باربرگ

- UI: `src/app/(panel)/panel/barbarg-accounts/page.tsx`
- CRUD: `src/app/api/barbarg-accounts`
- تست ورود: `src/app/api/barbarg-accounts/test-login/route.ts`
- دریافت آخرین بارنامه: `src/app/api/barbarg-accounts/import-profile/route.ts`

---

## ۳) مشکل اصلی تست ورود حساب‌های باربرگ

پیاده‌سازی قبلی فقط بازکردن اولیه‌ی صفحه را برای خطاهای شبکه تکرار می‌کرد. بعد از بازشدن صفحه و ورود کاربر:

- «سرور مشغول» به‌درستی باعث شروع مجدد کامل نمی‌شد.
- WAF مدیریت نمی‌شد.
- بسته‌شدن یا crash مرورگر عملیات را تمام می‌کرد.
- خطای شبکه بعد از ارسال فرم می‌توانست برای همیشه روی همان صفحه گیر کند.
- دکمه‌ی «ورود انجام شد» اگر زود زده می‌شد، عملیات را اشتباهاً `login_failed` می‌کرد.
- تشخیص رمز اشتباه بیش از حد کلی بود؛ صرف وجود عبارت‌هایی مثل «کد ملی» یا «نام کاربری» می‌توانست عملیات را قطعی متوقف کند.
- سه کپچای ناموفق، بدون پیام صریح سایت، به‌اشتباه «رمز اشتباه» فرض می‌شد.
- Route تست ورود کنترل سطح دسترسی `manage_settings` نداشت.
- تصویر جدید در هر تلاش ساخته می‌شد و در حلقه‌ی نامحدود امکان پرشدن دیسک وجود داشت.
- نشست‌ها در hot reload ممکن بود بین GET و POST گم شوند.

---

## ۴) رفتار جدید تست ورود

تست ورود حساب اکنون از دسته‌بندی‌ها و توابع تشخیص همان موتور اتوماسیون استفاده می‌کند و تا وقتی کاربر دکمه‌ی «توقف» نزند، برای خطاهای موقتی سقف تعداد تلاش ندارد.

| نوع وضعیت | رفتار | فاصله‌ی تلاش بعدی | سقف |
|---|---|---:|---:|
| بلاک IP / قطع شبکه | بستن مرورگر، پایش فعال سایت، شروع کامل از صفر | ۳ تا ۵ دقیقه؛ اگر سایت زودتر برگشت فوراً ادامه | نامحدود |
| سرور مشغول / 5xx | بستن مرورگر، پایش فعال سایت، شروع کامل از صفر | ۶۰ ثانیه؛ اگر زودتر برگشت فوراً ادامه | نامحدود |
| WAF / Security check | بستن مرورگر و شروع از صفر | ۲ تا ۵ دقیقه | نامحدود |
| Timeout | بستن مرورگر و شروع از صفر | ۲ تا ۵ دقیقه | نامحدود |
| بسته‌شدن/crash صفحه یا مرورگر | ساخت مرورگر تازه | ۱۵ ثانیه | نامحدود |
| ازبین‌رفتن نشست ورود | ورود کامل از صفر | ۱۵ ثانیه | نامحدود |
| خطای ناشناخته‌ی موقتی | مرورگر تازه و شروع از صفر | ۱۵ ثانیه | نامحدود |
| کپچای غلط/خالی | ماندن در صفحه، پرکردن دوباره‌ی نام کاربری و رمز، انتظار کپچای تازه | بدون توقف | نامحدود |
| نام کاربری/رمز واقعاً غلط | توقف فقط بعد از پیام صریح سایت | — | توقف |
| حساب صریحاً قفل/غیرفعال | مطابق سیاست اتوماسیون، توقف برای جلوگیری از قفل بیشتر | — | توقف |
| توقف کاربر | بستن مرورگر و پایان نشست | — | توقف |

نکات مهم:

1. موفقیت ورود خودکار تشخیص داده می‌شود و دیگر زدن دکمه‌ی تأیید الزامی نیست.
2. دکمه‌ی «بررسی ورود» فقط وضعیت را بررسی می‌کند و اگر هنوز ورود کامل نشده باشد، عملیات را شکست‌خورده نمی‌کند.
3. یک screenshot ثابت برای هر حساب overwrite می‌شود تا حلقه‌ی نامحدود دیسک را پر نکند.
4. لاگ نشست حداکثر ۵۰۰ ردیف نگه می‌دارد.
5. تلاش نامحدود تا وقتی معتبر است که پردازش Next.js زنده باشد؛ محدودیت معماری in-memory در بخش ریسک‌ها توضیح داده شده است.

---

## ۵) اصلاحات انجام‌شده

### ورود و مدیریت خطا

- بازنویسی orchestrator تست ورود با restart کامل مرورگر
- استفاده‌ی مستقیم از این توابع موتور مشترک:
  - `gotoR`
  - `pageHealth`
  - `isLoggedInByUserMenu`
  - `classifyCredentialError`
  - `readVisibleLoginError`
  - `isServerBusy`
  - `isNetBlockError`
  - `isPageDeadError`
  - `isServerTempError`
  - `isSiteReallyBack`
- تشخیص `chrome-error://` و خطاهای داخلی Chromium به‌عنوان block/network
- اضافه‌شدن تشخیص `Internal Server Error`، `Bad Gateway` و `Gateway Timeout`
- حذف توقف اشتباه بعد از سه کپچای ظاهراً درست
- تبدیل شکست ورود غیرقطعی به `kind: login` تا قابل شروع مجدد باشد
- توقف قطعی فقط با classifier دقیق مشخصات حساب
- اضافه‌شدن `manage_settings` به GET و POST تست ورود
- نگهداری Map نشست‌ها روی `globalThis` برای جلوگیری از جدایی Map در hot reload

### دریافت اطلاعات از آخرین بارنامه

- استفاده از `decryptPassword` مرکزی به‌جای نسخه‌ی تکراری رمزگشایی
- توقف روی `bad_credentials` و `account_locked` صریح
- بسته‌شدن/crash مرورگر دیگر به‌اشتباه «لغو کاربر» محسوب نمی‌شود و دوباره تلاش می‌شود
- نوع‌دهی کامل‌تر موتور، داده‌ی استخراج‌شده و Browser

### UI حساب‌ها

- نمایش وضعیت `retry_wait`، شماره تلاش و علت آخرین retry
- تفکیک رنگ info/warn/error/success
- اصلاح متن «باربگ» به «باربرگ»
- توضیح روشن درباره‌ی تلاش نامحدود و توقف دستی
- بررسی `response.ok` در ذخیره، حذف و تغییر وضعیت؛ پنل دیگر روی پاسخ خطای API پیام موفقیت نشان نمی‌دهد
- trim داده‌های ورودی

### CRUD و وضعیت حساب

- اعتبارسنجی وضعیت فقط روی `active` و `disabled`
- جلوگیری از ذخیره نام حساب یا نام کاربری خالی در ویرایش
- سازگاری آماری با رکوردهای قدیمی `inactive`
- اصلاح Worker: وضعیت حساب غیرفعال از `inactive` به `disabled`

### Build و TypeScript

- اصلاح خطای نوع پلاک در صفحه پروفایل‌ها
- اصلاح type مربوط به Cellهای ExcelJS
- همگام‌سازی `package-lock.json`؛ قبل از اصلاح، `npm ci` به‌دلیل نبودن `@emnapi/core` و `@emnapi/runtime` متوقف می‌شد

### فایل‌های حساس Runtime

در مخزن عمومی، فایل‌های session واقعی Playwright، screenshotهای ورود و HTMLهای خطا commit شده بودند. این فایل‌ها ممکن است cookie نشست و اطلاعات قابل‌شناسایی کاربر داشته باشند.

اقدامات انجام‌شده:

- حذف ۵۸ فایل tracked از این مسیرها:
  - `automation-data/sessions`
  - `automation-data/screenshots`
  - `automation-data/html`
- حذف ۷ فایل log/output tracked
- اضافه‌شدن مسیرهای runtime و logها به `.gitignore`

**هشدار:** حذف در commit جدید، فایل‌ها را از تاریخچه‌ی قبلی GitHub پاک نمی‌کند. برای پاک‌سازی کامل باید با `git filter-repo` یا BFG تاریخچه بازنویسی و force-push شود. همچنین بهتر است نشست‌های سایت باطل و در صورت نمایش اطلاعات حساس در screenshotها، آن اطلاعات در معرض افشا فرض شوند.

---

## ۶) اعتبارسنجی انجام‌شده

نتایج نهایی:

- `npx tsc --noEmit` → موفق
- lint فایل‌های تغییرکرده → موفق
- `node --check src/automation/engine/step1-engine.js` → موفق
- تست مستقیم classifierها → موفق
  - مشخصات واقعاً اشتباه → `bad_credentials`
  - پیام «نام کاربری یا رمز را وارد کنید» → غیرقطعی و قابل retry
  - حساب مسدود → `account_locked`
  - 502/Internal Server Error/Gateway Timeout → موقتی
  - `ERR_CONNECTION_RESET` → block/network
- `npm run build` → موفق؛ ۹۴ Route تولید شد
- `npm ci --dry-run` → موفق
- `git diff --check` → موفق

در build، چون Redis محلی روی پورت 6380 اجرا نبود، چند پیام `ECONNREFUSED` چاپ شد؛ با وجود آن build با exit code صفر کامل شد. این مورد در ریسک‌های باقی‌مانده ثبت شده است.

---

## ۷) ریسک‌های مهم باقی‌مانده در کل پروژه

### بحرانی: حفاظت ناقص تعداد زیادی API

`src/proxy.ts` برای بیشتر APIها فقط وجود کوکی `access_token` را بررسی می‌کند، نه امضای آن را. تعداد زیادی Route حساس نیز `requirePermission` یا حتی `requireLogin` ندارند. بنابراین یک cookie ساختگی و غیرخالی می‌تواند از Proxy عبور کند و اگر خود Route guard نداشته باشد، API قابل‌دسترسی شود.

راه‌حل پیشنهادی:

1. اعتبارسنجی امضا/انقضا در Proxy یا یک لایه‌ی مرکزی قابل‌اعتماد؛ و
2. اضافه‌کردن `requirePermission` مناسب به تک‌تک Routeهای حساس؛ و
3. تست integration برای 401/403 همه‌ی APIها.

### بحرانی: secretهای پیش‌فرض

پروژه در نبود env از secretهای ثابت استفاده می‌کند:

- `JWT_SECRET = barbarg-bot-jwt-secret-2024`
- `BARBARG_PASSWORD_KEY = barbarg-bot-default-key-change-in-production-32ch!`
- کاربر اولیه با رمز `Admin123456`

در production باید نبود env باعث fail-fast شود، نه استفاده از مقدار عمومی.

### بحرانی: آسیب‌پذیری وابستگی‌ها

`npm audit` در زمان بررسی:

- ۲ critical
- ۸ high
- ۷ moderate
- مجموع ۱۷ مورد

موارد مستقیم/مهم شامل زنجیره‌های `next-auth/@auth/core`، `next` و چند وابستگی خروجی/پردازش فایل است. ارتقای کور با `--force` توصیه نمی‌شود؛ باید نسخه‌ها در یک branch جدا ارتقا و login/export/build regression-test شوند.

### بالا: ذخیره رمز با AES-CBC بدون authentication

`src/lib/encryption.ts` از AES-256-CBC بدون MAC/AEAD استفاده می‌کند. دستکاری ciphertext قابل‌تشخیص مطمئن نیست. پیشنهاد: مهاجرت نسخه‌دار به AES-256-GCM و نگهداری key فقط در secret manager/env.

### بالا: نشست‌های طولانی داخل حافظه‌ی Route

تست ورود و import profile در Map حافظه‌ی فرآیند نگه‌داری می‌شوند. در restart، deploy، crash یا چند instance:

- وضعیت polling گم می‌شود؛
- مرورگر orphan می‌تواند باقی بماند؛
- instance دیگر نشست را نمی‌بیند؛
- روی serverless اجرای بی‌نهایت تضمین‌شده نیست.

راه‌حل پایدار: انتقال عملیات به Worker/BullMQ، ذخیره state در Redis/DB و استفاده از cancellation token اشتراکی.

### بالا: دو سیستم احراز هویت موازی

پروژه هم custom auth با `access_token` و هم NextAuth دارد. این دوگانگی قبلاً باگ logout ساخته و همچنان سطح حمله و پیچیدگی را بالا می‌برد. پیشنهاد: انتخاب یک سیستم به‌عنوان منبع حقیقت و حذف دیگری.

### متوسط: چند موتور/مسیر قدیمی

- `src/automation/engine/step1-engine.js` موتور فعال است.
- `automation/engine/step1-engine.js` کپی قدیمی دیگری است.
- `LoginFlow.ts`، `WaybillFlow.ts` و `AutomationEngine.ts` نیز منطق موازی دارند.

وجود چند نسخه احتمال اصلاح یک مسیر و خراب‌ماندن مسیر دیگر را زیاد می‌کند. پیشنهاد: حذف یا archive نسخه‌های مرده و قراردادن API typed روی موتور واحد.

### متوسط: global log sink در موتور JS

`setLogSink` یک متغیر global در ماژول موتور تغییر می‌دهد. اجرای هم‌زمان چند import در یک process می‌تواند لاگ یک حساب را وارد نشست حساب دیگر کند. بهتر است logger در options هر invocation باقی بماند و global نباشد.

### متوسط: اتصال Redis هنگام build/import

هنگام `next build` بدون Redis، چند `ECONNREFUSED` ثبت شد. اتصال Redis باید lazy و محدود به runtime Route/Worker باشد و در مرحله static generation ساخته نشود.

### متوسط: lint کل مخزن خراب است

`npm run lint` در کل مخزن فعلاً ۳۲۹ مورد گزارش می‌کند:

- ۱۳۸ error
- ۱۹۱ warning

بخش بزرگی مربوط به CommonJS scriptهای قدیمی، `set-state-in-effect`، unused vars و JSX است. فایل‌های تغییرکرده در این اصلاح lint-clean هستند، ولی quality gate کل پروژه هنوز سبز نیست.

### متوسط: نبود تست خودکار واقعی

پروژه scriptهای دستی زیادی دارد، اما test runner و تست unit/integration منظم ندارد. مهم‌ترین تست‌های پیشنهادی:

1. classifier خطاهای ورود با متن‌های واقعی سایت
2. retry policy با fake timer
3. cancellation حین sleep/probe
4. API permission tests
5. queue retry و Redis recovery
6. migration و CRUD حساب‌ها

### متوسط: catchهای خاموش

حداقل ۶۱ catch خالی/خاموش در `src` و `worker` وجود دارد. این کار تشخیص خطاهای production را سخت می‌کند. catchهای best-effort باید حداقل structured log با context داشته باشند.

### پایین: مستندات و فایل‌های قدیمی

README اصلی هنوز متن boilerplate Next.js است و تعداد زیادی README اصلاحی/فایل diagnostic در ریشه وجود دارد. پیشنهاد: یک README اصلی شامل نصب PostgreSQL، Redis، Chrome، envهای اجباری، migration، Worker و runbook نگهداری شود و فایل‌های قدیمی به `docs/archive` منتقل شوند.

---

## ۸) ترتیب پیشنهادی ادامه‌ی کار

1. فوراً پاک‌سازی تاریخچه‌ی GitHub از session/screenshot و تعویض secretها
2. بستن همه‌ی APIهای بدون guard
3. اجباری‌کردن `JWT_SECRET` و `BARBARG_PASSWORD_KEY` و حذف credential پیش‌فرض
4. انتقال نشست‌های login/import از حافظه‌ی Route به BullMQ/Redis
5. حذف موتورهای تکراری و global log sink
6. ارتقای امن dependencyهای critical/high
7. سبزکردن lint کل پروژه
8. اضافه‌کردن تست‌های unit/integration

---

## ۹) فایل‌های اصلی تغییرکرده

```text
.gitignore
package-lock.json
src/app/(panel)/panel/barbarg-accounts/page.tsx
src/app/(panel)/panel/profiles/page.tsx
src/app/api/barbarg-accounts/[id]/route.ts
src/app/api/barbarg-accounts/route.ts
src/app/api/barbarg-accounts/test-login/route.ts
src/app/api/barbarg-accounts/import-profile/route.ts
src/app/api/reports/export/route.ts
src/automation/engine/step1-engine.js
worker/processor.ts
```

به‌علاوه، runtime session/screenshot/html و logهای tracked از index مخزن حذف شدند.
