import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import { captureFormState } from '../src/automation/waybill/captureFormState'

/**
 * ابزار تشخیصی همه‌ی مراحل فرم باربرگ.
 *
 * پیش‌نیاز: یک بار لاگین کن تا session ذخیره شود:
 *   npx tsx scripts/login.ts
 *
 * اجرا:
 *   npm run diagnose:waybill
 *
 * مرورگر به‌صورت قابل‌مشاهده باز می‌شود، مرحله‌ی اول خودکار عکس‌برداری می‌شود.
 * سپس در خود مرورگر فرم را پر کن و روی «بعدی» بزن؛ هر بار که به مرحله‌ی جدید رسیدی،
 * در همین ترمینال نام مرحله را تایپ کن و Enter بزن تا snapshot گرفته شود.
 * برای پایان، خالی بگذار و Enter بزن (یا exit تایپ کن).
 *
 * خروجی‌ها در پوشه‌ی diagnostics/ ساخته می‌شوند (png + html + json).
 */

const SITE_URL = 'https://barname.utcms.ir'
const SESSION = path.join(process.cwd(), 'automation-data', 'sessions', 'default.json')
const FORM_URLS = [
  `${SITE_URL}/Barname/Waybill/Create`,
  `${SITE_URL}/Barname/Waybill/New`,
  `${SITE_URL}/Barname/Waybill`,
]

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()) }))
}

async function dismissLoadingOverlay(page: import('playwright').Page): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('loading')
      if (!el) return true
      const s = getComputedStyle(el)
      return s.display === 'none' || s.visibility === 'hidden' || el.offsetParent === null
    }, { timeout: 12000 })
  } catch {
    await page.evaluate(() => {
      const el = document.getElementById('loading')
      if (el) el.remove()
    })
  }
  await page.waitForTimeout(800)
}

async function main() {
  if (!fs.existsSync(SESSION)) {
    console.error('❌ session یافت نشد. اول لاگین کن:  npx tsx scripts/login.ts')
    process.exit(1)
  }

  console.log('🚀 باز کردن مرورگر...')
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ storageState: SESSION })
  const page = await ctx.newPage()

  let opened = false
  for (const url of FORM_URLS) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await dismissLoadingOverlay(page)
      if (!page.url().includes('Login')) { opened = true; break }
    } catch { continue }
  }

  if (!opened) {
    console.error('❌ فرم باز نشد یا session منقضی شده. دوباره لاگین کن:  npx tsx scripts/login.ts')
    await browser.close()
    process.exit(1)
  }

  console.log('✅ فرم باز شد. عکس‌برداری از مرحله‌ی اول...')
  let i = 1
  await captureFormState(page, `${String(i).padStart(2, '0')}-step`)
  i++

  console.log('\n────────────────────────────────────────────────────────')
  console.log('حالا در مرورگر فرم را پر کن و روی «بعدی» بزن.')
  console.log('در هر مرحله‌ی جدید، نام مرحله را اینجا تایپ کن و Enter بزن (مثلاً: vehicle-driver).')
  console.log('برای پایان: خالی بگذار و Enter بزن.')
  console.log('────────────────────────────────────────────────────────')

  while (true) {
    const name = await ask(`\n[snapshot ${i}] نام مرحله (خالی = خروج): `)
    if (!name || name.toLowerCase() === 'exit') break
    const label = `${String(i).padStart(2, '0')}-${name.replace(/\s+/g, '-')}`
    try {
      await dismissLoadingOverlay(page)
      await captureFormState(page, label)
    } catch (e) {
      console.error('⚠️ خطا در عکس‌برداری:', e instanceof Error ? e.message : e)
    }
    i++
  }

  console.log('\n✅ تمام. خروجی‌ها در پوشه‌ی diagnostics/ هستند. فایل‌های .json را برایم بفرست.')
  await browser.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ خطا:', e)
  process.exit(1)
})
