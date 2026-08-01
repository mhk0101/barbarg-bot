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
      if (!isIpBlockError(e)) throw e
      if (attempt === maxAttempts) throw e
      await log(`${label} — خطای بلاک، صبر و شروع مجدد`, 'warn')
      await waitUntilBackOnline(page, SITE_ORIGIN, cdMin + Math.random() * (cdMax - cdMin), probeMs, log)
    }
  }

  return last as T
}
