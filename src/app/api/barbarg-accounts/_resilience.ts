/**
 * ابزار مشترک مدیریت خطا برای «حساب‌های باربگ»
 * ─────────────────────────────────────────────────────────────────
 *  این فایل دقیقاً همان سیاست خطای «قسمت اتوماسیون» را برای صفحه‌ی
 *  حساب‌های باربگ پیاده می‌کند:
 *
 *    • بلاک IP / قطع شبکه / مشغول بودن سرور / تایم‌اوت / WAF /
 *      بسته شدن مرورگر / خطای موقتی سایت  →  تلاش مجدد نامحدود
 *      (تا وقتی کاربر دکمه‌ی توقف را نزده).
 *
 *    • نام کاربری یا رمز اشتباه / حساب مسدود یا غیرفعال
 *      →  بلافاصله توقف.
 *
 *  منطق تشخیص از ماژول اتوماسیون
 *  (src/automation/browser/Resilience.ts و automation/engine/step1-engine.js)
 *  گرفته شده تا رفتار در هر دو قسمت یکسان بماند.
 */

/* ──────────────────────────────────────────────────────────────
 *  ۱) تشخیص «خطای موقتی» (شبکه / سرور / مرورگر)
 *     این نوع خطاها با صبر و شروع مجدد برطرف می‌شوند.
 * ────────────────────────────────────────────────────────────── */

const NETWORK_BLOCK_RE =
  /net::ERR_|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_SOCKET_NOT_CONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_PROXY_CONNECTION_FAILED|Timeout .*exceeded|Navigation timeout|timed?\s*out/i

const PAGE_CLOSED_RE =
  /Target page, context or browser has been closed|Target closed|browser has been closed|Session closed|Protocol error/i

const SERVER_BUSY_RE =
  /سرور مشغول|سرور در حال حاضر|قادر به پاسخگویی|The service is unavailable|service is unavailable|Service Unavailable|temporarily unavailable|Internal Server Error|Gateway Timeout|50[0-9]/i

const WAF_RE = /Security check|Please enter the above text|چالش امنیتی|WAF/i

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err ?? '')
}

/** آیا این خطا به‌خاطر بلاک IP / قطع شبکه / DNS / پروکسی است؟ */
export function isIpBlockError(err: unknown): boolean {
  return NETWORK_BLOCK_RE.test(toMessage(err))
}

/** آیا مرورگر/صفحه بسته شده و باید از نو ساخته شود؟ */
export function isPageClosedError(err: unknown): boolean {
  return PAGE_CLOSED_RE.test(toMessage(err))
}

/** آیا خطای تایم‌اوت است؟ */
export function isTimeoutError(err: unknown): boolean {
  return /Timeout .*exceeded|Navigation timeout|timed?\s*out/i.test(toMessage(err))
}

/** آیا پیام/استثنا نشان‌دهنده‌ی «سرور مشغول/خطای ۵xx» است؟ */
export function isServerBusyError(err: unknown): boolean {
  return SERVER_BUSY_RE.test(toMessage(err))
}

/** آیا صفحه شامل چالش امنیتی WAF است؟ */
export function isWafError(err: unknown): boolean {
  return WAF_RE.test(toMessage(err))
}

/**
 * هر خطایی که با «شروع مجدد کامل» قابل حل است.
 * شامل: بلاک IP، سرور مشغول، تایم‌اوت، مرورگر بسته‌شده، WAF،
 * خطای موقتی سایت (internal server error و …).
 */
export function isTransientError(err: unknown): boolean {
  return (
    isIpBlockError(err) ||
    isServerBusyError(err) ||
    isTimeoutError(err) ||
    isPageClosedError(err) ||
    isWafError(err)
  )
}

/** پیام خوانای فارسی برای نمایش در لاگ‌ها */
export function friendlyTransientError(err: unknown): string {
  const msg = toMessage(err)
  if (isPageClosedError(err)) return 'مرورگر/صفحه بسته شد — از نو باز می‌کنیم'
  if (isIpBlockError(err)) {
    if (/CLOSED|RESET|EMPTY_RESPONSE/i.test(msg)) {
      return 'اتصال به سامانه بسته شد؛ احتمال بلاک موقت IP یا اختلال شبکه وجود دارد'
    }
    if (/TIMED_OUT/i.test(msg)) {
      return 'اتصال به سامانه زمان‌بر شد؛ کمی صبر و تلاش مجدد'
    }
    return 'شبکه در دسترس نیست؛ بعد از برگشت اتصال دوباره تلاش می‌شود'
  }
  if (isServerBusyError(err)) return 'سرور مشغول/در دسترس نیست — بعد از چند دقیقه دوباره تلاش می‌شود'
  if (isTimeoutError(err)) return 'پاسخ سایت طول کشید — تلاش مجدد'
  return msg.split('\n')[0].slice(0, 220) || 'خطای موقتی'
}

