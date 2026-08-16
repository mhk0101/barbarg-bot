import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'
import { decryptPassword } from '@/lib/encryption'
import { checkInternetOnline } from '@/lib/network'
import path from 'path'
import fs from 'fs'

const LOGIN_URL = 'https://barname.utcms.ir/Barname/Account/Login'
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const SCREENSHOT_DIR = path.join(process.cwd(), 'automation-data', 'screenshots')
// بدون timeout ثابت: تا وقتی کاربر دکمه توقف/لغو نزند ادامه می‌دهد.
const FINAL_SESSION_KEEP_MS = 10 * 60 * 1000

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }

interface LoginSessionData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any
  accountId: string
  status: 'opening' | 'waiting_captcha' | 'login_success' | 'login_failed' | 'cancelled' | 'error'
  steps: Array<{ step: string; time: string; status: 'info' | 'success' | 'error' }>
  screenshotPath: string | null
  error: string | null
  startedAt: number
  lastCheck: string | null
}

const sessions = new Map<string, LoginSessionData>()
const finishedSessions = new Map<string, LoginSessionData>()

function finishSession(accountId: string, session: LoginSessionData) {
  sessions.delete(accountId)
  finishedSessions.set(accountId, session)
  setTimeout(() => finishedSessions.delete(accountId), FINAL_SESSION_KEEP_MS).unref?.()
}

function addStep(sessionId: string, step: string, status: 'info' | 'success' | 'error' = 'info') {
  const s = sessions.get(sessionId) || finishedSessions.get(sessionId)
  if (s) s.steps.push({ step, time: new Date().toLocaleTimeString('fa-IR'), status })
}

function isNetworkOrBlockError(e: unknown): boolean {
  const t = String(e instanceof Error ? e.message : e || '')
  return /net::ERR_|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|Timeout .*exceeded/i.test(t)
}

function friendlyLoginError(e: unknown): string {
  const t = String(e instanceof Error ? e.message : e || '')
  if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/i.test(t)) {
    return 'اتصال به سامانه بسته شد؛ احتمال قطعی اینترنت، اختلال شبکه یا بلاک موقت IP وجود دارد'
  }
  if (/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|Timeout .*exceeded/i.test(t)) {
    return 'اتصال به سامانه زمان‌بر شد و پاسخ نداد؛ کمی صبر می‌کنیم و دوباره تلاش می‌کنیم'
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_CHANGED/i.test(t)) {
    return 'اینترنت یا DNS/شبکه در دسترس نیست؛ بعد از برگشت اتصال دوباره تلاش می‌شود'
  }
  if (/Target page, context or browser has been closed|Target closed|browser has been closed|Session closed/i.test(t)) {
    return 'مرورگر توسط کاربر بسته شد'
  }
  return t.split('\n')[0].slice(0, 220) || 'خطای نامشخص'
}



async function isLoggedInByUserMenu(page: any): Promise<boolean> {
  return page.evaluate(() => {
    const clean = (t: unknown) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()
    const url = location.href
    const onNotification = /\/Barname\/Notification\/Notification/i.test(url)
    const onLogin = /\/Account\/Login/i.test(url)
    const hasLoginForm = !!document.querySelector('#NationalCode, #user-password, #inter')
    if (onLogin || hasLoginForm) return false

    const names = Array.from(document.querySelectorAll('span.user-name, small.user-name'))
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length >= 3 && !/خوش آمدید|نام کاربر|خروج|ورود/.test(t))
    const hasWelcome = Array.from(document.querySelectorAll('.user-status, small.user-status'))
      .some((el) => /خوش آمدید/.test(el.textContent || ''))

    return names.length > 0 && (hasWelcome || onNotification)
  }).catch(() => false)
}

