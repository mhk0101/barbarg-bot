import type { Page } from 'playwright'

/**
 * مقاومت در برابر بلاک موقت IP و خطاهای شبکه.
 *
 * سایت وقتی ترافیک زیاد ببیند اتصال را می‌بندد:
 *     net::ERR_CONNECTION_CLOSED / RESET / EMPTY_RESPONSE
 *
 * راهبرد: به‌جای خواب ثابت، هر چند ثانیه سایت را «کاوش» می‌کنیم.
 * لحظه‌ای که بالا آمد، فوراً ادامه می‌دهیم — نه یک ثانیه دیرتر.
 */

const BLOCK_PATTERNS = [
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_RESET',
  'ERR_EMPTY_RESPONSE',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_NETWORK_CHANGED',
  'ERR_SOCKET_NOT_CONNECTED',
  'ERR_TIMED_OUT',
  'ERR_ADDRESS_UNREACHABLE',
  'ERR_TUNNEL_CONNECTION_FAILED',
]

export function isIpBlockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return BLOCK_PATTERNS.some((p) => msg.includes(p))
}

export type LogFn = (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void | Promise<void>

export interface ResilientOptions {
  /** تعداد کل تلاش‌ها (پیش‌فرض ۲۰) */
  maxAttempts?: number
  /** حداقل انتظار بین تلاش‌ها پس از بلاک (پیش‌فرض ۳ دقیقه) */
  cooldownMinMs?: number
  /** حداکثر انتظار (پیش‌فرض ۵ دقیقه) */
  cooldownMaxMs?: number
  /** فاصله‌ی کاوش برای تشخیص برگشتن سایت (پیش‌فرض ۱۵ ثانیه) */
  probeIntervalMs?: number
  /** چند بار تایم‌اوت تحمل شود پیش از اعلام شکست (پیش‌فرض ۲) */
  maxTimeoutTries?: number
  timeout?: number
  onLog?: LogFn
}

const SITE_ORIGIN = 'https://barname.utcms.ir'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/**
 * کاوش سبک: بدون بارگذاری کامل صفحه، فقط چک می‌کند سرور جواب می‌دهد یا نه.
 * از `page.request` استفاده می‌کند که کوکی‌ها را حفظ می‌کند ولی رندر نمی‌کند.
 */
async function probeSite(page: Page, url: string): Promise<boolean> {
  try {
    const res = await page.request.get(url, { timeout: 12000, maxRedirects: 3 })
    // هر پاسخی (حتی 403) یعنی سرور در دسترس است
    return res.status() > 0
  } catch {
    return false
  }
}

/**
 * منتظر می‌ماند تا سایت برگردد — با کاوش دوره‌ای.
 * به‌محض در دسترس شدن، بلافاصله برمی‌گردد.
 */
async function waitUntilBackOnline(
  page: Page,
  url: string,
  maxWaitMs: number,
  probeMs: number,
  log: (m: string, l?: 'info' | 'warn' | 'error' | 'success') => Promise<void>,
): Promise<boolean> {
  const started = Date.now()
  await log(`صبر تا برگشتن سایت (حداکثر ${fmt(Math.round(maxWaitMs / 1000))}) — هر ${Math.round(probeMs / 1000)} ثانیه بررسی می‌شود`, 'warn')

  let lastReport = 0
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, probeMs))

    if (await probeSite(page, url)) {
      const el = Math.round((Date.now() - started) / 1000)
      await log(`سایت برگشت (پس از ${fmt(el)}) — ادامه می‌دهیم`, 'success')
      return true
    }

    const elapsed = Math.round((Date.now() - started) / 1000)
    if (elapsed - lastReport >= 60) {
      lastReport = elapsed
      const remain = Math.round((maxWaitMs - (Date.now() - started)) / 1000)
      await log(`هنوز بلاک است — ${fmt(elapsed)} گذشته، ${fmt(Math.max(0, remain))} باقی`, 'info')
    }
  }

  await log('زمان انتظار تمام شد — تلاش مجدد', 'warn')
  return false
}


/* ------------------------------------------------------------------ */
/*  «سرور مشغول» — صفحه لود می‌شود ولی سایت جواب نمی‌دهد                */
/* ------------------------------------------------------------------ */

