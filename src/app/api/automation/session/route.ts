import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { browserManager } from '@/automation/browser/BrowserManager'
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_workers')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()

    if (body.action === 'start-login') {
      const accountId = body.accountId || 'default'
      const browser = await chromium.launch({ headless: false, channel: 'chrome' })
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto('https://barname.utcms.ir/Barname/Account/Login')

      await page.waitForFunction(() => {
        return document.querySelector('#inter') === null || window.location.pathname !== '/Barname/Account/Login'
      }, { timeout: 300000 }).catch(() => {})

      await page.waitForTimeout(3000)

      if (!page.url().includes('Login')) {
        const statePath = path.join(SESSION_DIR, `${accountId}.json`)
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
        await context.storageState({ path: statePath })
        await browser.close()
        return NextResponse.json({ success: true, message: 'نشست ذخیره شد' })
      }

      await browser.close()
      return NextResponse.json({ error: 'ورود انجام نشد' }, { status: 400 })
    }

    return NextResponse.json({ error: 'عملیت نامعتبر' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_workers')
  if (!guard.ok) return guard.response
  try {
    if (!fs.existsSync(SESSION_DIR)) return NextResponse.json({ sessions: [] })
    const files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.json'))
    const sessions = files.map((f) => ({
      accountId: f.replace('.json', ''),
      lastModified: fs.statSync(path.join(SESSION_DIR, f)).mtime.toISOString(),
    }))
    return NextResponse.json({ sessions })
  } catch {
    return NextResponse.json({ sessions: [] })
  }
}
