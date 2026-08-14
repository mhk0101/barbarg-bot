import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptPassword } from '@/lib/encryption'
import { checkInternetOnline } from '@/lib/network'
import path from 'path'
import fs from 'fs'
import {
  classifyCredentialError,
  friendlyTransientError,
  isCredentialError,
  isPageClosedError,
  isTransientError,
  transientKind,
  waitForSiteError,
  waitForRetryOrAbort,
} from '../_resilience'

const SITE_URL = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE_URL}/Barname/Account/Login`
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const SCREENSHOT_DIR = path.join(process.cwd(), 'automation-data', 'screenshots')
const FINAL_SESSION_KEEP_MS = 10 * 60 * 1000

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

type LoginStatus =
  | 'opening'
  | 'waiting_captcha'
  | 'login_success'
  | 'login_failed'
  | 'bad_credentials'
  | 'account_locked'
  | 'cancelled'
  | 'error'

export type LoginStepStatus = 'info' | 'success' | 'error' | 'warn'

interface LoginSessionData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any
  accountId: string
  status: LoginStatus
  steps: Array<{ step: string; time: string; status: LoginStepStatus }>
  screenshotPath: string | null
  error: string | null
  startedAt: number
  lastCheck: string | null
  attempts: number
}

const sessions = new Map<string, LoginSessionData>()
const finishedSessions = new Map<string, LoginSessionData>()

const TERMINAL_STATUSES: ReadonlySet<LoginStatus> = new Set<LoginStatus>([
  'login_success',
  'login_failed',
  'bad_credentials',
  'account_locked',
  'cancelled',
  'error',
])
function isTerminalStatus(s: LoginStatus): boolean {
  return TERMINAL_STATUSES.has(s)
}

function finishSession(accountId: string, session: LoginSessionData) {
  sessions.delete(accountId)
  finishedSessions.set(accountId, session)
  setTimeout(() => finishedSessions.delete(accountId), FINAL_SESSION_KEEP_MS).unref?.()
}

function addStep(
  sessionId: string,
  step: string,
  status: LoginStepStatus = 'info',
) {
  const s = sessions.get(sessionId) || finishedSessions.get(sessionId)
  if (s) s.steps.push({ step, time: new Date().toLocaleTimeString('fa-IR'), status })
}

function shouldStop(accountId: string): boolean {
  const s = sessions.get(accountId)
  if (!s) return true
  return s.status === 'cancelled'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isLoggedInByUserMenu(page: any): Promise<boolean> {
  return page
    .evaluate(() => {
      const clean = (t: unknown) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()
      const url = location.href
      const onNotification = /\/Barname\/Notification\/Notification/i.test(url)
      const onLogin = /\/Account\/Login/i.test(url)
      const hasLoginForm = !!document.querySelector('#NationalCode, #user-password, #inter')
      if (onLogin || hasLoginForm) return false

      const names = Array.from(
        document.querySelectorAll('span.user-name, small.user-name'),
      )
        .map((el) => clean(el.textContent))
        .filter((t) => t && t.length >= 3 && !/خوش آمدید|نام کاربر|خروج|ورود/.test(t))
      const hasWelcome = Array.from(document.querySelectorAll('.user-status, small.user-status')).some(
        (el) => /خوش آمدید/.test(el.textContent || ''),
      )

      return names.length > 0 && (hasWelcome || onNotification)
    })
    .catch(() => false)
}

/**
 * وضعیت کلی صفحه‌ی ورود را بررسی می‌کند.
 *   - 'logged_in'   : قبلا وارد شده‌ایم
 *   - 'ready'       : فرم ورود آماده است
 *   - 'busy'        : سرور مشغول/خطای ۵xx
 *   - 'waf'         : چالش امنیتی WAF
 *   - 'blank'       : صفحه خالی (احتمال بلاک IP)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function diagnoseLoginPage(page: any): Promise<{
  state: 'logged_in' | 'ready' | 'busy' | 'waf' | 'blank'
  message?: string
}> {
  try {
    return await page.evaluate(() => {
      const body = (document.body?.innerText || '').slice(0, 3000)
      const hasLoginForm = !!document.querySelector('#NationalCode, #user-password, #inter')
      const hasApp = !!document.querySelector(
        '#senderSelectType, #btnAddLoad, .navbar, #layout-menu, span.user-name',
      )
      const hasWafField = !!document.querySelector(
        'input[name="pcode"], input[name="vcode"], input[name="req_data"]',
      )

      if (/Security check|Please enter the above text/i.test(body) || hasWafField) {
        return { state: 'waf', message: 'چالش امنیتی WAF' }
      }

      const BUSY = [
        'قادر به پاسخگویی',
        'چند دقیقه دیگر مجدد',
        'چند دقیقه دیگر مجددا',
        'سرور در حال حاضر',
        'The service is unavailable',
        'service is unavailable',
        'Service Unavailable',
        'temporarily unavailable',
        'Internal Server Error',
      ]
      if (!hasLoginForm && !hasApp && BUSY.some((p) => body.includes(p))) {
        const pre = document.querySelector('pre')
        const msg = pre
          ? (pre as HTMLElement).innerText.trim().slice(0, 200)
          : body.replace(/\s+/g, ' ').slice(0, 200)
        return { state: 'busy', message: msg }
      }

      if (hasApp || (location.href && !/\/Account\/Login/i.test(location.href) && !hasLoginForm)) {
        return { state: 'logged_in' }
      }
      if (hasLoginForm) return { state: 'ready' }
      if (!body.trim()) return { state: 'blank' }
      return { state: 'ready' }
    })
  } catch {
    return { state: 'blank' }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function closeQuietly(browser: any): Promise<void> {
  if (!browser) return Promise.resolve()
  return browser.close().catch(() => {})
}

// ───────── حلقه‌ی اصلی یک تلاش (باز کردن مرورگر تا انتظار برای کپچا) ─────────

interface RunAttemptResult {
  outcome:
    | 'success'
    | 'cancelled'
    | 'bad_credentials'
    | 'account_locked'
    | 'restart'
    | 'error'
  error?: string
}

/**
 * یک «دور» کامل:
 *   مرورگر تازه → باز کردن سایت → بررسی سرور مشغول/WAF →
 *   پر کردن نام کاربری/رمز → انتظار برای ورود کاربر (کپچا).
 *
 * در طول انتظار، اگر خطای موقتی پیش بیاید (بلاک/مشغول/...) یا مرورگر
 * بسته شود، 'restart' برمی‌گرداند تا لایه‌ی بالا مرورگر را ببندد و
 * از نو شروع کند. اگر خطای قطعی اعتبارسنجی باشد (رمز اشتباه و …)
 * همان‌جا متوقف می‌شود.
 */
async function runLoginAttempt(
  session: LoginSessionData,
  account: { id: string; username: string },
  plainPassword: string,
): Promise<RunAttemptResult> {
  const accountId = account.id
  const add = (step: string, st: LoginStepStatus = 'info') =>
    addStep(accountId, step, st)

  add('باز کردن مرورگر جدید...', 'info')
  let chromium: typeof import('playwright').chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    return { outcome: 'error', error: 'ماژول Playwright در دسترس نیست' }
  }

  let browser
  let context
  let page
  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox'],
    })
    context = await browser.newContext()
    page = await context.newPage()
    // این مرورگرِ این دور است؛ اگر تلاش بعدی لازم شد، آن‌وقت جابه‌جا می‌شود.
    session.browser = browser
    session.context = context
    session.page = page
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    add(`خطا در باز کردن مرورگر: ${msg.split('\n')[0].slice(0, 200)}`, 'error')
    return { outcome: 'restart' }
  }

  // اگر کاربر دقیقاً همین لحظه توقف زده باشد، ادامه نده
  if (shouldStop(accountId)) return { outcome: 'cancelled' }

  // رویدادهای بسته‌شدن صفحه/مرورگر صرفاً برای ثبت لاگ استفاده می‌شوند.
  // حلقه‌ی اصلی خودش page.isClosed()/browser.isConnected() را چک می‌کند و
  // در صورت نیاز از نو شروع می‌کند — اینجا وضعیت را دستکاری نمی‌کنیم
  // تا با جریان عادی تداخل نکند.
  const onPageOrBrowserGone = (source: string) => {
    if (!sessions.has(accountId)) return
    if (isTerminalStatus(session.status)) return
    if (shouldStop(accountId)) return
    add(`${source} — شروع مجدد خودکار در چرخه‌ی بعدی`, 'warn')
  }
  page.on('close', () => onPageOrBrowserGone('صفحه بسته شد'))
  page.on('crash', () => onPageOrBrowserGone('مرورگر کرش کرد'))
  browser.on('disconnected', () => onPageOrBrowserGone('اتصال مرورگر قطع شد'))

  // ── باز کردن صفحه ورود با همان منطق اتوماسیون ──
  for (let navTry = 1; ; navTry++) {
    if (shouldStop(accountId)) return { outcome: 'cancelled' }
    add(
      navTry === 1
        ? 'رفتن به صفحه ورود...'
        : `تلاش مجدد برای باز کردن صفحه ورود (${navTry})...`,
      'info',
    )
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(1500)
      break
    } catch (e) {
      if (shouldStop(accountId)) return { outcome: 'cancelled' }
      // مرورگر بسته شده ⇒ باید از نو
      if (isPageClosedError(e)) {
        add('صفحه یا مرورگر بسته شد — شروع مجدد', 'warn')
        return { outcome: 'restart' }
      }
      const friendly = friendlyTransientError(e)
      session.lastCheck = friendly
      add(friendly, 'error')
      if (!isTransientError(e)) {
        // خطای ناشناخته‌ی غیرقابل‌تلاسی؛ برای احتیاط یک بار هم که شده retry کن
        add('خطای ناشناخته در ناوبری — شروع مجدد', 'warn')
      }
      const r = await waitForRetryOrAbort(page, {
        shouldStop: () => shouldStop(accountId),
        onLog: (m, l) => add(m, l === 'warn' ? 'warn' : l),
        kind: transientKind(e),
        probeUrl: LOGIN_URL,
      })
      if (r === 'stopped') return { outcome: 'cancelled' }
      // اگر در حین صبر، صفحه/مرورگر بسته شده باشد، restart
      if (page.isClosed && page.isClosed()) return { outcome: 'restart' }
      if (!browser.isConnected()) return { outcome: 'restart' }
    }
  }

  if (shouldStop(accountId)) return { outcome: 'cancelled' }

  // ── آماده‌سازی صفحه (حذف لایه loading و …) ──
  try {
    await page.waitForFunction(
      () => {
        const loading = document.getElementById('loading')
        if (!loading) return true
        const style = window.getComputedStyle(loading)
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          loading.offsetParent === null
        )
      },
      { timeout: 15000 },
    )
  } catch {
    await page
      .evaluate(() => {
        const loading = document.getElementById('loading')
        if (loading) {
          loading.style.display = 'none'
          loading.style.visibility = 'hidden'
          loading.style.pointerEvents = 'none'
          loading.remove()
        }
      })
      .catch(() => {})
  }

  // ── بررسی «سرور مشغول» / WAF / صفحه خالی ──
  for (let hc = 0; hc < 5; hc++) {
    if (shouldStop(accountId)) return { outcome: 'cancelled' }
    const health = await diagnoseLoginPage(page)

    if (health.state === 'logged_in') {
      // از قبل سشن داریم
      add('نشست فعال موجود — وارد شدید', 'success')
      ensureDir(SESSION_DIR)
      await context
        .storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
        .catch(() => {})
      await prisma.barBargAccount
        .update({
          where: { id: accountId },
          data: { lastLogin: new Date(), lastError: null },
        })
        .catch(() => {})
      session.status = 'login_success'
      session.error = null
      session.lastCheck = null
      await closeQuietly(browser)
      finishSession(accountId, session)
      return { outcome: 'success' }
    }

    if (health.state === 'ready') break

    if (health.state === 'busy' || health.state === 'blank' || health.state === 'waf') {
      const label =
        health.state === 'busy'
          ? `سرور مشغول/در دسترس نیست${health.message ? ': ' + health.message : ''}`
          : health.state === 'waf'
            ? 'چالش امنیتی WAF روی صفحه — موقت است'
            : 'صفحه خالی برگشت (احتمال بلاک IP)'
      add(label, 'error')
      session.lastCheck = label
      const r = await waitForRetryOrAbort(page, {
        shouldStop: () => shouldStop(accountId),
        onLog: (m, l) => add(m, l === 'warn' ? 'warn' : l),
        kind: health.state === 'busy' ? 'busy' : 'block',
      })
      if (r === 'stopped') return { outcome: 'cancelled' }
      // بعد از صبر، رفرش کن و دوباره سلامت را بسنج
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
        await page.waitForTimeout(1500)
      } catch (e) {
        if (isPageClosedError(e)) return { outcome: 'restart' }
        if (isTransientError(e)) return { outcome: 'restart' }
      }
      continue
    }
  }

  // ── پر کردن نام کاربری و رمز (در صورت خالی بودن) ──
  add('پر کردن نام کاربری و رمز عبور...', 'info')
  try {
    const u = await page.$('#NationalCode, input[name="NationalCode"], input[name="username"]')
    if (u) {
      const cur = await u.inputValue().catch(() => '')
      if (!cur) await u.fill(account.username)
    }
    const p = await page.$('#user-password, input[name="Password"], input[type="password"]')
    if (p) {
      const cur = await p.inputValue().catch(() => '')
      if (!cur) await p.fill(plainPassword)
    }
  } catch (e) {
    if (isPageClosedError(e)) return { outcome: 'restart' }
    if (isTransientError(e)) return { outcome: 'restart' }
    add(`خطا در پر کردن فرم: ${friendlyTransientError(e)}`, 'error')
    return { outcome: 'restart' }
  }

  ensureDir(SCREENSHOT_DIR)
  const sp = path.join(SCREENSHOT_DIR, `test-login-${accountId}-${Date.now()}.png`)
  await page.screenshot({ path: sp, fullPage: true }).catch(() => {})
  session.screenshotPath = sp

  // ── انتظار برای ورود کاربر (کپچا) ──
  session.status = 'waiting_captcha'
  add('کپچا را وارد کنید و دکمه ورود را بزنید', 'info')

  let lastNetworkWarn = 0
  while (!shouldStop(accountId)) {
    if (page.isClosed() || !browser.isConnected()) {
      // صفحه/مرورگر کرش کرد یا بسته شد ⇒ از نو
      add('صفحه یا مرورگر بسته شد — شروع مجدد خودکار', 'warn')
      session.status = 'opening'
      session.lastCheck = 'مرورگر بسته شد — شروع مجدد...'
      return { outcome: 'restart' }
    }

    await page.waitForTimeout(1500).catch(() => {})

    // اینترنت را گاه‌گاه چک کن (نه سایت را — که باعث حساسیت نشود)
    if (Date.now() - lastNetworkWarn > 20000) {
      lastNetworkWarn = Date.now()
      const net = await checkInternetOnline(5000).catch(() => ({ online: false }))
      if (!net.online) {
        session.lastCheck = 'اینترنت قطع است؛ منتظر برگشت اتصال می‌مانیم'
        add(session.lastCheck, 'error')
        // قطع اینترنت هم خطای موقتی است — صبر کن تا برگردد
        const until = Date.now() + 60_000
        while (Date.now() < until && !shouldStop(accountId)) {
          await new Promise((r) => setTimeout(r, 5000))
          const n2 = await checkInternetOnline(5000).catch(() => ({ online: false }))
          if (n2.online) break
        }
        continue
      }
    }

    if (await isLoggedInByUserMenu(page)) {
      ensureDir(SESSION_DIR)
      await context
        .storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
        .catch(() => {})
      await prisma.barBargAccount
        .update({
          where: { id: accountId },
          data: { lastLogin: new Date(), lastError: null },
        })
        .catch(() => {})
      session.status = 'login_success'
      session.lastCheck = null
      session.error = null
      add('ورود موفق — نشست ذخیره شد', 'success')
      await closeQuietly(browser)
      finishSession(accountId, session)
      return { outcome: 'success' }
    }

    // ── خواندن پیام خطای سایت (مثل «رمز اشتباه») ──
    // سایت پاپ‌آپ SweetAlert را فقط چند ثانیه نشان می‌دهد؛ پس باید
    // در طول انتظار، زود به زود بخوانیمش.
    const errText = await waitForSiteError(page, 2500)
    if (errText) {
      const cred = classifyCredentialError(errText)
      if (cred) {
        add(`خطای قطعی: ${cred.message}`, 'error')
        session.status =
          cred.kind === 'account_locked' ? 'account_locked' : 'bad_credentials'
        session.error = cred.message
        session.lastCheck = errText
        await prisma.barBargAccount
          .update({ where: { id: accountId }, data: { lastError: cred.message } })
          .catch(() => {})
        const ep = path.join(
          SCREENSHOT_DIR,
          `error-${accountId}-${Date.now()}.png`,
        )
        try {
          if (page && !page.isClosed()) await page.screenshot({ path: ep, fullPage: true })
          session.screenshotPath = ep
        } catch {
          /* ignore */
        }
        await closeQuietly(browser)
        finishSession(accountId, session)
        return { outcome: cred.kind }
      }
      // خطای موقتی سایت (مثل ۵۰۳/Internal Server Error) که به‌صورت
      // پاپ‌آپ یا alert نشان داده می‌شود ⇒ صبر و شروع مجدد خودکار.
      if (!/کپچا|تصویر امنیتی|اشتباه وارد شده/i.test(errText)) {
        add(`خطای موقتی سایت: ${errText.slice(0, 160)} — شروع مجدد`, 'error')
        session.lastCheck = errText
        await closeQuietly(browser)
        return { outcome: 'restart' }
      }
    }

    // ── اگر در صفحه‌ی ورود یک پیام قرمز ثابت ماند (و نه SweetAlert) و
    //    مشخصات حساب را رد کرد، همان را قطعی حساب کن.
    try {
      const alertText = await page.evaluate(() => {
        const sels = ['.alert-danger', '.text-danger', '[role="alert"]']
        for (const sel of sels) {
          const el = document.querySelector(sel) as HTMLElement | null
          if (!el || el.offsetParent === null) continue
          const t = (el.innerText || '').trim().replace(/\s+/g, ' ')
          if (t && t.length > 2) return t.slice(0, 200)
        }
        return ''
      })
      if (alertText && isCredentialError(alertText)) {
        const cred = classifyCredentialError(alertText)!
        add(`خطای قطعی: ${cred.message}`, 'error')
        session.status =
          cred.kind === 'account_locked' ? 'account_locked' : 'bad_credentials'
        session.error = cred.message
        session.lastCheck = alertText
        await prisma.barBargAccount
          .update({ where: { id: accountId }, data: { lastError: cred.message } })
          .catch(() => {})
        await closeQuietly(browser)
        finishSession(accountId, session)
        return { outcome: cred.kind }
      }
    } catch {
      /* ignore */
    }
  }

  // shouldStop ⇒ کاربر توقف زده
  await closeQuietly(browser)
  return { outcome: 'cancelled' }
}

// ───────── حلقه‌ی بیرونی: تلاش نامحدود برای خطاهای موقتی ─────────

async function runLoginLoop(accountId: string) {
  let account
  let plainPassword
  try {
    account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      const s = sessions.get(accountId)
      if (s) {
        s.status = 'error'
        s.error = 'حساب یافت نشد'
        finishSession(accountId, s)
      }
      return
    }
    plainPassword = decryptPassword(account.passwordEncrypted)
  } catch (e) {
    const s = sessions.get(accountId)
    if (s) {
      s.status = 'error'
      s.error = e instanceof Error ? e.message : 'خطا در خواندن حساب'
      finishSession(accountId, s)
    }
    return
  }

  const session = sessions.get(accountId)!
  let restartCount = 0

  while (!shouldStop(accountId)) {
    session.attempts = restartCount + 1
    let result: RunAttemptResult
    try {
      result = await runLoginAttempt(session, account, plainPassword)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (shouldStop(accountId)) break
      if (isPageClosedError(e) || isTransientError(e)) {
        addStep(accountId, `خطای موقتی: ${friendlyTransientError(e)} — شروع مجدد`, 'error')
        result = { outcome: 'restart' }
      } else if (isCredentialError(msg)) {
        const cred = classifyCredentialError(msg)!
        session.status =
          cred.kind === 'account_locked' ? 'account_locked' : 'bad_credentials'
        session.error = cred.message
        addStep(accountId, cred.message, 'error')
        await prisma.barBargAccount
          .update({ where: { id: accountId }, data: { lastError: cred.message } })
          .catch(() => {})
        finishSession(accountId, session)
        return
      } else {
        // خطای ناشناخته را هم موقتی فرض کن و دوباره تلاش کن
        addStep(accountId, `خطای غیرمنتظره: ${msg.split('\n')[0].slice(0, 200)} — شروع مجدد`, 'error')
        result = { outcome: 'restart' }
      }
    }

    if (result.outcome === 'success') return
    if (result.outcome === 'error') {
      const msg = result.error || 'خطای غیرقابل بازیابی'
      session.status = 'error'
      session.error = msg
      addStep(accountId, msg, 'error')
      await prisma.barBargAccount
        .update({ where: { id: accountId }, data: { lastError: msg } })
        .catch(() => {})
      finishSession(accountId, session)
      return
    }
    if (result.outcome === 'cancelled') {
      // باید مطمئن شویم مرورگر بسته شده
      await closeQuietly(session.browser)
      session.browser = null
      session.context = null
      session.page = null
      if (sessions.has(accountId)) {
        session.status = 'cancelled'
        session.error = 'توسط کاربر متوقف شد'
        finishSession(accountId, session)
      }
      return
    }
    if (result.outcome === 'bad_credentials' || result.outcome === 'account_locked') {
      // runLoginAttempt خودش کارهای پایانی را انجام داده
      return
    }

    // outcome === 'restart' — خطای موقتی: صبر و دور بعد
    restartCount += 1
    // بستن مرورگرِ قبلی (اگر هنوز باز است)
    await closeQuietly(session.browser)
    session.browser = null
    session.context = null
    session.page = null

    addStep(
      accountId,
      `خطای موقتی — ${restartCount}مین شروع مجدد خودکار از ابتدا...`,
      'info',
    )
    session.status = 'opening'
    session.lastCheck = `آماده‌سازی تلاش مجدد (${restartCount})...`

    // یک صبر کوتاهِ قابل‌لغو (۱۵ ثانیه) تا از داغ‌شدن CPU و الگوی رباتی جلوگیری شود
    const until = Date.now() + 15000
    while (Date.now() < until && !shouldStop(accountId)) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  // خروج از حلقه با shouldStop
  if (sessions.has(accountId)) {
    const s = sessions.get(accountId)!
    s.status = 'cancelled'
    s.error = 'توسط کاربر متوقف شد'
    addStep(accountId, 'توسط کاربر متوقف شد', 'error')
    finishSession(accountId, s)
  }
}

// ───────────────────────── HTTP handlers ─────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { accountId, action } = body || {}

    if (action === 'confirm') {
      const session = sessions.get(accountId)
      if (!session) return NextResponse.json({ error: 'نشستی یافت نشد' }, { status: 404 })

      try {
        if (session.page && (await isLoggedInByUserMenu(session.page))) {
          ensureDir(SESSION_DIR)
          if (session.context)
            await session.context.storageState({
              path: path.join(SESSION_DIR, `${accountId}.json`),
            })
          await prisma.barBargAccount.update({
            where: { id: accountId },
            data: { lastLogin: new Date(), lastError: null },
          })
          session.status = 'login_success'
          session.lastCheck = null
          session.error = null
          addStep(accountId, 'ورود موفق — نشست ذخیره شد', 'success')
        } else {
          session.status = 'login_failed'
          addStep(accountId, 'ورود ناموفق — هنوز در صفحه ورود', 'error')
          ensureDir(SCREENSHOT_DIR)
          const sp = path.join(
            SCREENSHOT_DIR,
            `login-failed-${accountId}-${Date.now()}.png`,
          )
          if (session.page) await session.page.screenshot({ path: sp, fullPage: true })
          session.screenshotPath = sp
          await prisma.barBargAccount.update({
            where: { id: accountId },
            data: { lastError: 'ورود ناموفق' },
          })
        }
      } catch (e: unknown) {
        session.status = 'error'
        session.error = e instanceof Error ? e.message : 'خطا'
        addStep(accountId, `خطا: ${session.error}`, 'error')
      }

      if (session.browser) await session.browser.close().catch(() => {})
      finishSession(accountId, session)
      return NextResponse.json({ status: session.status, steps: session.steps })
    }

    if (action === 'cancel') {
      const session = sessions.get(accountId)
      if (session) {
        // اول وضعیت را terminal کن و از sessions خارج کن؛ بعد مرورگر را ببند.
        session.status = 'cancelled'
        session.error = 'توسط کاربر متوقف شد'
        addStep(accountId, 'توسط کاربر متوقف شد', 'error')
        finishSession(accountId, session)
        if (session.browser) await session.browser.close().catch(() => {})
      }
      return NextResponse.json({ success: true })
    }

    if (!accountId)
      return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })

    const account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) return NextResponse.json({ error: 'حساب یافت نشد' }, { status: 404 })

    if (sessions.has(accountId)) {
      return NextResponse.json(
        { error: 'یک نشست فعال برای این حساب وجود دارد', sessionId: accountId },
        { status: 409 },
      )
    }

    const sessionData: LoginSessionData = {
      browser: null,
      context: null,
      page: null,
      accountId,
      status: 'opening',
      steps: [],
      screenshotPath: null,
      error: null,
      startedAt: Date.now(),
      lastCheck: null,
      attempts: 0,
    }
    sessions.set(accountId, sessionData)
    addStep(accountId, 'شروع فرایند ورود مقاوم (مانند اتوماسیون)...', 'info')

    // حلقه را در پس‌زمینه اجرا کن (تا پاسخ HTTP برگردد)
    void runLoginLoop(accountId).catch((e) => {
      const s = sessions.get(accountId)
      if (s && !isTerminalStatus(s.status)) {
        s.status = 'error'
        s.error = e instanceof Error ? e.message : 'خطای غیرمنتظره'
        addStep(accountId, `خطای غیرمنتظره: ${s.error}`, 'error')
        finishSession(accountId, s)
      }
    })

    return NextResponse.json({
      success: true,
      sessionId: accountId,
      message: 'مرورگر باز شد. اگر خطای موقتی مثل بلاک IP یا مشغولی سایت رخ دهد، خودکار صبر و دوباره تلاش می‌شود؛ فقط در صورت اشتباه بودن نام کاربری/رمز متوقف می‌شود.',
      steps: sessionData.steps,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    if (!accountId)
      return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })

    const session = sessions.get(accountId) || finishedSessions.get(accountId)
    if (!session) return NextResponse.json({ status: 'not_found', steps: [] })

    return NextResponse.json({
      status: session.status,
      steps: session.steps,
      screenshotPath: session.screenshotPath,
      error: session.error,
      lastCheck: session.lastCheck,
      attempts: session.attempts,
      elapsed: Math.floor((Date.now() - session.startedAt) / 1000),
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    )
  }
}
