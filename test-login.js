/**
 * test-login.js — تست مستقل «ورود تازه + حل خودکار کپچا»
 *
 * فقط برای تست است و چیزی را در دیتابیس تغییر نمی‌دهد.
 *
 * اجرا:
 *     node test-login.js 0012345678 myPassword
 *
 * یا بدون آرگومان (از دیتابیس اولین حساب فعال را می‌خواند):
 *     node test-login.js
 */

const path = require('path')
const fs = require('fs')

const SITE = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE}/Barname/Account/Login`
const TARGET_URL = `${SITE}/barname/Document/HagigiHogugi`
const OUT = path.join(process.cwd(), 'diagnostics')

function solveMath(text) {
  const cleaned = String(text).replace(/\s+/g, '').trim()
  const m = cleaned.match(/(-?\d+)\s*([+\-*/÷×])\s*(-?\d+)/)
  if (!m) return null
  const a = parseInt(m[1]), op = m[2], b = parseInt(m[3])
  switch (op) {
    case '+': return String(a + b)
    case '-': return String(a - b)
    case '*': case '×': return String(a * b)
    case '/': case '÷': return b !== 0 ? String(Math.round(a / b)) : null
  }
  return null
}

async function getCredsFromDb() {
  try {
    require('dotenv').config()
    const { PrismaClient } = require('@prisma/client')
    const { PrismaPg } = require('@prisma/adapter-pg')
    const crypto = require('crypto')
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
    const acc = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
    await prisma.$disconnect()
    if (!acc) return null
    const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
    const key = crypto.createHash('sha256').update(SECRET).digest()
    const [ivHex, data] = acc.passwordEncrypted.split(':')
    const dec = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
    let pw = dec.update(data, 'hex', 'utf8'); pw += dec.final('utf8')
    return { username: acc.username, password: pw, name: acc.accountName }
  } catch (e) {
    console.log('   (خواندن از دیتابیس ممکن نشد: ' + e.message + ')')
    return null
  }
}

async function main() {
  let username = process.argv[2]
  let password = process.argv[3]

  if (!username || !password) {
    console.log('→ خواندن حساب از دیتابیس...')
    const c = await getCredsFromDb()
    if (!c) {
      console.error('❌ حسابی پیدا نشد. استفاده:  node test-login.js <کدملی> <رمز>')
      process.exit(1)
    }
    username = c.username; password = c.password
    console.log(`   حساب: ${c.name} (${username})`)
  }

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const { chromium } = require('playwright')
  console.log('\n🚀 باز کردن مرورگر...')
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ viewport: null, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  const page = await ctx.newPage()

  console.log('→ رفتن به صفحه ورود...')
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => { const l = document.getElementById('loading'); if (l) l.remove() }).catch(() => {})

  console.log('→ پر کردن کد ملی و رمز...')
  const u = await page.$('#NationalCode, input[name="NationalCode"]')
  const p = await page.$('#user-password, input[type="password"]')
  if (!u || !p) { console.error('❌ فیلدهای ورود پیدا نشد'); await browser.close(); process.exit(1) }
  await u.fill(username)
  await p.fill(password)

  const MAX = 5
  let ok = false

  for (let i = 1; i <= MAX; i++) {
    console.log(`\n── تلاش ${i}/${MAX} ──`)
    const img = await page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha"]')
    if (!img) { console.error('❌ تصویر کپچا پیدا نشد'); break }

    const buf = await img.screenshot()
    fs.writeFileSync(path.join(OUT, `captcha-${i}.png`), buf)

    let raw = ''
    try {
      const T = require('tesseract.js')
      const r = await T.recognize(buf, 'eng', { logger: () => {} })
      raw = (r.data.text || '').trim()
      console.log(`   OCR خواند: "${raw.replace(/\n/g, ' ')}"  (اطمینان: ${Math.round(r.data.confidence)}%)`)
    } catch (e) {
      console.log('   ✖ خطای OCR: ' + e.message)
    }

    const ans = solveMath(raw)
    if (!ans) {
      console.log('   ✖ عبارت ریاضی تشخیص داده نشد → تازه‌سازی کپچا')
      const rb = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh"]')
      if (rb) await rb.click()
      await page.waitForTimeout(1800)
      continue
    }

    console.log(`   ✔ پاسخ محاسبه‌شده: ${ans}`)
    const ci = await page.$('#DNTCaptchaInputText')
    if (!ci) { console.error('❌ فیلد کپچا پیدا نشد'); break }
    await ci.fill(ans)
    await page.waitForTimeout(800)

    const btn = await page.$('#inter, button[type="submit"]')
    if (!btn) { console.error('❌ دکمه ورود پیدا نشد'); break }
    await btn.click()
    await page.waitForTimeout(4500)

    if (!page.url().includes('Login')) { ok = true; console.log('   ✅ ورود موفق!'); break }

    let msg = ''
    try {
      const e = await page.$('.alert-danger, .text-danger, .validation-summary-errors, [role="alert"]')
      if (e) msg = ((await e.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 160)
    } catch {}
    console.log('   ✖ هنوز در صفحه ورود' + (msg ? ` — پیام سایت: ${msg}` : ''))

    const rb = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh"]')
    if (rb) await rb.click()
    await page.waitForTimeout(1800)
    await (await page.$('#NationalCode, input[name="NationalCode"]'))?.fill(username).catch(() => {})
    await (await page.$('#user-password, input[type="password"]'))?.fill(password).catch(() => {})
  }

  if (!ok) {
    console.log('\n❌ ورود خودکار موفق نشد.')
    console.log('   عکس‌های کپچا در diagnostics/captcha-*.png ذخیره شد.')
    console.log('   می‌توانی همین حالا دستی وارد شوی؛ ۳ دقیقه صبر می‌کنم...')
    await page.waitForTimeout(180000)
  } else {
    console.log('\n→ رفتن به صفحه عملیات...')
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2500)
    await page.evaluate(() => { const l = document.getElementById('loading'); if (l) l.remove() }).catch(() => {})
    console.log('   URL نهایی: ' + page.url())

    if (page.url().includes('Login')) {
      console.log('   ⚠ به صفحه ورود برگشتیم — سشن پذیرفته نشد.')
    } else {
      console.log('   ✅ صفحه عملیات باز شد.')
      await page.screenshot({ path: path.join(OUT, 'target-page.png'), fullPage: true })
      fs.writeFileSync(path.join(OUT, 'target-page.html'), await page.content(), 'utf-8')

      const info = await page.evaluate(() => {
        const vis = (el) => {
          const s = getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden') return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const out = []
        document.querySelectorAll('input,select,textarea,button,[role=combobox]').forEach((el) => {
          out.push({
            tag: el.tagName.toLowerCase(), type: el.type || undefined,
            id: el.id || undefined, name: el.name || undefined,
            placeholder: el.placeholder || undefined,
            text: (el.innerText || '').trim().slice(0, 40) || undefined,
            visible: vis(el),
            options: el.options ? Array.from(el.options).slice(0, 20).map((o) => o.text.trim()) : undefined,
          })
        })
        return { url: location.href, title: document.title, fields: out }
      })
      fs.writeFileSync(path.join(OUT, 'target-page.json'), JSON.stringify(info, null, 2), 'utf-8')

      const v = info.fields.filter((f) => f.visible)
      console.log(`\n   عنوان صفحه: ${info.title}`)
      console.log(`   ${info.fields.length} فیلد (${v.length} قابل مشاهده):`)
      v.slice(0, 25).forEach((f) => {
        console.log(`     - ${f.id ? '#' + f.id : (f.name ? '[' + f.name + ']' : f.tag)}  ${f.text || f.placeholder || ''}`)
      })
      console.log('\n   📁 diagnostics/target-page.{png,html,json} ذخیره شد.')
    }
    console.log('\n   مرورگر ۲ دقیقه باز می‌ماند...')
    await page.waitForTimeout(120000)
  }

  await browser.close().catch(() => {})
}

main().catch((e) => { console.error('خطا:', e); process.exit(1) })
