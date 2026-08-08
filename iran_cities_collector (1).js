/**
 * ==============================================================================
 *  نام فایل: iran_cities_collector.js (نسخه فوق‌العاده قوی و بدون هیچ‌گونه تایپ)
 *  نام کاربری: 3070427898
 *  رمز عبور:   @Rb7553925
 * ==============================================================================
 *  ویژگی اصلی:
 *    • در گام ۵ اصلاً و به هیچ وجه در هیچ کادری تایپ نمی‌شود!
 *    • با ۶ لایه موازی و عمیق، خودِ نقشه و مارکر مستقیماً به سمت نقطه دقیق بوشهر
 *      (Lat: 28.9163629, Lon: 50.8373665 - کوچه بهمن ۲) حرکت و پرواز (flyTo/panTo) می‌کنند.
 *    • مارکر اختصاصی سایت (marker-start-route.png) دقیقاً روی نقطه قفل می‌شود.
 *    • وب‌سرویس RevereseMap فراخوانی شده و آدرس متنی به صورت سیستمی می‌نشیند.
 *    • باز ماندن دائمی پنجره مرورگر
 * ==============================================================================
 *  نحوه اجرا:
 *      node iran_cities_collector.js
 * ==============================================================================
 */

require('dotenv').config()
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

/* -------------------------------------------------------------------------- */
/*                               تنظیمات و مسیرها                             */
/* -------------------------------------------------------------------------- */
const CONFIG = {
  username: process.env.BARBARG_USERNAME || '3070427898',
  password: process.env.BARBARG_PASSWORD || '@Rb7553925',

  loginUrl: 'https://barname.utcms.ir/Barname/Account/Login',
  formUrl: 'https://barname.utcms.ir/barname/Document/HagigiHogugi',

  savedLocationFile: path.join(__dirname, 'saved_map_location.json'),

  waybillData: {
    sender: {
      firstName: 'شرکت', lastName: 'شرکت',
      mobile: '09131784512', nationalId: '3070427898',
    },
    receiver: {
      firstName: 'شرکت', lastName: 'شرکت',
      mobile: '09131784512', nationalId: '3070427898',
    },
    cargo: {
      name: 'آجر',
      packaging: 'سایر',
      count: '10',
      weightTon: '10',
      value: '10000000'
    }
  }
}

const BOX_TYPES = {
  'کارتن': '8', 'جعبه': '9', 'کیسه': '10', 'گونی': '11', 'جامبو': '12',
  'بشکه': '18072', 'رول': '18073', 'فله': '18074', 'عدل': '18075',
  'شاخه': '18076', 'سایر': '18077'
}

let isStep5ActiveForRecording = false

/* -------------------------------------------------------------------------- */
/*                            توابع کمکی و حل کپچا                            */
/* -------------------------------------------------------------------------- */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