/** نشانه‌ی پیام مشغولی سرور */
export const SERVER_BUSY_MARK = 'سرور مشغول:'

const BUSY_PATTERNS = [
  'The service is unavailable',
  'service is unavailable',
  'قادر به پاسخگویی',
  'چند دقیقه دیگر مجدد',
  'چند دقیقه دیگر مجددا',
  'سرور در حال حاضر',
  'Service Unavailable',
  'temporarily unavailable',
]

/**
 * آیا صفحه‌ی فعلی پیام «سرور در حال حاضر قادر به پاسخگویی نمی‌باشد» را نشان می‌دهد؟
 *
 * این حالت با بلاک IP فرق دارد: اتصال برقرار می‌شود و صفحه لود می‌شود،
 * ولی محتوای آن فقط یک پیام خطاست. راه‌حل: بستن مرورگر و صبر چند دقیقه.
 */
export async function isServerBusy(page: Page): Promise<boolean> {
  try {
    return await page.evaluate((pats: string[]) => {
      // متن کوتاه صفحه (صفحه‌ی خطا معمولا محتوای کمی دارد)
      const body = (document.body?.innerText || '').slice(0, 3000)
      if (!body) return false
      const hit = pats.some((p) => body.includes(p))
      if (!hit) return false
      // اگر فرم ورود هم روی صفحه هست، یعنی صفحه‌ی واقعی است نه خطا
      const hasLoginForm = !!document.querySelector('#NationalCode, #user-password')
      const hasFormPage = !!document.querySelector('#senderSelectType, #btnAddLoad')
      return !hasLoginForm && !hasFormPage
    }, BUSY_PATTERNS)
  } catch { return false }
}

/** متن دقیق پیام مشغولی (برای لاگ) */
export async function readBusyMessage(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const pre = document.querySelector('pre')
      if (pre) return (pre as HTMLElement).innerText.trim().slice(0, 200)
      return (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200)
    })
  } catch { return '' }
}

/** آیا این خطا از نوع «سرور مشغول» است؟ */
export function isServerBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg.includes(SERVER_BUSY_MARK) || BUSY_PATTERNS.some((p) => msg.includes(p))
}

/** انتظار ساده با گزارش (برای وقتی صفحه/مرورگر در دسترس نیست) */
export async function sleepWithLog(ms: number, log?: LogFn): Promise<void> {
  const total = Math.round(ms / 1000)
  if (log) await log(`صبر ${Math.round(total / 60)} دقیقه (${total} ثانیه) پیش از تلاش مجدد...`, 'warn')
  const step = 30000
  let waited = 0
  while (waited < ms) {
    const chunk = Math.min(step, ms - waited)
    await new Promise((r) => setTimeout(r, chunk))
    waited += chunk
    const remain = Math.round((ms - waited) / 1000)
    if (log && remain > 0) await log(`... ${remain} ثانیه باقی مانده`, 'info')
  }
}


/* ------------------------------------------------------------------ */
/*  خطای پاپ‌آپ (SweetAlert) روی صفحه‌ی فرم                            */
/* ------------------------------------------------------------------ */

export const SWAL_ERROR_MARK = 'خطای سایت:'

/**
 * پاپ‌آپ خطای SweetAlert که چند ثانیه ظاهر می‌شود و می‌رود.
 * عنوانش همیشه «خطا» است ولی متنش فرق می‌کند (مثلا Internal Server Error).
 * چون سریع محو می‌شود، باید بلافاصله بعد از هر عمل چک شود.
 */
export async function readSwalError(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const pop = document.querySelector('.swal2-popup.swal2-icon-error')
      if (!pop || (pop as HTMLElement).offsetParent === null) return ''
      const body = (document.getElementById('swal2-html-container')?.textContent || '').trim()
      const title = (document.getElementById('swal2-title')?.textContent || '').trim()
      return (body || title).replace(/\s+/g, ' ').slice(0, 160)
    })
  } catch { return '' }
}

/** چند ثانیه صبر می‌کند تا ببیند پاپ‌آپ خطا ظاهر می‌شود یا نه */
export async function waitForSwalError(page: Page, ms = 3000): Promise<string> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const e = await readSwalError(page)
    if (e) return e
    await page.waitForTimeout(300).catch(() => {})
  }
  return ''
}


