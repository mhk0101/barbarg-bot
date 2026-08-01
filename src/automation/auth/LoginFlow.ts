import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'
import { browserManager } from '../browser/BrowserManager'
import { captchaSolver, normalizeDigits } from '../captcha/CaptchaSolver'
import { gotoResilient, reloadResilient, isIpBlockError, runWithBlockRetry } from '../browser/Resilience'

const SITE_URL = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE_URL}/Barname/Account/Login`
// صفحه‌ی مقصد بعد از ورود موفق (فرم حقیقی/حقوقی)
export const TARGET_URL = `${SITE_URL}/barname/Document/HagigiHogugi`
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }

/** تصویر تازه‌ی کپچا (از طریق حل‌کننده‌ی مرکزی، با انتظار برای بارگذاری) */
async function refreshCaptcha(page: Page): Promise<void> {
  await captchaSolver.refreshCaptcha(page)
}

export class LoginFlow {
  private async waitForPageReady(page: Page): Promise<void> {
    try {
      await page.waitForFunction(() => {
        const loading = document.getElementById('loading')
        if (!loading) return true
        const style = window.getComputedStyle(loading)
        return style.display === 'none' || style.visibility === 'hidden' || loading.offsetParent === null
      }, { timeout: 15000 })
    } catch {
      await page.evaluate(() => {
        const loading = document.getElementById('loading')
        if (loading) {
          loading.style.display = 'none'
          loading.style.visibility = 'hidden'
          loading.style.pointerEvents = 'none'
          loading.remove()
        }
      })
    }
    await page.waitForTimeout(1000)
  }

  async loginWithSavedSession(accountId: string): Promise<{ success: boolean; needsReLogin: boolean }> {
    const page = await browserManager.createPage(accountId)
    if (!page) return { success: false, needsReLogin: true }
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2000)
      if (!page.url().includes('Login')) return { success: true, needsReLogin: false }
      return { success: false, needsReLogin: true }
    } catch {
      return { success: false, needsReLogin: true }
    } finally {
      await browserManager.closePage(accountId)
    }
  }

  async openManualLogin(accountId: string): Promise<{ success: boolean }> {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: false, channel: 'chrome' })
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(LOGIN_URL)
    await page.waitForFunction(() => !window.location.pathname.includes('Login'), { timeout: 300000 })
    await page.waitForTimeout(2000)
    ensureDir(SESSION_DIR)
    await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
    await browser.close()
    return { success: true }
  }

  async isSessionValid(accountId: string): Promise<boolean> {
    const statePath = path.join(SESSION_DIR, `${accountId}.json`)
    if (!fs.existsSync(statePath)) return false
    const page = await browserManager.createPage(accountId)
    if (!page) return false
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.waitForPageReady(page)
      return !page.url().includes('Login')
    } catch { return false }
    finally { await browserManager.closePage(accountId) }
  }

  /**
   * ورود تازه در یک صفحه‌ی موجود، بدون اتکا به سشن ذخیره‌شده.
   *
   * چون سشن سایت خیلی زود منقضی می‌شود، این متد قبل از هر عملیات
   * صدا زده می‌شود: کد ملی و رمز را وارد می‌کند، کپچای ریاضی را با
   * OCR حل می‌کند (تا `maxCaptchaAttempts` بار) و در صورت موفقیت
   * به صفحه‌ی مقصد می‌رود.
   */
  /**
   * ورود تازه با «شروع مجدد کامل» در صورت بلاک شدن IP.
   *
   * اگر در هر مرحله IP بلاک شود، منتظر برگشتن سایت می‌ماند (با کاوش فعال،
   * نه خواب ثابت) و کل فرایند ورود را از ابتدا تکرار می‌کند — تا ۲۰ بار.
   */
  async freshLogin(
    page: Page,
    username: string,
    password: string,
    opts?: {
      targetUrl?: string
      maxCaptchaAttempts?: number
      /** تعداد شروع مجدد کامل در صورت بلاک (پیش‌فرض ۲۰) */
      maxRestarts?: number
      onStep?: (msg: string, level?: 'info' | 'success' | 'error' | 'warn') => Promise<void> | void
    },
  ): Promise<{ success: boolean; error?: string; captchaAttempts: number }> {
    const step = async (m: string, l: 'info' | 'success' | 'error' | 'warn' = 'info') => {
      try { await opts?.onStep?.(m, l) } catch { /* ignore */ }
    }

    return await runWithBlockRetry(
      page,
      'ورود به سامانه',
      () => this.freshLoginOnce(page, username, password, opts),
      (r) => !r.success,
      (r) => r.error ?? '',
      {
        maxAttempts: opts?.maxRestarts ?? 20,
        onLog: async (m, l) => { await step(m, l) },
      },
    )
  }

  private async freshLoginOnce(
    page: Page,
    username: string,
    password: string,
    opts?: {
      targetUrl?: string
      maxCaptchaAttempts?: number
      onStep?: (msg: string, level?: 'info' | 'success' | 'error' | 'warn') => Promise<void> | void
    },
  ): Promise<{ success: boolean; error?: string; captchaAttempts: number }> {
    const target = opts?.targetUrl ?? TARGET_URL
    const maxAttempts = opts?.maxCaptchaAttempts ?? 5
    const step = async (m: string, l: 'info' | 'success' | 'error' | 'warn' = 'info') => {
      try { await opts?.onStep?.(m, l) } catch {}
    }

    let captchaAttempts = 0

    try {
      await step('باز کردن صفحه ورود...')
      const nav = await gotoResilient(page, LOGIN_URL, {
        maxAttempts: 20,
        onLog: async (m, l) => { await step(m, l) },
      })
      if (!nav.ok) {
        return {
          success: false,
          error: nav.blocked ? `بلاک: ${nav.error ?? 'IP بلاک است'}` : (nav.error || 'اتصال به سایت برقرار نشد'),
          captchaAttempts,
        }
      }
      await this.waitForPageReady(page)

      // اگر از قبل وارد بودیم، مستقیم برو به مقصد
      if (!page.url().includes('Login')) {
        await step('از قبل وارد شده‌ایم', 'success')
        return await this.goToTarget(page, target, step, captchaAttempts)
      }

      const fillCredentials = async (): Promise<string | null> => {
        const u = await page.$('#NationalCode, input[name="NationalCode"]')
        if (!u) return 'فیلد کد ملی پیدا نشد'
        await u.fill(username)
        const p = await page.$('#user-password, input[type="password"]')
        if (!p) return 'فیلد رمز عبور پیدا نشد'
        await p.fill(password)
        return null
      }

      await step('وارد کردن کد ملی و رمز عبور...')
      const fillErr = await fillCredentials()
      if (fillErr) return { success: false, error: fillErr, captchaAttempts }

      // --- حلقه‌ی حل کپچا + تلاش برای ورود ---
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        captchaAttempts = attempt

        // حل کپچا + نوشتن در فیلد + تأیید اینکه واقعاً نوشته شد
        const cap = await captchaSolver.solveAndFill(page, {
          onLog: async (m, l) => { await step(`[کپچا ${attempt}/${maxAttempts}] ${m}`, l === 'success' ? 'info' : l) },
        })

        if (!cap.filled) {
          // تصویر کپچا اصلاً لود نشده ⇒ رفرش کامل صفحه (نه فقط تازه‌سازی تصویر)
          if (cap.result.needsReload) {
            await step(`تصویر کپچا لود نشده — رفرش کامل صفحه (تلاش ${attempt}/${maxAttempts})`, 'warn')
            const rl = await reloadResilient(page, { onLog: async (m, l) => { await step(m, l) } })
            if (!rl.ok) {
              return {
                success: false,
                error: rl.blocked ? `بلاک: ${rl.error ?? ''}` : (rl.error || 'رفرش صفحه ناموفق'),
                captchaAttempts,
              }
            }
            await this.waitForPageReady(page)
            if (!page.url().includes('Login')) {
              await step('پس از رفرش، وارد شده‌ایم', 'success')
              return await this.goToTarget(page, target, step, captchaAttempts)
            }
            await fillCredentials()
            continue
          }

          await step(`کپچا وارد نشد (تلاش ${attempt}/${maxAttempts}) — تصویر تازه می‌گیرم`, 'warn')
          const refreshed = await captchaSolver.refreshCaptcha(page)
          if (!refreshed) {
            await step('تازه‌سازی تصویر جواب نداد — رفرش کامل صفحه', 'warn')
            const rl = await reloadResilient(page, { onLog: async (m, l) => { await step(m, l) } })
            if (!rl.ok) {
              return {
                success: false,
                error: rl.blocked ? `بلاک: ${rl.error ?? ''}` : (rl.error || 'رفرش صفحه ناموفق'),
                captchaAttempts,
              }
            }
            await this.waitForPageReady(page)
          }
          // فیلدهای ورود ممکن است پاک شده باشند
          try {
            const u = await page.$('#NationalCode, input[name="NationalCode"]')
            if (u && !(await u.inputValue())) await u.fill(username)
            const p = await page.$('#user-password, input[type="password"]')
            if (p && !(await p.inputValue())) await p.fill(password)
          } catch { /* ignore */ }
          continue
        }

        // کمی مکث انسانی قبل از کلیک
        await page.waitForTimeout(600 + Math.random() * 900)

        const loginBtn = await page.$('#inter, button[type="submit"]')
        if (!loginBtn) return { success: false, error: 'دکمه ورود پیدا نشد', captchaAttempts }

        try {
          await loginBtn.click()
          // صبر فعال تا نتیجه‌ی ورود مشخص شود — ورود ممکن است چند ثانیه طول بکشد
          const lr = await this.waitLoginResult(page, 30000)
          if (lr.waited >= 5) await step(`ورود ${lr.waited} ثانیه طول کشید`, 'info')
        } catch (e) {
          if (isIpBlockError(e)) {
            return { success: false, error: 'بلاک: IP هنگام ارسال فرم بسته شد', captchaAttempts }
          }
          throw e
        }
        await this.waitForPageReady(page)

        if (!page.url().includes('Login')) {
          await step('ورود موفق', 'success')
          return await this.goToTarget(page, target, step, captchaAttempts)
        }

        // هنوز در صفحه‌ی ورودیم — پیام خطای سایت را بخوان
        let siteMsg = ''
        try {
          const errEl = await page.$('.alert-danger, .text-danger, .validation-summary-errors, [role="alert"]')
          if (errEl) siteMsg = ((await errEl.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 160)
        } catch {}

        // اگر خطا مربوط به نام کاربری/رمز باشد، تکرار بی‌فایده است
        if (siteMsg && /رمز|کاربر|کد ملی|نام کاربری|قفل|مسدود/.test(siteMsg) && !/کپچا|امنیتی|تصویر/.test(siteMsg)) {
          await step(`خطای سایت: ${siteMsg}`, 'error')
          return { success: false, error: siteMsg, captchaAttempts }
        }

        await step(
          siteMsg
            ? `ورود ناموفق: ${siteMsg}`
            : `ورود ناموفق — پاسخ کپچا «${cap.answer}» پذیرفته نشد (تلاش ${attempt}/${maxAttempts})`,
          'warn',
        )

        // کپچا را تازه کن و دوباره اطلاعات را پر کن (سایت معمولاً فرم را خالی می‌کند)
        await refreshCaptcha(page)
        try {
          const u = await page.$('#NationalCode, input[name="NationalCode"]')
          if (u) await u.fill(username)
          const p = await page.$('#user-password, input[type="password"]')
          if (p) await p.fill(password)
          const c = await page.$('#DNTCaptchaInputText, input[name="DNTCaptchaInputText"]')
          if (c) await c.fill('')
        } catch { /* ignore */ }
      }

      return { success: false, error: `ورود ناموفق پس از ${maxAttempts} تلاش (کپچا/اعتبارسنجی)`, captchaAttempts }
    } catch (e) {
      if (isIpBlockError(e)) {
        return { success: false, error: `بلاک: ${e instanceof Error ? e.message.split('\n')[0] : ''}`, captchaAttempts }
      }
      return { success: false, error: e instanceof Error ? e.message : 'خطای نامشخص در ورود', captchaAttempts }
    }
  }

  /**
   * پس از کلیک «ورود» صبر می‌کند تا نتیجه مشخص شود.
   * هر ۵۰۰ms بررسی می‌کند؛ به‌محض خروج از صفحه‌ی ورود یا ظاهر شدن خطا
   * برمی‌گردد. این‌طور هم ورودهای کند پشتیبانی می‌شوند و هم وقت تلف نمی‌شود.
   */
  private async waitLoginResult(
    page: Page,
    maxMs = 30000,
  ): Promise<{ ok: boolean; error?: string; waited: number }> {
    const t0 = Date.now()

    while (Date.now() - t0 < maxMs) {
      let url = ''
      try { url = page.url() } catch { /* در حال ناوبری */ }

      if (url && !url.includes('Login')) {
        await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
        return { ok: true, waited: Math.round((Date.now() - t0) / 1000) }
      }

      const err = await page.evaluate(() => {
        const sels = ['.alert-danger', '.text-danger', '.validation-summary-errors',
                      '[role="alert"]', '.toast-error', '.swal2-html-container']
        for (const s of sels) {
          for (const el of Array.from(document.querySelectorAll(s))) {
            const he = el as HTMLElement
            if (he.offsetParent === null) continue
            const t = (he.innerText || '').trim()
            if (t && t.length > 2) return t.replace(/\s+/g, ' ').slice(0, 160)
          }
        }
        return ''
      }).catch(() => '')

      if (err) return { ok: false, error: err, waited: Math.round((Date.now() - t0) / 1000) }

      await page.waitForTimeout(500).catch(() => {})
    }

    return { ok: false, error: 'زمان انتظار ورود تمام شد', waited: Math.round((Date.now() - t0) / 1000) }
  }

  private async goToTarget(
    page: Page,
    target: string,
    step: (m: string, l?: 'info' | 'success' | 'error' | 'warn') => Promise<void>,
    captchaAttempts: number,
  ): Promise<{ success: boolean; error?: string; captchaAttempts: number }> {
    await step('رفتن به صفحه عملیات...')
    const nav = await gotoResilient(page, target, {
      maxAttempts: 20,
      onLog: async (m, l) => { await step(m, l) },
    })
    if (!nav.ok) {
      return {
        success: false,
        error: nav.blocked
          ? `بلاک: باز کردن صفحه عملیات — ${nav.error ?? ''}`
          : `خطا در باز کردن صفحه مقصد: ${nav.error ?? ''}`,
        captchaAttempts,
      }
    }
    await this.waitForPageReady(page)

    if (page.url().includes('Login')) {
      return { success: false, error: 'پس از ورود دوباره به صفحه ورود برگشتیم (سشن پذیرفته نشد)', captchaAttempts }
    }

    await step(`صفحه عملیات باز شد: ${page.url()}`, 'success')
    return { success: true, captchaAttempts }
  }

  async automatedLogin(accountId: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const page = await browserManager.createPage(accountId)
    if (!page) return { success: false, error: 'خطا در ایجاد صفحه' }

    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.waitForPageReady(page)

      if (!page.url().includes('Login')) {
        await browserManager.saveSession(accountId)
        return { success: true }
      }

      // Fill credentials
      await page.fill('#NationalCode', username)
      await page.fill('#user-password', password)

      // Solve captcha (حل + نوشتن در فیلد + تأیید)
      for (let attempt = 0; attempt < 5; attempt++) {
        const cap = await captchaSolver.solveAndFill(page)
        if (cap.filled) break
        await refreshCaptcha(page)
      }

      // Click login
      const loginBtn = await page.$('#inter')
      if (loginBtn) await loginBtn.click()
      await page.waitForTimeout(5000)

      if (!page.url().includes('Login')) {
        await browserManager.saveSession(accountId)
        return { success: true }
      }
      return { success: false, error: 'ورود ناموفق' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'خطا' }
    } finally {
      await browserManager.closePage(accountId)
    }
  }
}

export const loginFlow = new LoginFlow()