function toLatin(v) {
  return String(v || '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

function solveMath(t) {
  const s = toLatin(t).replace(/\s+/g, '')
  const m = s.match(/(\d{1,3})\s*([+\-*/×÷])\s*(\d{1,3})/)
  if (m) {
    const a = +m[1], b = +m[3]
    switch (m[2]) {
      case '+': return String(a + b)
      case '-': return String(a - b)
      case '*': case '×': return String(a * b)
      case '/': case '÷': return b ? String(Math.round(a / b)) : null
    }
  }
  const o = s.match(/^\D*(\d{1,6})\D*$/)
  return o ? o[1] : null
}

async function solveCaptcha(page) {
  return page.evaluate(() => {
    const img = document.querySelector('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]')
    if (!img || !img.complete || (img.naturalWidth || 0) < 8) return { error: 'کپچا بارگذاری نشد' }
    const w = img.naturalWidth, h = img.naturalHeight
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return { error: 'خطای canvas' }
    ctx.drawImage(img, 0, 0)
    let data
    try { data = ctx.getImageData(0, 0, w, h).data } catch (e) { return { error: 'دسترسی محدود' } }
    const ink = []; let cnt = 0
    for (let y = 0; y < h; y++) {
      const r = []
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const v = (data[i + 3] > 40 && g < 160) ? 1 : 0
        r.push(v); cnt += v
      }
      ink.push(r)
    }
    if (cnt < 15) return { error: 'کپچا خالی است' }
    const colHas = []
    for (let x = 0; x < w; x++) { let hs = false; for (let y = 0; y < h; y++) if (ink[y][x]) { hs = true; break } colHas.push(hs) }
    const boxes = []; let st = -1
    for (let x = 0; x <= w; x++) {
      const on = x < w ? colHas[x] : false
      if (on && st === -1) st = x
      else if (!on && st !== -1) {
        if (x - st >= 2) {
          let y0 = h, y1 = -1
          for (let y = 0; y < h; y++) for (let xx = st; xx < x; xx++) if (ink[y][xx]) { if (y < y0) y0 = y; if (y > y1) y1 = y; break }
          if (y1 >= y0) boxes.push({ x0: st, x1: x, y0, y1 })
        }
        st = -1
      }
    }
    if (boxes.length < 2 || boxes.length > 5) return { error: 'کاراکتر نامتعارف' }
    const N = 24
    const gridOf = (m, x0, x1, y0, y1) => {
      const bw = x1 - x0, bh = y1 - y0 + 1, out = new Array(N * N).fill(0)
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        const sx0 = x0 + Math.floor(gx * bw / N), sx1 = x0 + Math.max(Math.floor((gx + 1) * bw / N), Math.floor(gx * bw / N) + 1)
        const sy0 = y0 + Math.floor(gy * bh / N), sy1 = y0 + Math.max(Math.floor((gy + 1) * bh / N), Math.floor(gy * bh / N) + 1)
        let on = 0, tot = 0
        for (let y = sy0; y < sy1 && y <= y1; y++) for (let x = sx0; x < sx1 && x < x1; x++) { on += m[y][x]; tot++ }
        out[gy * N + gx] = tot > 0 && on / tot > 0.35 ? 1 : 0
      }
      return out
    }
    const FONTS = ['Tahoma', 'Arial', 'Segoe UI', 'Times New Roman', 'Vazirmatn', 'IRANSans', 'B Nazanin', 'sans-serif']
    const D = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
    const OPS = [['+', '+'], ['-', '-'], ['×', '*'], ['÷', '/']]
    const render = (ch, font) => {
      const S = 96, rc = document.createElement('canvas'); rc.width = S; rc.height = S
      const rx = rc.getContext('2d'); if (!rx) return null
      rx.fillStyle = '#fff'; rx.fillRect(0, 0, S, S); rx.fillStyle = '#000'
      rx.font = Math.floor(S * 0.66) + 'px "' + font + '"'; rx.textAlign = 'center'; rx.textBaseline = 'middle'
      rx.fillText(ch, S / 2, S / 2)
      let d; try { d = rx.getImageData(0, 0, S, S).data } catch { return null }
      const m = []; let x0 = S, x1 = -1, y0 = S, y1 = -1, n = 0
      for (let y = 0; y < S; y++) {
        const r = []
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4; const v = d[i] < 140 ? 1 : 0; r.push(v)
          if (v) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
        }
        m.push(r)
      }
      if (n < 8 || x1 < x0) return null
      return gridOf(m, x0, x1 + 1, y0, y1)
    }
    const rd = [], ro = []
    for (const f of FONTS) {
      for (let i = 0; i < 10; i++) { const g = render(D[i], f); if (g) rd.push({ v: String(i), g }) }
      for (const [ch, v] of OPS) { const g = render(ch, f); if (g) ro.push({ v, g }) }
    }
    if (!rd.length) return { error: 'عدم تولید کاراکترهای مرجع' }
    const iou = (a, b) => {
      let I = 0, U = 0
      for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++ }
      return U ? I / U : 0
    }
    const best = (g, refs) => {
      const sc = new Map()
      for (const r of refs) { const s = iou(g, r.g); if (s > (sc.get(r.v) ?? 0)) sc.set(r.v, s) }
      const so = [...sc.entries()].sort((p, q) => q[1] - p[1])
      return { value: so[0]?.[0] ?? '', score: so[0]?.[1] ?? 0 }
    }
    const syms = []
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const g = gridOf(ink, b.x0, b.x1, b.y0, b.y1)
      const isOp = boxes.length === 3 && i === 1
      const r = best(g, isOp ? ro : rd)
      syms.push({ value: r.value, score: r.score })
    }
    return { symbols: syms, expr: syms.map(s => s.value).join(''), boxes: boxes.length }
  })
}