/**
 * برخی خطاهای پاپ‌آپ «موقتی» نیستند و تکرار بی‌فایده است.
 * مثال: «مختصات انتخابی نامعتبر میباشند» ⇒ مشکل داده‌ی مبدا/مقصد است،
 * نه فشار روی سرور. این‌ها را جدا می‌کنیم تا ۱۰۰ بار تکرار نشوند.
 */
const PERMANENT_SWAL_PATTERNS = [
  'مختصات انتخابی نامعتبر',
  'کد ملی',
  'کدملی',
  'شناسه ملی',
  'اعتبار کافی',
  'موجودی',
  'تکراری',
  'مجوز',
  'دسترسی ندارید',
]

/** آیا این خطای پاپ‌آپ دائمی است (نباید تکرار شود)؟ */
export function isPermanentSwalError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  if (!msg.includes(SWAL_ERROR_MARK)) return false
  return PERMANENT_SWAL_PATTERNS.some((p) => msg.includes(p))
}

export function isSwalErrorMessage(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg.includes(SWAL_ERROR_MARK)
}

/* ------------------------------------------------------------------ */
/*  تایم‌اوت ناوبری                                                    */
/* ------------------------------------------------------------------ */

export const TIMEOUT_MARK = 'تایم‌اوت:'

export function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg.includes('Timeout') && msg.includes('exceeded')
}

export function isTimeoutMessage(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg.includes(TIMEOUT_MARK) || isTimeoutError(err)
}


/* ------------------------------------------------------------------ */
/*  صفحه/مرورگر بسته شده                                               */
/* ------------------------------------------------------------------ */

export const PAGE_CLOSED_MARK = 'صفحه بسته:'

/**
 * وقتی مرورگر بسته می‌شود، شیء page مرده است و تلاش مجدد با همان
 * page هرگز موفق نمی‌شود. باید صفحه‌ی تازه ساخته شود، نه تکرار.
 */
export function isPageClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /Target page, context or browser has been closed|Target closed|browser has been closed|Session closed/i.test(msg)
}

export function isPageClosedMessage(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg.includes(PAGE_CLOSED_MARK) || isPageClosedError(err)
}

/**
 * `page.goto` مقاوم.
 * در صورت بلاک: منتظر برگشتن سایت می‌ماند (با کاوش فعال) و دوباره تلاش می‌کند.
 */
export async function gotoResilient(
  page: Page,
  url: string,
  opts?: ResilientOptions,
): Promise<{ ok: boolean; error?: string; attempts: number; blocked: boolean }> {
  const maxAttempts = opts?.maxAttempts ?? 20
  const cdMin = opts?.cooldownMinMs ?? 3 * 60 * 1000
  const cdMax = opts?.cooldownMaxMs ?? 5 * 60 * 1000
  const probeMs = opts?.probeIntervalMs ?? 15000
  const timeout = opts?.timeout ?? 45000
  const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
  }

  let blocked = false
  let lastErr = ''
  let timeoutCount = 0
  const maxTimeoutTries = opts?.maxTimeoutTries ?? 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
      if (attempt > 1) await log(`اتصال در تلاش ${attempt}/${maxAttempts} برقرار شد`, 'success')
      return { ok: true, attempts: attempt, blocked }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)

      if (isIpBlockError(e)) {
        blocked = true
        await log(`IP بلاک است (تلاش ${attempt}/${maxAttempts})`, 'warn')

        if (attempt === maxAttempts) break

        const budget = cdMin + Math.random() * (cdMax - cdMin)
        // اگر سایت زودتر برگشت، فوراً تلاش بعدی
        await waitUntilBackOnline(page, url, budget, probeMs, log)
        continue
      }

      // صفحه/مرورگر بسته شده ⇒ تکرار با همین page بی‌فایده است
      if (isPageClosedError(e)) {
        await log('صفحه یا مرورگر بسته شده — نیاز به صفحه‌ی تازه', 'warn')
        return {
          ok: false,
          error: `${PAGE_CLOSED_MARK} صفحه یا مرورگر بسته شده است`,
          attempts: attempt,
          blocked,
        }
      }

      // تایم‌اوت: طبق سیاست، فقط ۲ بار تلاش و بعد اعلام شکست تا لایه‌ی
      // بالاتر مرورگر را ببندد و ۲ تا ۵ دقیقه صبر کند
      if (isTimeoutError(e)) {
        timeoutCount++
        await log(`تایم‌اوت ناوبری (${timeoutCount}/${maxTimeoutTries})`, 'warn')
        if (timeoutCount >= maxTimeoutTries) {
          return {
            ok: false,
            error: `${TIMEOUT_MARK} پس از ${maxTimeoutTries} تلاش، صفحه باز نشد`,
            attempts: attempt,
            blocked,
          }
        }
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }

      await log(`خطای ناوبری (${attempt}/${maxAttempts}): ${lastErr.split('\n')[0].slice(0, 120)}`, 'warn')
      if (attempt === maxAttempts) break
      await new Promise((r) => setTimeout(r, 5000))
    }
  }

  return {
    ok: false,
    error: blocked
      ? `IP پس از ${maxAttempts} تلاش همچنان بلاک است`
      : lastErr || 'ناوبری ناموفق',
    attempts: maxAttempts,
    blocked,
  }
}

