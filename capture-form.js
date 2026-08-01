/**
 * capture-form.js  —  ابزار مستقل عکس‌برداری از فرم
 *
 * هیچ فایلی از پروژه را تغییر نمی‌دهد. فقط می‌خواند:
 *     automation-data/sessions/default.json
 *
 * اجرا:  node capture-form.js
 *
 * مرورگر با نشست ذخیره‌شده باز می‌شود. خودت به هر صفحه‌ای که
 * می‌خواهی برو، بعد در همین ترمینال Enter بزن تا snapshot گرفته شود.
 * خروجی در پوشه‌ی diagnostics/ ذخیره می‌شود (png + html + json).
 */

const path = require('path')
const fs = require('fs')
const readline = require('readline')

const SITE = 'https://barname.utcms.ir'
const SESSION = path.join(process.cwd(), 'automation-data', 'sessions', 'default.json')
const OUT = path.join(process.cwd(), 'diagnostics')

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()) }))
}

async function killOverlay(page) {
  try {
    await page.evaluate(() => {
      const el = document.getElementById('loading')
      if (el) el.remove()
    })
  } catch {}
}

async function snapshot(page, label) {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const safe = label.replace(/[^\w\u0600-\u06FF-]+/g, '_')

  try {
    await page.screenshot({ path: path.join(OUT, `${safe}.png`), fullPage: true })
  } catch (e) {
    console.log('   (screenshot failed: ' + e.message + ')')
  }

  try {
    fs.writeFileSync(path.join(OUT, `${safe}.html`), await page.content(), 'utf-8')
  } catch (e) {
    console.log('   (html failed: ' + e.message + ')')
  }

  const data = await page.evaluate(() => {
    const vis = (el) => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const label = (el) => {
      if (el.id) {
        const l = document.querySelector(`label[for="${el.id}"]`)
        if (l) return l.innerText.trim().slice(0, 60)
      }
      let p = el.parentElement
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const l = p.querySelector('label')
        if (l) return l.innerText.trim().slice(0, 60)
      }
      return ''
    }
    const out = []
    document.querySelectorAll('input,select,textarea,button,a[role=button],[role=combobox]').forEach((el) => {
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || undefined,
        id: el.id || undefined,
        name: el.name || undefined,
        cls: (el.className && String(el.className).slice(0, 120)) || undefined,
        placeholder: el.placeholder || undefined,
        label: label(el) || undefined,
        text: (el.innerText || '').trim().slice(0, 50) || undefined,
        value: el.value || undefined,
        visible: vis(el),
        options: el.options ? Array.from(el.options).slice(0, 30).map((o) => o.text.trim()) : undefined,
      })
    })
    const step = document.querySelector('.active, .current, .wizard-step.active, li.active')
    return {
      url: location.href,
      title: document.title,
      activeStep: step ? step.innerText.trim().slice(0, 80) : '',
      fieldCount: out.length,
      fields: out,
    }
  })

  fs.writeFileSync(path.join(OUT, `${safe}.json`), JSON.stringify(data, null, 2), 'utf-8')

  const v = data.fields.filter((f) => f.visible)
  console.log(`   ✔ ${safe}  |  URL: ${data.url}`)
  console.log(`     ${data.fieldCount} field(s), ${v.length} visible`)
  v.slice(0, 15).forEach((f) => {
    const id = f.id ? '#' + f.id : (f.name ? '[' + f.name + ']' : f.tag)
    console.log(`       - ${id}  ${f.label ? '« ' + f.label + ' »' : ''} ${f.text || ''}`)
  })
  if (v.length > 15) console.log(`       ... and ${v.length - 15} more (see json)`)
}

async function main() {
  if (!fs.existsSync(SESSION)) {
    console.error('❌ نشست یافت نشد: automation-data/sessions/default.json')
    process.exit(1)
  }

  const { chromium } = require('playwright')
  console.log('🚀 باز کردن مرورگر با نشست ذخیره‌شده...')

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ storageState: SESSION, viewport: null })
  const page = await ctx.newPage()

  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
    console.log('⚠ خطا در باز کردن سایت: ' + e.message)
  })
  await page.waitForTimeout(2500)
  await killOverlay(page)

  const url = page.url()
  console.log('📍 آدرس فعلی: ' + url)
  if (url.includes('Login')) {
    console.log('⚠ نشست منقضی شده — در همین پنجره دستی لاگین کن، بعد ادامه بده.')
  } else {
    console.log('✅ با نشست وارد شدی.')
  }

  console.log('\n────────────────────────────────────────────────────────')
  console.log(' در مرورگر به صفحه‌ی «ثبت باربرگ» برو.')
  console.log(' هر وقت روی صفحه‌ای بودی که می‌خواهی ثبت شود:')
  console.log('   • یک اسم بنویس (مثلا: 01-فرستنده) و Enter')
  console.log('   • یا فقط Enter بزن تا با شماره‌ی خودکار ذخیره شود')
  console.log(' برای پایان بنویس: exit')
  console.log('────────────────────────────────────────────────────────\n')

  let i = 1
  while (true) {
    const ans = await ask(`[${i}] اسم مرحله (یا exit): `)
    if (ans.toLowerCase() === 'exit' || ans === 'q') break
    await killOverlay(page)
    const label = ans || `${String(i).padStart(2, '0')}-step`
    try {
      await snapshot(page, label)
      i++
    } catch (e) {
      console.log('   ✖ خطا: ' + e.message)
    }
    console.log('')
  }

  console.log('\n📁 خروجی‌ها در پوشه‌ی diagnostics/ ذخیره شد.')
  console.log('   کل پوشه را zip کن و بفرست.')
  await browser.close().catch(() => {})
}

main().catch((e) => { console.error('خطا:', e); process.exit(1) })