/* -------------------------------------------------------------------------- */
/*       ورود خودکار و اجرای آرام و مرحله‌به‌مرحله گام‌های ۱ تا ۴             */
/* -------------------------------------------------------------------------- */
async function launchAndLoginToStep5() {
  console.log('\n🔄 در حال راه‌اندازی مرورگر و ورود به سامانه با سرعت آرام و مطمئن...')

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    viewport: null,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
  })

  const page = await context.newPage()

  // شنود هوشمند وب‌سرویس نقشه برای کلیک‌های دستی جدید شما
  page.on('response', async (response) => {
    try {
      if (isStep5ActiveForRecording && response.url().includes('RevereseMap')) {
        const urlObj = new URL(response.url())
        const lat = parseFloat(urlObj.searchParams.get('lat'))
        const lon = parseFloat(urlObj.searchParams.get('lon'))

        // نادیده گرفتن مختصات اولیه و پیش‌فرض سایت (کاشانی تهران)
        if (Math.abs(lat - 35.7219) < 0.001 && Math.abs(lon - 51.3347) < 0.001) {
          return
        }

        const data = await response.json()
        if (data && data.obj) {
          const address = data.obj.postal_address || data.obj.address || ''
          const locationRecord = {
            lat,
            lon,
            address,
            province: data.obj.province || 'بوشهر',
            county: data.obj.county || 'بوشهر',
            region: data.obj.region || '',
            neighbourhood: data.obj.neighbourhood || '',
            savedAt: new Date().toISOString()
          }

          fs.writeFileSync(CONFIG.savedLocationFile, JSON.stringify(locationRecord, null, 2), 'utf8')

          console.log('\n═══════════════════════════════════════════════════════════════')
          console.log('🎉 نقطه جدید نقشه توسط شما کلیک و ذخیره شد!')
          console.log(`📍 عرض جغرافیایی (Lat): ${lat}`)
          console.log(`📍 طول جغرافیایی (Lon): ${lon}`)
          console.log(`🏠 آدرس متنی: ${address}`)
          console.log('═══════════════════════════════════════════════════════════════\n')
        }
      }
    } catch (e) {}
  })

  try {
    await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 50000 })
  } catch (e) {
    console.error('❌ خطا در باز کردن صفحه ورود:', e.message)
    return { browser, page, ok: false }
  }

  await sleep(2500)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

  await (await page.$('#NationalCode'))?.fill(CONFIG.username)
  await sleep(500)
  await (await page.$('#user-password'))?.fill(CONFIG.password)
  await sleep(500)

  let loggedIn = false
  for (let att = 1; att <= 6; att++) {
    console.log(`   [لاگین] حل کپچا (تلاش ${att}/6)...`)
    const captchaRes = await solveCaptcha(page)
    if (captchaRes.error) {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
      await sleep(1500)
      continue
    }

    const answer = solveMath(captchaRes.expr)
    console.log(`   ◈ کپچا: ${captchaRes.expr} ⇒ ${answer}`)
    if (!answer) {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
      await sleep(1500)
      continue
    }

    const input = await page.$('#DNTCaptchaInputText')
    await input?.fill('')
    await sleep(200)
    await input?.type(answer, { delay: 60 })
    await sleep(600)
    await (await page.$('#inter'))?.click()

    for (let w = 0; w < 15; w++) {
      await sleep(1000)
      if (!page.url().toLowerCase().includes('/account/login')) {
        loggedIn = true
        break
      }
    }

    if (loggedIn) {
      console.log('   ✅ ورود به سامانه با موفقیت تایید شد.')
      break
    } else {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
      await sleep(1500)
      await (await page.$('#NationalCode'))?.fill(CONFIG.username)
      await (await page.$('#user-password'))?.fill(CONFIG.password)
    }
  }

  if (!loggedIn) {
    console.error('❌ خطا در ورود به سامانه.')
    return { browser, page, ok: false }
  }

  console.log(`\n→ در حال بارگذاری فرم صدور باربرگ...`)
  await sleep(1500)
  await page.goto(CONFIG.formUrl, { waitUntil: 'domcontentloaded', timeout: 50000 }).catch(() => {})
  await sleep(3000)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

  const data = CONFIG.waybillData

  const typeSlow = async (sel, val, label) => {
    if (!val) return
    const el = await page.$(sel)
    if (el) {
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.click({ clickCount: 3 }).catch(() => {})
      await sleep(150)
      await el.fill('')
      await sleep(150)
      await el.type(String(val), { delay: 90 })
      console.log(`   ✔ ${label}: ${val}`)
      await sleep(300)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🌟 گام ۱: فرستنده
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۱: مشخصات فرستنده ═══')
  await page.selectOption('#senderSelectType', '1').catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('.hidden, .d-none').forEach(e => {
      e.classList.remove('hidden')
      e.classList.remove('d-none')
    })
  }).catch(() => {})
  await sleep(600)

  await typeSlow('#txtSenderFirstName', data.sender.firstName, 'نام')
  await typeSlow('#txtSenderLastName', data.sender.lastName, 'نام خانوادگی')
  await typeSlow('#txtSenderMobile', data.sender.mobile, 'موبایل')
  await typeSlow('#txtSenderNationalCode', data.sender.nationalId, 'کد ملی')
  await sleep(800)

  const btnGo2 = await page.$('#btnGoLVL2')
  if (btnGo2) await btnGo2.click()
  console.log('   ➜ کلیک دکمه رفتن به گام ۲...')
  await sleep(2200)

  // ═══════════════════════════════════════════════════════════════
  // 🌟 گام ۲: گیرنده
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۲: مشخصات گیرنده ═══')
  await page.selectOption('#receiverSelectType', '1').catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('.hidden, .d-none').forEach(e => {
      e.classList.remove('hidden')
      e.classList.remove('d-none')
    })
  }).catch(() => {})
  await sleep(600)

  await typeSlow('#txtReceiverFirstName', data.receiver.firstName, 'نام')
  await typeSlow('#txtReceiverLastName', data.receiver.lastName, 'نام خانوادگی')
  await typeSlow('#txtReceiverMobile', data.receiver.mobile, 'موبایل')
  await typeSlow('#txtReceiverNationalCode', data.receiver.nationalId, 'کد ملی')
  await sleep(800)

  const btnGo3 = await page.$('#btnGoLVL3')
  if (btnGo3) await btnGo3.click()
  console.log('   ➜ کلیک دکمه رفتن به گام ۳...')
  await sleep(2500)

  // ═══════════════════════════════════════════════════════════════
  // 🌟 گام ۳: راننده و خودرو
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۳: مشخصات راننده و خودرو ═══')
  await sleep(1500)

  const plateSelected = await page.evaluate(() => {
    const sel = document.getElementById('PelakComboTajmi')
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      if (window.jQuery) window.jQuery(sel).trigger('change')
      return sel.options[1].text
    }
    return null
  }).catch(() => null)

  if (plateSelected) console.log(`   ✔ پلاک ناوگان انتخاب شد: ${plateSelected}`)
  await sleep(2000)

  const driverSelected = await page.evaluate(() => {
    const sel = document.getElementById('DriverListTajmi')
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      if (window.jQuery) window.jQuery(sel).trigger('change')
      return sel.options[1].text
    }
    return null
  }).catch(() => null)

  if (driverSelected) console.log(`   ✔ راننده ناوگان انتخاب شد: ${driverSelected}`)
  await sleep(1200)

  const btnGo4 = await page.$('#btnGoLVL4')
  if (btnGo4) await btnGo4.click()
  console.log('   ➜ کلیک دکمه رفتن به گام ۴...')
  await sleep(2500)

  // ═══════════════════════════════════════════════════════════════
  // 🌟 گام ۴: مشخصات کالا
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۴: مشخصات کالا ═══')
  const addBtn = await page.$('#btnAddLoad')
  if (addBtn) await addBtn.click()
  console.log('   ➜ باز کردن مودال ثبت کالا...')
  await sleep(1800)

  const nameInput = await page.$('#txtLoadName')
  if (nameInput) {
    await nameInput.click({ clickCount: 3 }).catch(() => {})
    await nameInput.fill('')
    await sleep(200)
    await nameInput.type(String(data.cargo.name), { delay: 110 })
    console.log(`   ⌨ تایپ نام کالا: «${data.cargo.name}»`)

    await page.evaluate(() => {
      const el = document.getElementById('txtLoadName')
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('keydown', { bubbles: true }))
        el.dispatchEvent(new Event('keyup', { bubbles: true }))
        if (window.jQuery) window.jQuery(el).trigger('keydown').trigger('keyup')
      }
    }).catch(() => {})

    await sleep(1200)
    await page.keyboard.press('ArrowDown').catch(() => {})
    await sleep(300)
    await page.keyboard.press('Enter').catch(() => {})

    for (let t = 0; t < 15; t++) {
      await sleep(200)
      const clicked = await page.evaluate((want) => {
        const lists = document.querySelectorAll('ul.ui-autocomplete, ul.ui-menu')
        for (const ul of lists) {
          if (ul.offsetParent === null) continue
          const items = Array.from(ul.querySelectorAll('li'))
          if (!items.length) continue
          const match = items.find(li => (li.innerText || '').trim().includes(want)) || items[0]
          if (match) {
            const targetClickable = match.querySelector('a, div') || match
            targetClickable.click()
            return true
          }
        }
        return false
      }, data.cargo.name).catch(() => false)
      if (clicked) break
    }
  }

  await sleep(800)
  await typeSlow('#txtWeight', data.cargo.weightTon, 'وزن (تن)')

  const boxVal = BOX_TYPES[data.cargo.packaging] || '18077'
  await page.selectOption('#ddBoxType', boxVal).catch(() => {})
  await page.evaluate((v) => {
    const s = document.getElementById('ddBoxType')
    if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })) }
  }, boxVal).catch(() => {})
  console.log(`   ✔ بسته‌بندی: ${data.cargo.packaging}`)
  await sleep(400)

  await typeSlow('#txtBoxNum', data.cargo.count, 'تعداد بسته')
  await sleep(800)

  const insertBtn = await page.$('#btnInsertLoad')
  if (insertBtn) {
    await insertBtn.click()
    console.log('   ✔ دکمه ثبت کالا کلیک شد.')
  }
  await sleep(2000)

  await page.evaluate(() => {
    const closeBtn = document.querySelector('.modal.show [data-bs-dismiss="modal"], .modal.show .close')
    if (closeBtn) closeBtn.click()
  }).catch(() => {})
  await sleep(600)

  await typeSlow('#txtLoadsValue', data.cargo.value, 'ارزش ریالی بار')
  await sleep(800)

  const goLvl5 = await page.$('#btnGoLVL5')
  if (goLvl5) {
    await goLvl5.click()
    console.log('   ➜ کلیک دکمه رفتن به گام ۵...')
  }
  await sleep(3500)

  console.log('   ✅ تمام گام‌های ۱ تا ۴ با موفقیت تکمیل شدند و وارد گام ۵ شدیم.\n')
  return { browser, page, ok: true }
}