/** رفرش مقاوم صفحه */
export async function reloadResilient(
  page: Page,
  opts?: ResilientOptions,
): Promise<{ ok: boolean; error?: string; blocked: boolean }> {
  const maxAttempts = opts?.maxAttempts ?? 20
  const cdMin = opts?.cooldownMinMs ?? 3 * 60 * 1000
  const cdMax = opts?.cooldownMaxMs ?? 5 * 60 * 1000
  const probeMs = opts?.probeIntervalMs ?? 15000
  const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
  }

  let blocked = false
  let lastErr = ''
  const url = (() => { try { return page.url() } catch { return SITE_ORIGIN } })()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: opts?.timeout ?? 45000 })
      return { ok: true, blocked }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (isIpBlockError(e)) {
        blocked = true
        await log(`IP بلاک است هنگام رفرش (${attempt}/${maxAttempts})`, 'warn')
        if (attempt === maxAttempts) break
        await waitUntilBackOnline(page, url || SITE_ORIGIN, cdMin + Math.random() * (cdMax - cdMin), probeMs, log)
        continue
      }
      if (attempt === maxAttempts) break
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  return { ok: false, error: lastErr || 'رفرش ناموفق', blocked }
}

/**
 * یک عملیات دلخواه را با مدیریت بلاک IP اجرا می‌کند.
 * اگر تابع خطای بلاک بدهد، منتظر برگشتن سایت می‌ماند و **از اول** اجرا می‌کند.
 *
 * برای «ورود از ابتدا در صورت بلاک» استفاده می‌شود.
 */
export async function runWithBlockRetry<T>(
  page: Page,
  label: string,
  fn: () => Promise<T>,
  isFailure: (r: T) => boolean,
  getError: (r: T) => string,
  opts?: ResilientOptions,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 20
  const cdMin = opts?.cooldownMinMs ?? 3 * 60 * 1000
  const cdMax = opts?.cooldownMaxMs ?? 5 * 60 * 1000
  const probeMs = opts?.probeIntervalMs ?? 15000
  const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
  }

  let last: T | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await log(`${label} — تلاش ${attempt}/${maxAttempts}`, 'info')

    try {
      const r = await fn()
      last = r
      if (!isFailure(r)) return r

      const err = getError(r)
      const looksBlocked = BLOCK_PATTERNS.some((p) => err.includes(p)) || /بلاک/.test(err)

      if (!looksBlocked) return r
      if (attempt === maxAttempts) return r

      await log(`${label} به‌خاطر بلاک شکست خورد — صبر و شروع مجدد`, 'warn')
      await waitUntilBackOnline(page, SITE_ORIGIN, cdMin + Math.random() * (cdMax - cdMin), probeMs, log)
    } catch (e) {
      if (isPageClosedError(e)) throw e   // صفحه مرده — لایه‌ی بالاتر باید بازسازی کند
      if (!isIpBlockError(e)) throw e
      if (attempt === maxAttempts) throw e
      await log(`${label} — خطای بلاک، صبر و شروع مجدد`, 'warn')
      await waitUntilBackOnline(page, SITE_ORIGIN, cdMin + Math.random() * (cdMax - cdMin), probeMs, log)
    }
  }

  return last as T
}
