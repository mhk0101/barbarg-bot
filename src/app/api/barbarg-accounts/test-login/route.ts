import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptPassword } from '@/lib/encryption'
import path from 'path'
import fs from 'fs'

const LOGIN_URL = 'https://barname.utcms.ir/Barname/Account/Login'
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const SCREENSHOT_DIR = path.join(process.cwd(), 'automation-data', 'screenshots')
const TIMEOUT_MS = 5 * 60 * 1000

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }

interface LoginSessionData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any
  accountId: string
  status: 'opening' | 'waiting_captcha' | 'login_success' | 'login_failed' | 'timeout' | 'error'
  steps: Array<{ step: string; time: string; status: 'info' | 'success' | 'error' }>
  screenshotPath: string | null
  error: string | null
  startedAt: number
  lastCheck: string | null
}

const sessions = new Map<string, LoginSessionData>()

function addStep(sessionId: string, step: string, status: 'info' | 'success' | 'error' = 'info') {
  const s = sessions.get(sessionId)
  if (s) s.steps.push({ step, time: new Date().toLocaleTimeString('fa-IR'), status })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, action } = body

    if (action === 'confirm') {
      const session = sessions.get(accountId)
      if (!session) return NextResponse.json({ error: 'نشستی یافت نشد' }, { status: 404 })

      try {
        if (session.page && !session.page.url().includes('Login')) {
          ensureDir(SESSION_DIR)
          if (session.context) await session.context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
          session.status = 'login_success'
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
      sessions.delete(accountId)
      return NextResponse.json({ status: session.status, steps: session.steps })
    }

    if (action === 'cancel') {
      const session = sessions.get(accountId)
      if (session) {
        addStep(accountId, 'لغو شده توسط کاربر', 'error')
        if (session.browser) await session.browser.close().catch(() => {})
        sessions.delete(accountId)
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

        addStep(accountId, 'رفتن به صفحه ورود...', 'info')
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(2000)

        if (!page.url().includes('Login')) {
          ensureDir(SESSION_DIR)
          await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
          await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
          sessionData.status = 'login_success'
          addStep(accountId, 'نشست فعال موجود — وارد شدید', 'success')
          await browser.close().catch(() => {})
          sessions.delete(accountId)
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

        const startTime = Date.now()
        while (Date.now() - startTime < TIMEOUT_MS) {
          await page.waitForTimeout(3000)
          try {
            if (!page.url().includes('Login')) {
              ensureDir(SESSION_DIR)
              await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
              await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastLogin: new Date(), lastError: null } })
              sessionData.status = 'login_success'
              addStep(accountId, 'ورود موفق — نشست ذخیره شد', 'success')
              await browser.close().catch(() => {})
              sessions.delete(accountId)
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

        sessionData.status = 'timeout'
        addStep(accountId, 'زمان تمام شد', 'error')
        ensureDir(SCREENSHOT_DIR)
        const tp = path.join(SCREENSHOT_DIR, `timeout-${accountId}-${Date.now()}.png`)
        await page.screenshot({ path: tp, fullPage: true })
        sessionData.screenshotPath = tp
        await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastError: 'زمان ورود تمام شد' } })
        await browser.close().catch(() => {})
        sessions.delete(accountId)
      } catch (e: unknown) {
        sessionData.status = 'error'
        sessionData.error = e instanceof Error ? e.message : 'خطا'
        addStep(accountId, `خطا: ${sessionData.error}`, 'error')
        ensureDir(SCREENSHOT_DIR)
        const ep = path.join(SCREENSHOT_DIR, `error-${accountId}-${Date.now()}.png`)
        try {
          if (sessionData.page) await sessionData.page.screenshot({ path: ep, fullPage: true })
          sessionData.screenshotPath = ep
        } catch {}
        await prisma.barBargAccount.update({ where: { id: accountId }, data: { lastError: sessionData.error } })
        if (sessionData.browser) await sessionData.browser.close().catch(() => {})
        sessions.delete(accountId)
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
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })

    const session = sessions.get(accountId)
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
