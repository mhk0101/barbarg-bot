import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { WaybillFlow } from '../src/automation/waybill/WaybillFlow'
import type { WaybillData } from '../src/automation/interfaces'

/**
 * اجرای «نیمه‌دستی»: خودت داخل مرورگر لاگین می‌کنی و کپچا را حل می‌کنی،
 * بعد همان مرورگر (بدون بسته‌شدن) می‌رود سراغ فرم باربرگ و مرحله‌به‌مرحله پرش می‌کند
 * تا ببینی کدام مرحله درست کار می‌کند. نشست هم ذخیره می‌شود.
 *
 * اجرا (بدون ثبت نهایی):
 *   npx tsx scripts/manual-run.ts
 * همراه با ثبت نهایی واقعی:
 *   npx tsx scripts/manual-run.ts --submit
 *
 * داده‌ی تست از automation-data/test-waybill.json خوانده می‌شود
 * (plateNumber و driverName/driverNationalId باید واقعاً در حسابت ثبت شده باشند).
 */

const LOGIN_URL = 'https://barname.utcms.ir/Barname/Account/Login'
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const SESSION = path.join(SESSION_DIR, 'default.json')
const DATA_FILE = path.join(process.cwd(), 'automation-data', 'test-waybill.json')
const OUT = path.join(process.cwd(), 'diagnostics')
const DO_SUBMIT = process.argv.includes('--submit')

function loadData(): WaybillData {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ فایل داده یافت نشد: ${DATA_FILE}\n   یک‌بار npm run test:waybill بزن تا قالبش ساخته شود، سپس پرش کن.`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as WaybillData
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
  const data = loadData()

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
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await context.newPage()

  console.log('🌐 باز کردن صفحه‌ی ورود... خودت لاگین کن و کپچا را حل کن.')
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })

  console.log('⏳ منتظر تکمیل ورود توسط تو هستم (تا ۵ دقیقه)...')
  try {
    await page.waitForFunction(() => !window.location.pathname.includes('Login'), { timeout: 300000 })
  } catch {
    console.error('❌ ورود در زمان مقرر انجام نشد. دوباره اجرا کن.')
    await browser.close()
    process.exit(1)
  }

  console.log('✅ ورود موفق. ذخیره‌ی نشست...')
  await context.storageState({ path: SESSION })
  console.log(`   نشست ذخیره شد: ${SESSION}`)

  const flow = new WaybillFlow(page, 'manual')

  console.log('\n🚀 باز کردن فرم باربرگ...')
  const navigated = await flow.navigateToCreate()
  if (!navigated) {
    console.error('❌ باز کردن فرم ناموفق بود.')
    console.log('   مرورگر باز می‌ماند تا خودت بررسی کنی. برای بستن Ctrl+C بزن.')
    return
  }
  console.log('✅ مرحله ۰: باز کردن فرم — موفق')
  await page.screenshot({ path: path.join(OUT, 'step-0-open.png'), fullPage: true })

  let n = 1
  const filled = await flow.fillForm(data, {
    onStep: async (name, ok, error) => {
      const file = path.join(OUT, `step-${n}-${name.replace(/[/\s]+/g, '-')}.png`)
      try { await page.screenshot({ path: file, fullPage: true }) } catch {}
      if (ok) console.log(`✅ مرحله ${n}: ${name} — موفق`)
      else console.log(`❌ مرحله ${n}: ${name} — ناموفق: ${error instanceof Error ? error.message : error}`)
      console.log(`   📸 ${file}`)
      n++
    },
  })

  if (!filled) {
    console.log('\n⛔ فرم کامل پر نشد. اسکرین‌شات آخر محل توقف را نشان می‌دهد.')
    console.log('   مرورگر باز می‌ماند. برای بستن Ctrl+C بزن.')
    return
  }
  console.log('\n✅ همه‌ی مراحل پر شدند.')

  const captcha = await flow.handleCaptcha()
  console.log(captcha.needsManual ? '⚠️  کپچا نیاز به حل دستی دارد (در مرورگر حلش کن)' : '✅ کپچا حل شد')

  if (!DO_SUBMIT) {
    console.log('\nℹ️  حالت آزمایشی: ثبت نهایی انجام نشد. فرم در مرورگر باز است تا بازبینی کنی. Ctrl+C برای بستن.')
    return
  }

  console.log('\n📨 ثبت نهایی...')
  const result = await flow.submit()
  console.log(`نتیجه: [${result.resultType}] ${result.resultMessage}`)
  if (result.trackingCode) console.log(`کد رهگیری: ${result.trackingCode}`)
}

main().catch((e) => {
  console.error('❌ خطا:', e instanceof Error ? e.message : e)
  process.exit(1)
})
