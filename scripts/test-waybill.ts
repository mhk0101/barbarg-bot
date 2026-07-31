import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { WaybillFlow } from '../src/automation/waybill/WaybillFlow'
import type { WaybillData } from '../src/automation/interfaces'

/**
 * تست مرحله‌به‌مرحله‌ی فرم باربرگ روی سایت واقعی (قابل‌مشاهده).
 *
 * پیش‌نیاز: یک نشست معتبر ذخیره شده باشد (automation-data/sessions/default.json).
 *   اگر منقضی شده:  npm run login
 *
 * داده‌ی تست: از فایل automation-data/test-waybill.json خوانده می‌شود؛ اگر نبود،
 * یک قالب نمونه ساخته می‌شود که باید با «خودرو/راننده‌ی واقعاً ثبت‌شده در حسابت» پرش کنی.
 *
 * اجرا (فقط پر کردن، بدون ثبت نهایی):
 *   npx tsx scripts/test-waybill.ts
 * اجرا همراه با ثبت نهایی واقعی:
 *   npx tsx scripts/test-waybill.ts --submit
 *
 * خروجی: بعد از هر مرحله ✅/❌ در ترمینال + اسکرین‌شات در diagnostics/step-*.png
 */

const SESSION = path.join(process.cwd(), 'automation-data', 'sessions', 'default.json')
const DATA_FILE = path.join(process.cwd(), 'automation-data', 'test-waybill.json')
const OUT = path.join(process.cwd(), 'diagnostics')
const DO_SUBMIT = process.argv.includes('--submit')

const SAMPLE: WaybillData = {
  senderFirstName: 'نمونه', senderLastName: 'فرستنده', senderMobile: '09120000000', senderNationalId: '0000000000',
  receiverFirstName: 'نمونه', receiverLastName: 'گیرنده', receiverMobile: '09120000001', receiverNationalId: '1111111111',
  // ⚠️ این‌ها باید با خودرو و راننده‌ی «واقعاً ثبت‌شده در حساب» مطابقت داشته باشند:
  plateNumber: '12ب34567', driverName: 'نام راننده ثبت‌شده', driverNationalId: '2222222222',
  cargoName: 'بار نمونه', cargoWeight: '1000',
  freightCost: '1000000',
}

function loadData(): WaybillData {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as WaybillData
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(SAMPLE, null, 2), 'utf-8')
  console.log(`ℹ️  فایل داده‌ی تست ساخته شد: ${DATA_FILE}`)
  console.log('   لطفاً plateNumber و driverName/driverNationalId را با یک خودرو/راننده‌ی واقعاً ثبت‌شده جایگزین کن و دوباره اجرا کن.\n')
  return SAMPLE
}

async function main() {
  if (!fs.existsSync(SESSION)) {
    console.error('❌ نشست یافت نشد. اول لاگین کن:  npm run login')
    process.exit(1)
  }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const data = loadData()

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ storageState: SESSION })
  const page = await ctx.newPage()

  const flow = new WaybillFlow(page, 'test')

  console.log('🚀 باز کردن فرم باربرگ...')
  const navigated = await flow.navigateToCreate()
  console.log(navigated ? '✅ مرحله ۰: باز کردن فرم — موفق' : '❌ مرحله ۰: باز کردن فرم — ناموفق (نشست منقضی؟)')
  if (!navigated) { await browser.close(); process.exit(1) }
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
    console.log('\n⛔ فرم کامل پر نشد. آخرین اسکرین‌شات بالا محل توقف را نشان می‌دهد.')
    console.log('   (مرورگر باز می‌ماند تا خودت هم نگاه کنی؛ برای بستن Ctrl+C بزن.)')
    return
  }

  console.log('\n✅ همه‌ی مراحل پر شدند.')

  // کپچا
  const captcha = await flow.handleCaptcha()
  console.log(captcha.needsManual ? '⚠️  کپچا نیاز به حل دستی دارد' : '✅ کپچا حل شد')

  if (!DO_SUBMIT) {
    console.log('\nℹ️  حالت آزمایشی: ثبت نهایی انجام نشد (بدون --submit).')
    console.log('   فرم پرشده در مرورگر باز است تا بازبینی کنی. برای بستن Ctrl+C بزن.')
    return
  }

  console.log('\n📨 ارسال فرم (ثبت نهایی واقعی)...')
  const result = await flow.submit()
  console.log(`نتیجه: [${result.resultType}] ${result.resultMessage}`)
  if (result.trackingCode) console.log(`کد رهگیری: ${result.trackingCode}`)
}

main().catch((e) => {
  console.error('❌ خطا:', e instanceof Error ? e.message : e)
  process.exit(1)
})