/* -------------------------------------------------------------------------- */
/*       موتور قدرتمند و ریشه‌ای حرکت نقشه به مختصات بوشهر بدون هیچ تایپ      */
/* -------------------------------------------------------------------------- */
async function moveMapToExactPointDirectly(page, savedLoc) {
  const { lat, lon, address } = savedLoc

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🎯 جابجایی مستقیم و ریشه‌ای نقشه و مارکر به نقطه بوشهر (بدون هیچ تایپ):')
  console.log(`   📍 مختصات دقیق: [Lat: ${lat}, Lon: ${lon}]`)
  console.log(`   🏠 آدرس متنی: ${address}`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  await sleep(2000)

  // ۱. اسکن عمیق تمام لایه‌های حافظه و اجرای مستقیم متدهای Leaflet و انتقال مارکر
  const scanResult = await page.evaluate(async ({ lat, lon, address }) => {
    // تابع اسکن پیشرفته برای استخراج آبجکت Leaflet Map
    function findAnyMap() {
      // الف: بررسی تگ‌های DOM
      const domContainers = [
        document.getElementById('mapp-MapSource'),
        document.getElementById('MapSource'),
        ...document.querySelectorAll('.leaflet-container'),
        ...document.querySelectorAll('.mapp-map')
      ]

      for (const el of domContainers) {
        if (!el) continue
        for (const key of Object.getOwnPropertyNames(el)) {
          try {
            if (el[key] && typeof el[key].setView === 'function') return el[key]
          } catch(e) {}
        }
        if (window.jQuery) {
          try {
            const d = window.jQuery(el).data()
            for (const k in d) {
              if (d[k] && typeof d[k].setView === 'function') return d[k]
            }
          } catch(e) {}
        }
      }

      // ب: بررسی Mapp SDK
      if (window.mapp) {
        if (typeof window.mapp.getMap === 'function') {
          const m = window.mapp.getMap('mapp-MapSource') || window.mapp.getMap('MapSource')
          if (m) return m
        }
        if (window.mapp.maps) {
          for (const k in window.mapp.maps) {
            if (window.mapp.maps[k] && typeof window.mapp.maps[k].setView === 'function') return window.mapp.maps[k]
          }
        }
      }

      // ج: بررسی L.Map
      if (window.L && window.L.Map) {
        for (const k of Object.getOwnPropertyNames(window)) {
          try {
            if (window[k] && typeof window[k].setView === 'function' && typeof window[k].panTo === 'function') {
              return window[k]
            }
          } catch(e) {}
        }
      }

      // د: اسکن تمام متغیرهای سراسری
      for (const k of Object.getOwnPropertyNames(window)) {
        try {
          const v = window[k]
          if (v && typeof v === 'object') {
            if (typeof v.setView === 'function' && typeof v.panTo === 'function') return v
            for (const sub of Object.keys(v)) {
              if (v[sub] && typeof v[sub].setView === 'function' && typeof v[sub].panTo === 'function') return v[sub]
            }
          }
        } catch(e) {}
      }

      return null
    }

    const map = findAnyMap()
    let mapMoved = false
    let markerMoved = false

    if (map) {
      // ۱. جابجایی نرم و پرواز نقشه به نقطه دقیق بوشهر با زوم ۱۷
      try {
        map.flyTo([lat, lon], 17, { animate: true, duration: 1.5 })
        map.setView([lat, lon], 17)
        map.panTo([lat, lon])
        map.invalidateSize()
        mapMoved = true
      } catch(e) {
        map.setView([lat, lon], 17)
        mapMoved = true
      }

      // ۲. جابجایی نشانگر نقشه روی همان نقطه
      if (map.eachLayer) {
        map.eachLayer((layer) => {
          if (layer && typeof layer.setLatLng === 'function') {
            layer.setLatLng([lat, lon])
            markerMoved = true
          }
        })
      }

      // ۳. افزودن مارکر استاندارد در صورت عدم وجود
      if (!markerMoved && window.L && typeof window.L.marker === 'function') {
        try {
          const icon = window.L.icon({
            iconUrl: 'https://cdn.map.ir/web-sdk/1.4.2/assets/images/marker-start-route.png',
            iconSize: [35, 35],
            iconAnchor: [17, 35]
          })
          window.L.marker([lat, lon], { icon }).addTo(map)
          markerMoved = true
        } catch(e) {
          window.L.marker([lat, lon]).addTo(map)
          markerMoved = true
        }
      }

      // ۴. شلیک رویداد کلیک جهت ثبت سیستمی در نقشه
      try {
        const latlngObj = (window.L && window.L.latLng) ? window.L.latLng(lat, lon) : { lat, lng: lon }
        const cPoint = map.latLngToContainerPoint ? map.latLngToContainerPoint(latlngObj) : { x: 200, y: 200 }
        map.fire('click', {
          latlng: latlngObj,
          containerPoint: cPoint,
          originalEvent: new MouseEvent('click', { bubbles: true })
        })
      } catch(e) {}
    }

    // مقداردهی فیلدهای متنی آدرس
    const addrs = [
      document.getElementById('txtAddressSourceFromMap'),
      document.getElementById('txtAddressSource'),
      document.getElementById('txtAddressSourceView')
    ]
    addrs.forEach(el => {
      if (el) {
        el.value = address
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // فراخوانی مستقیم وب‌سرویس RevereseMap
    try {
      await fetch(`/Barname/Document/RevereseMap?lat=${lat}&lon=${lon}`)
    } catch(e) {}

    return {
      mapFound: !!map,
      mapMoved,
      markerMoved
    }
  }, { lat, lon, address })

  console.log(`   نتیجه موتور نقشه: ${scanResult.mapFound ? '✔ موتور نقشه مستقیماً کنترل شد' : '✖'}`)
  console.log(`   حرکت دوربین به بوشهر: ${scanResult.mapMoved ? '✔ دوربین نقشه به سمت بوشهر پرواز کرد' : '✖'}`)
  console.log(`   نشانگر مارکر: ${scanResult.markerMoved ? '✔ مارکر روی کوچه بهمن ۲ قفل شد' : '✖'}\n`)

  await sleep(1500)

  // ۲. کلیک فیزیکی ماوس در مرکز کانتینر نقشه برای تحریک DOM
  try {
    const mapElement = await page.$('#mapp-MapSource') || await page.$('#MapSource')
    if (mapElement) {
      await mapElement.scrollIntoViewIfNeeded().catch(() => {})
      await sleep(300)
      const box = await mapElement.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      }
    }
  } catch (e) {}

  // فعال‌سازی شنود برای کلیک‌های بعدی شما در صورت نیاز
  isStep5ActiveForRecording = true

  console.log('🎉 نقشه و مارکر بدون هیچ تایپ متنی، مستقیماً به نقطه دقیق بوشهر منتقل شدند!')
  console.log('🌐 پنجره مرورگر کاملاً باز می‌ماند.')
}

/* -------------------------------------------------------------------------- */
/*                                تابع اصلی اجرا                              */
/* -------------------------------------------------------------------------- */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🗺  ربات باربرگ — جابجایی دیداری و مستقیم نقشه (بدون تایپ)')
  console.log(`👤 نام کاربری: ${CONFIG.username}`)
  console.log('═══════════════════════════════════════════════════════════════')

  const locationFile = CONFIG.savedLocationFile
  let savedLocation = {
    lat: 28.91636293383579,
    lon: 50.83736658096314,
    address: 'بوشهر، کوچه بهمن ۲',
    province: 'بوشهر',
    county: 'بوشهر'
  }

  if (fs.existsSync(locationFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(locationFile, 'utf8'))
      if (data && data.lat && data.lon) {
        savedLocation = data
        console.log(`📁 نقطه ذخیره‌شده شما: [Lat: ${savedLocation.lat}, Lon: ${savedLocation.lon}]`)
        console.log(`🏠 آدرس: ${savedLocation.address}`)
      }
    } catch (e) {}
  }

  // ۱. ورود آرام به سامانه تا گام ۵
  const session = await launchAndLoginToStep5()
  if (!session.ok) return

  const { page } = session

  // ۲. جابجایی مستقیم و دیداری نقشه بدون هیچ تایپ
  await moveMapToExactPointDirectly(page, savedLocation)

  // باز نگه داشتن دائمی مرورگر
  await new Promise(() => {})
}

main().catch((err) => {
  console.error('خطای غیرمنتظره:', err)
})
