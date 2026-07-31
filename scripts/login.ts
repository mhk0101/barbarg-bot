import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')

async function manualLogin() {
  console.log('Opening browser for manual login...')
  console.log('Please log in to https://barname.utcms.ir/Barname/Account/Login')
  console.log('After successful login, the session will be saved automatically.')

  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  })
  const context = await browser.newContext({
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  // مخفی‌کردن navigator.webdriver تا سایت مرورگر را «خودکار» تشخیص ندهد (کپچا/لودینگ درست لود شود)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await context.newPage()

  await page.goto('https://barname.utcms.ir/Barname/Account/Login')
  console.log('Browser opened. Please log in manually.')

  try {
    await page.waitForFunction(() => {
      return !window.location.pathname.includes('Login')
    }, { timeout: 300000 })

    console.log('Login successful! Saving session...')
    const statePath = path.join(SESSION_DIR, 'default.json')
    await context.storageState({ path: statePath })
    console.log(`Session saved to: ${statePath}`)
  } catch {
    console.log('Login timed out or failed.')
  } finally {
    await browser.close()
  }
}

manualLogin().catch(console.error)