/* ──────────────────────────────────────────────────────────────
 *  ۲) تشخیص «نام کاربری/رمز اشتباه یا حساب مسدود»
 *     این خطاها قطعی هستند و اصلا نباید تکرار شوند.
 * ────────────────────────────────────────────────────────────── */

/** متن‌های قرمزی که سایت هنگام اشتباه بودن نام کاربری/رمز نشان می‌دهد */
export const BAD_CREDENTIALS_RE =
  /کاربری با این مشخصات|کاربری یافت نشد|کاربر یافت نشد|نام کاربری یا رمز|رمز عبور اشتباه|کلمه عبور اشتباه|رمز اشتباه|اطلاعات ورود نادرست|نام کاربری اشتباه|نام کاربری.*اشتباه|رمز.*نادرست|کدملی.*یافت نشد|کد ملی.*یافت نشد/

export const ACCOUNT_LOCKED_RE =
  /حساب.*مسدود|حساب.*قفل|کاربر.*غیرفعال|دسترسی شما.*مسدود|حساب شما.*تعلیق|غیرفعال شده|قفل شد|مسدود شده/

/**
 * دسته‌ی خطای اعتبار ورود. خروجی:
 *   { kind: 'bad_credentials', message }  نام کاربری/رمز اشتباه
 *   { kind: 'account_locked', message }    حساب مسدود/غیرفعال
 *   null                                    خطای اعتباری نیست
 */
export function classifyCredentialError(
  raw: unknown,
): { kind: 'bad_credentials' | 'account_locked'; message: string } | null {
  const t = toMessage(raw).trim()
  if (!t) return null
  // برای جلوگیری از اشتباه: اگر متن درباره‌ی کپچا/امنیت است ولی درباره‌ی رمز نیست، نگیر.
  if (/کپچا|تصویر امنیتی|اشتباه وارد شده/i.test(t) && !/رمز|کلمه عبور|کاربری|نام کاربری/.test(t)) {
    return null
  }
  if (ACCOUNT_LOCKED_RE.test(t)) {
    return {
      kind: 'account_locked',
      message: 'حساب باربگ مسدود یا غیرفعال شده است — با پشتیبانی سامانه تماس بگیرید',
    }
  }
  if (BAD_CREDENTIALS_RE.test(t)) {
    return {
      kind: 'bad_credentials',
      message:
        'نام کاربری (کد ملی) یا رمز عبور حساب باربگ اشتباه است — از صفحه «حساب‌های باربگ» اصلاحش کنید',
    }
  }
  return null
}

/** آیا این پیام یک خطای قطعیِ اعتبارسنجی است (باید متوقف شود)؟ */
export function isCredentialError(raw: unknown): boolean {
  return classifyCredentialError(raw) !== null
}

/* ──────────────────────────────────────────────────────────────
 *  ۳) خواندن پیام خطای سایت (SweetAlert / alert-danger)
 *     همان چیزی که اتوماسیون (Resilience.ts / step1-engine.js)
 *     انجام می‌دهد.
 * ────────────────────────────────────────────────────────────── */

export async function readSiteErrorMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
): Promise<string> {
  try {
    return await page.evaluate(() => {
      // ۱) SweetAlert (پاپ‌آپ قرمز)
      const pop = document.querySelector('.swal2-popup.swal2-icon-error')
      if (pop && (pop as HTMLElement).offsetParent !== null) {
        const body = (document.getElementById('swal2-html-container')?.textContent || '').trim()
        const title = (document.getElementById('swal2-title')?.textContent || '').trim()
        const t = (body || title).replace(/\s+/g, ' ').trim()
        if (t) return t
      }
      // ۲) alert / validation خلاصه
      const sels = [
        '.alert-danger',
        '.text-danger',
        '.validation-summary-errors',
        '[role="alert"]',
        '.toast-error',
      ]
      for (const sel of sels) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const he = el as HTMLElement
          if (he.offsetParent === null) continue
          const t = (he.innerText || '').replace(/\s+/g, ' ').trim()
          if (t && t.length > 2) return t.slice(0, 200)
        }
      }
      return ''
    })
  } catch {
    return ''
  }
}

/**
 * چند ثانیه صبر می‌کند تا ببیند پاپ‌آپ خطای سایت ظاهر می‌شود یا نه.
 * (سایت خطا را چند ثانیه نشان می‌دهد و بعد محو می‌کند.)
 */
export async function waitForSiteError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  ms = 4000,
): Promise<string> {
  const t0 = Date.now()
  let seen = ''
  while (Date.now() - t0 < ms) {
    const e = await readSiteErrorMessage(page)
    if (e) {
      seen = e
      // اگر خطای قطعی اعتباری است، فوراً برگرد تا از دست نرود
      if (isCredentialError(e)) return e
    }
    await page.waitForTimeout(250).catch(() => {})
  }
  return seen
}