async function waitForRetry(accountId: string, ms: number) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (!sessions.has(accountId)) throw new Error('توسط کاربر متوقف شد')
    await new Promise((r) => setTimeout(r, Math.min(5000, until - Date.now())))
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const { accountId, action } = body

    if (action === 'confirm') {
      const session = sessions.get(accountId)
      if (!session) return NextResponse.json({ error: 'نشستی یافت نشد' }, { status: 404 })

      try {
        if (session.page && await isLoggedInByUserMenu(session.page)) {
          ensureDir(SESSION_DIR)
          if (session.context) await session.context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
          session.status = 'login_success'
          session.lastCheck = null
          session.error = null
          addStep(accountId, 'ورود موفق — نشست ذخیره شد', 'success')
        } else {
          session.status = 'login_failed'
          addStep(accountId, 'ورود ناموفق — هنوز در صفحه ورود', 'error')
          ensureDir(SCREENSHOT_DIR)
          const sp = path.join(SCREENSHOT_DIR, `login-failed-${accountId}-${Date.now()}.png`)
          if (session.page) await session.page.screenshot({ path: sp, fullPage: true })
          session.screenshotPath = sp
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastError: 'ورود ناموفق' } })
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
        // وگرنه event بستن مرورگر وسط page.goto ممکن است به‌اشتباه خطای Playwright ثبت کند.
        session.status = 'cancelled'
        session.error = 'توسط کاربر متوقف شد'
        addStep(accountId, 'توسط کاربر متوقف شد', 'error')
        finishSession(accountId, session)
        if (session.browser) await session.browser.close().catch(() => {})
      }
      return NextResponse.json({ success: true })
    }

    if (!accountId) return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })

    const account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) return NextResponse.json({ error: 'حساب یافت نشد' }, { status: 404 })

    if (sessions.has(accountId)) {
      return NextResponse.json({ error: 'یک نشست فعال برای این حساب وجود دارد', sessionId: accountId }, { status: 409 })
    }

    const plainPassword = decryptPassword(account.passwordEncrypted)
    const { chromium } = await import('playwright')

    const sessionData: LoginSessionData = {
      browser: null, context: null, page: null, accountId,
      status: 'opening', steps: [], screenshotPath: null, error: null,
      startedAt: Date.now(), lastCheck: null,
    }
    sessions.set(accountId, sessionData)
    addStep(accountId, 'باز کردن مرورگر...', 'info')

    ;(async () => {
      try {
        const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox'] })
        sessionData.browser = browser
        const context = await browser.newContext()
        sessionData.context = context
        const page = await context.newPage()
        sessionData.page = page
        const markClosed = () => {
          if (!sessions.has(accountId)) return
          if (isTerminalStatus(sessionData.status)) return
          sessionData.status = 'error'
          sessionData.error = 'مرورگر توسط کاربر بسته شد'
          addStep(accountId, 'مرورگر توسط کاربر بسته شد', 'error')
          void prisma.barBargAccount.update({ where: { id: accountId }, data: { lastError: sessionData.error } }).catch(() => {})
          finishSession(accountId, sessionData)
        }
        page.on('close', markClosed)
        page.on('crash', () => {
          if (!sessions.has(accountId) || isTerminalStatus(sessionData.status)) return
          sessionData.status = 'error'
          sessionData.error = 'مرورگر کرش کرد'
          addStep(accountId, 'مرورگر کرش کرد', 'error')
          finishSession(accountId, sessionData)
        })
        browser.on('disconnected', markClosed)

        let loginPageOpened = false
        let gotoAttempt = 0
        while (!loginPageOpened) {
          if (!sessions.has(accountId)) return
          gotoAttempt += 1
          addStep(accountId, gotoAttempt === 1 ? 'رفتن به صفحه ورود...' : `تلاش مجدد برای باز کردن صفحه ورود (${gotoAttempt})...`, 'info')
          try {
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForTimeout(1200)
            loginPageOpened = true
          } catch (e) {
            if (!sessions.has(accountId) || sessionData.status === 'cancelled') return
            const friendly = friendlyLoginError(e)
            sessionData.lastCheck = friendly
            addStep(accountId, friendly, 'error')

            if (!isNetworkOrBlockError(e)) throw e

            const waitMs = /بلاک|بسته شد|اختلال/.test(friendly)
              ? 180000 + Math.random() * 120000
              : 30000 + Math.random() * 30000
            addStep(accountId, `خطای موقتی است؛ ${Math.round(waitMs / 1000)} ثانیه صبر می‌کنیم و دوباره از اول تلاش می‌کنیم`, 'info')
            await waitForRetry(accountId, waitMs)
          }
        }

        if (await isLoggedInByUserMenu(page)) {
          ensureDir(SESSION_DIR)
          await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
          sessionData.status = 'login_success'
          sessionData.lastCheck = null
          sessionData.error = null
          addStep(accountId, 'نشست فعال موجود — وارد شدید', 'success')
          await browser.close().catch(() => {})
          finishSession(accountId, sessionData)
          return
        }

        addStep(accountId, 'پر کردن نام کاربری...', 'info')
        const usernameInput = await page.$('#NationalCode, input[name="NationalCode"], input[name="username"]')
        if (usernameInput) await usernameInput.fill(account.username)

        addStep(accountId, 'پر کردن رمز عبور...', 'info')
        const passwordInput = await page.$('#user-password, input[name="Password"], input[type="password"]')
        if (passwordInput) await passwordInput.fill(plainPassword)

        ensureDir(SCREENSHOT_DIR)
        const sp = path.join(SCREENSHOT_DIR, `test-login-${accountId}-${Date.now()}.png`)
        await page.screenshot({ path: sp, fullPage: true })
        sessionData.screenshotPath = sp

        sessionData.status = 'waiting_captcha'
        addStep(accountId, 'کپچا را وارد کنید و ورود را بزنید', 'info')

        let lastNetworkWarn = 0
        while (true) {
          if (!sessions.has(accountId)) return
          if (page.isClosed() || !browser.isConnected()) throw new Error('مرورگر توسط کاربر بسته شد')
          await page.waitForTimeout(3000)
          try {
            if (Date.now() - lastNetworkWarn > 15000) {
              lastNetworkWarn = Date.now()
              // اینجا دیگر خود barname را probe نمی‌کنیم؛ چون ممکن است باعث حساسیت/بلاک شود
              // و درحالی‌که کاربر در همان صفحه در حال حل کپچاست، هشدار اشتباه بدهد.
              // فقط اینترنت عمومی را چک می‌کنیم.
              const net = await checkInternetOnline(5000).catch(() => ({ online: false }))
              if (!net.online) {
                sessionData.lastCheck = 'اینترنت قطع است؛ منتظر برگشت اتصال می‌مانیم'
                addStep(accountId, sessionData.lastCheck, 'error')
                continue
              }
            }
            if (await isLoggedInByUserMenu(page)) {
              ensureDir(SESSION_DIR)
              await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
              await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
              sessionData.status = 'login_success'
              sessionData.lastCheck = null
              sessionData.error = null
              addStep(accountId, 'ورود موفق — نشست ذخیره شد', 'success')
              await browser.close().catch(() => {})
              finishSession(accountId, sessionData)
              return
            }
            const errorEl = await page.$('.alert-danger, .text-danger, [role="alert"]')
            if (errorEl) {
              const errorText = await errorEl.textContent()
              if (errorText && errorText.trim()) {
                sessionData.lastCheck = errorText.trim()
                addStep(accountId, `خطا از سایت: ${errorText.trim()}`, 'error')
              }
            }
          } catch {}
        }

      } catch (e: unknown) {
        // اگر کاربر دکمه توقف زده باشد، بستن مرورگر ممکن است خطای page.goto/Target closed بدهد؛
        // این خطا نباید به کاربر به‌عنوان خطای واقعی نمایش داده شود.
        if (!sessions.has(accountId) || sessionData.status === 'cancelled') {
          if (sessionData.status !== 'cancelled') {
            sessionData.status = 'cancelled'
            sessionData.error = 'توسط کاربر متوقف شد'
            finishSession(accountId, sessionData)
          }
          return
        }

        const raw = e instanceof Error ? e.message : 'خطا'
        const closedByUser = /Target page, context or browser has been closed|Target closed|browser has been closed|Session closed|توسط کاربر متوقف/i.test(raw)
        sessionData.status = closedByUser ? 'cancelled' : 'error'
        sessionData.error = closedByUser ? 'توسط کاربر متوقف شد' : friendlyLoginError(e)
        addStep(accountId, closedByUser ? 'توسط کاربر متوقف شد' : `خطا: ${sessionData.error}`, closedByUser ? 'info' : 'error')

        if (!closedByUser) {
          ensureDir(SCREENSHOT_DIR)
          const ep = path.join(SCREENSHOT_DIR, `error-${accountId}-${Date.now()}.png`)
          try {
            if (sessionData.page && !sessionData.page.isClosed()) await sessionData.page.screenshot({ path: ep, fullPage: true })
            sessionData.screenshotPath = ep
          } catch {}
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastError: sessionData.error } })
        }
        if (sessionData.browser) await sessionData.browser.close().catch(() => {})
        finishSession(accountId, sessionData)
      }
    })()

    return NextResponse.json({
      success: true,
      sessionId: accountId,
      message: 'مرورگر باز شد. منتظر ورود کاربر...',
      steps: sessionData.steps,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })

    const session = sessions.get(accountId) || finishedSessions.get(accountId)
    if (!session) return NextResponse.json({ status: 'not_found', steps: [] })

    return NextResponse.json({
      status: session.status,
      steps: session.steps,
      screenshotPath: session.screenshotPath,
      error: session.error,
      lastCheck: session.lastCheck,
      elapsed: Math.floor((Date.now() - session.startedAt) / 1000),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