/* ──────────────────────────────────────────────────────────────
 *  ۴) کاوش سبکِ سایت — برای تشخیص برگشتن سایت پس از بلاک
 *     (بدون رندر کامل صفحه)
 * ────────────────────────────────────────────────────────────── */

const SITE_ORIGIN = 'https://barname.utcms.ir'

export async function probeSite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  url: string = SITE_ORIGIN,
): Promise<boolean> {
  try {
    const res = await page.request.get(url, { timeout: 12000, maxRedirects: 3 })
    // هر پاسخی (حتی 403) یعنی سرور در دسترس است
    return res.status() > 0
  } catch {
    return false
  }
}

/* ──────────────────────────────────────────────────────────────
 *  ۵) صبرِ قابل لغو — تا وقتی کاربر توقف نزده صبر می‌کند،
 *     و در طول صبر با کاوش دوره‌ای «برگشتن سایت» را تشخیص می‌دهد.
 *     همان رفتار Resilience.waitUntilBackOnline در اتوماسیون.
 * ────────────────────────────────────────────────────────────── */

export type AbortableLog = (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void

export interface AbortableWaitOptions {
  /** تابعی که اگر true برگرداند، عملیات باید فوراً متوقف شود (کاربر توقف زده) */
  shouldStop: () => boolean
  /** پیام لاگ — اختیاری */
  onLog?: AbortableLog
  /** سایت هر چند ثانیه کاوش شود (پیش‌فرض ۱۵ ثانیه) */
  probeIntervalMs?: number
  /** آدرس کاوش */
  probeUrl?: string
  /** جنس خطا برای انتخاب مدت صبر */
  kind?: 'block' | 'busy' | 'timeout' | 'dead' | 'login' | 'error'
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/**
 * صبر می‌کند تا کاربر توقف نزده یا سایت برگردد.
 * برخلاف Resilience.sleepWithLog اینجا «نامحدود» صبر می‌کنیم —
 * همان خواسته‌ی کاربر: «تا بی‌نهایت باید تلاش کنه متوقف نشه».
 *
 * برمی‌گرداند:
 *   'stopped'  → کاربر توقف زد
 *   'back'     → سایت دوباره در دسترس است
 *   'elapsed'  → یک دور wait تمام شد (حتی اگر سایت برنگشته باشد،
 *                لایه‌ی بالاتر می‌تواند تلاش مجدد کند)
 */
export async function waitForRetryOrAbort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  opts: AbortableWaitOptions,
): Promise<'stopped' | 'back' | 'elapsed'> {
  const probeMs = opts.probeIntervalMs ?? 15000
  const kind = opts.kind ?? 'block'
  const log = (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    try {
      opts.onLog?.(m, l)
    } catch {
      /* ignore */
    }
  }

  // مدت یک «دور» صبر — برای block/busy/timeout ۳ تا ۵ دقیقه،
  // برای بقیه ۱۵ ثانیه. بعد از هر دور، لایه‌ی بالا یک‌بار امتحان می‌کند.
  const oneCycleMs =
    kind === 'dead' || kind === 'login'
      ? 15_000
      : 3 * 60 * 1000 + Math.random() * 2 * 60 * 1000

  const started = Date.now()
  log(
    kind === 'dead' || kind === 'login'
      ? `۱۵ ثانیه صبر و بعد شروع مجدد...`
      : `صبر تا برگشتن سایت (هر ${Math.round(probeMs / 1000)} ثانیه بررسی می‌شود)...`,
    'warn',
  )

  let lastReport = 0
  while (!opts.shouldStop()) {
    // کاوش
    await new Promise((r) => setTimeout(r, probeMs))
    if (opts.shouldStop()) return 'stopped'

    if (kind !== 'dead' && kind !== 'login') {
      if (await probeSite(page, opts.probeUrl ?? SITE_ORIGIN)) {
        const el = Math.round((Date.now() - started) / 1000)
        log(`سایت برگشت (پس از ${fmt(el)}) — ادامه می‌دهیم`, 'success')
        return 'back'
      }
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    if (elapsed - lastReport >= 60) {
      lastReport = elapsed
      log(`هنوز خطا برقرار است — ${fmt(elapsed)} از صبر گذشته، ادامه می‌دهیم`, 'info')
    }

    if (Date.now() - started >= oneCycleMs) {
      log('یک دور صبر تمام شد — یک‌بار امتحان می‌کنیم', 'info')
      return 'elapsed'
    }
  }
  return 'stopped'
}

/* ──────────────────────────────────────────────────────────────
 *  ۶) نگاشت نوع خطا به برچسب فارسی (برای لاگ)
 * ────────────────────────────────────────────────────────────── */

export function transientKind(err: unknown): 'block' | 'busy' | 'timeout' | 'dead' | 'error' {
  if (isPageClosedError(err)) return 'dead'
  if (isServerBusyError(err)) return 'busy'
  if (isTimeoutError(err)) return 'timeout'
  if (isIpBlockError(err)) return 'block'
  return 'error'
}
