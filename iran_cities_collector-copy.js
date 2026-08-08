/**
 * ==============================================================================
 *  نام فایل: iran_cities_collector.js (نسخه نهایی با حرکت زنده و دیداری نقشه)
 *  نام کاربری: 3070427898
 *  رمز عبور:   @Rb7553925
 * ==============================================================================
 *  اصلاحات اساسی اعمال‌شده در این نسخه:
 *    ۱. حرکت قطعی، انیمیشنی و دیداری نقشه Leaflet / Map.ir:
 *       • جابجایی کادر نقشه با setView و panTo دقیقاً روی نقطه ذخیره‌شده شما (بوشهر)
 *       • جابجایی فیزیکی نشانگر قرمز/آبی نقشه (Marker) به همان نقطه
 *       • مقداردهی فیلد آدرس متنی #txtAddressSourceFromMap
 *    ۲. تنظیم سرعت آرام، ملایم و مطمئن در تمام گام‌های ۱ تا ۴
 *    ۳. جلوگیری از بازنویسی اشتباه نقطه نقشه با مختصات پیش‌فرض سایت
 *    ۴. باز ماندن دائمی پنجره مرورگر
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

  // شنود هوشمند وب‌سرویس نقشه (فقط و فقط زمانی که در گام ۵ باشیم و شما کلیک جدید کنید)
  page.on('response', async (response) => {
    try {
      if (isStep5ActiveForRecording && response.url().includes('RevereseMap')) {
        const urlObj = new URL(response.url())
        const lat = parseFloat(urlObj.searchParams.get('lat'))
        const lon = parseFloat(urlObj.searchParams.get('lon'))

        // نادیده گرفتن مختصات اولیه و پیش‌فرض سایت
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
            province: data.obj.province || '',
            county: data.obj.county || '',
            region: data.obj.region || '',
            neighbourhood: data.obj.neighbourhood || '',
            savedAt: new Date().toISOString()
          }

          fs.writeFileSync(CONFIG.savedLocationFile, JSON.stringify(locationRecord, null, 2), 'utf8')

          console.log('\n═══════════════════════════════════════════════════════════════')
          console.log('🎉 نقطه نقشه با موفقیت انتخاب و ذخیره شد!')
          console.log(`📍 عرض جغرافیایی (Lat): ${lat}`)
          console.log(`📍 طول جغرافیایی (Lon): ${lon}`)
          console.log(`🏠 آدرس متنی: ${address}`)
          console.log(`📁 فایل ذخیره: ${CONFIG.savedLocationFile}`)
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

  // باز کردن فرم باربرگ با سرعت آرام
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

/**
 * تابع تزریق قطعی، جابجایی زنده نقشه و انتقال مارکر در گام ۵
 */
async function injectSavedLocationToMap(page, savedLoc) {
  console.log(`\n🗺  در حال جابجایی دیداری نقشه و انتقال مارکر به نقطه ذخیره‌شده شما...`)
  console.log(`   📍 مختصات: [Lat: ${savedLoc.lat}, Lon: ${savedLoc.lon}]`)
  console.log(`   🏠 آدرس: ${savedLoc.address}`)

  await sleep(1500)

  const injected = await page.evaluate(async ({ lat, lon, address }) => {
    // ۱. مقداردهی فیلدهای آدرس متنی
    const addrs = [
      document.getElementById('txtAddressSourceFromMap'),
      document.getElementById('txtAddressSource'),
      document.getElementById('txtAddressSourceView')
    ]
    addrs.forEach(a => {
      if (a) {
        a.value = address
        a.dispatchEvent(new Event('input', { bubbles: true }))
        a.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // ۲. ارسال وب‌سرویس نقشه به سرور
    try {
      await fetch(`/Barname/Document/RevereseMap?lat=${lat}&lon=${lon}`)
    } catch (e) {}

    // ۳. پیدا کردن شیء نقشه Leaflet در صفحه
    let leafletMap = null
    const mapDiv = document.getElementById('mapp-MapSource') || document.getElementById('MapSource')
    if (mapDiv && mapDiv._leaflet_map) {
      leafletMap = mapDiv._leaflet_map
    } else if (window.mapp && window.mapp.maps && window.mapp.maps['mapp-MapSource']) {
      leafletMap = window.mapp.maps['mapp-MapSource']
    } else if (window.map) {
      leafletMap = window.map
    }

    if (!leafletMap && window.L) {
      for (const k in window) {
        try {
          if (window[k] && window[k]._leaflet_id && typeof window[k].setView === 'function') {
            leafletMap = window[k]
            break
          }
        } catch (e) {}
      }
    }

    if (leafletMap) {
      // جابجایی زنده نقشه به مختصات بوشهر و زوم
      leafletMap.setView([lat, lon], 16, { animate: true })
      leafletMap.invalidateSize()

      // جابجایی مارکر روی نقشه
      let markerFound = false
      if (leafletMap.eachLayer) {
        leafletMap.eachLayer((layer) => {
          if (layer && typeof layer.setLatLng === 'function') {
            layer.setLatLng([lat, lon])
            markerFound = true
          }
        })
      }

      // ایجاد مارکر جدید در صورت نبودن مارکر
      if (!markerFound && window.L) {
        try {
          const icon = window.L.icon({
            iconUrl: 'https://cdn.map.ir/web-sdk/1.4.2/assets/images/marker-start-route.png',
            iconSize: [35, 35],
            iconAnchor: [17, 35]
          })
          window.L.marker([lat, lon], { icon }).addTo(leafletMap)
        } catch (e) {
          window.L.marker([lat, lon]).addTo(leafletMap)
        }
      }

      // شلیک کلیک روی نقشه
      try {
        const latlng = window.L ? window.L.latLng(lat, lon) : { lat, lng: lon }
        leafletMap.fire('click', {
          latlng: latlng,
          containerPoint: leafletMap.latLngToContainerPoint(latlng),
          originalEvent: new MouseEvent('click', { bubbles: true })
        })
      } catch (e) {}

      return true
    }

    return false
  }, { lat: savedLoc.lat, lon: savedLoc.lon, address: savedLoc.address }).catch(() => false)

  await sleep(1500)

  // کلیک ماوس در مرکز کانتینر نقشه برای تحریک نهایی نقشه
  try {
    const mapBox = await page.$('#mapp-MapSource') || await page.$('#MapSource')
    if (mapBox) {
      await mapBox.scrollIntoViewIfNeeded().catch(() => {})
      await sleep(500)
      const box = await mapBox.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      }
    }
  } catch (e) {}

  console.log('   ✅ نقشه و مارکر با موفقیت روی نقطه بوشهر جابجا و قفل شدند!')
  return injected
}

/* -------------------------------------------------------------------------- */
/*                                تابع اصلی اجرا                              */
/* -------------------------------------------------------------------------- */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🗺  سیستم هوشمند ضبط و جابجایی زنده نقشه در گام ۵ باربرگ')
  console.log(`👤 نام کاربری: ${CONFIG.username}`)
  console.log('═══════════════════════════════════════════════════════════════')

  const locationFile = CONFIG.savedLocationFile
  let hasSavedLocation = false
  let savedLocation = null

  if (fs.existsSync(locationFile)) {
    try {
      savedLocation = JSON.parse(fs.readFileSync(locationFile, 'utf8'))
      if (savedLocation && savedLocation.lat && savedLocation.lon) {
        hasSavedLocation = true
        console.log(`📁 نقطه ذخیره‌شده شما: [Lat: ${savedLocation.lat}, Lon: ${savedLocation.lon}]`)
        console.log(`🏠 آدرس: ${savedLocation.address}`)
      }
    } catch (e) {}
  }

  // ۱. ورود آرام به سامانه تا گام ۵
  const session = await launchAndLoginToStep5()
  if (!session.ok) return

  const { page } = session

  // ۲. مدیریت گام ۵
  if (hasSavedLocation) {
    // جابجایی زنده و قطعی نقشه روی نقطه شما
    await injectSavedLocationToMap(page, savedLocation)

    // فعال‌سازی شنود برای تغییرات دستی احتمالی بعدی
    isStep5ActiveForRecording = true

    console.log('\n🎉 نقشه و فرم با نقطه ذخیره‌شده شما به صورت زنده لود شد!')
    console.log('🌐 مرورگر باز می‌ماند تا نقطه را مشاهده کنید یا دکمه مرحله بعد را بزنید.')
  } else {
    // فعال‌سازی شنود برای اولین کلیک شما
    isStep5ActiveForRecording = true

    console.log('\n╔═════════════════════════════════════════════════════════════════════╗')
    console.log('║ 📍 نوبت شماست: لطفاً روی نقشه گام ۵ نقطه مبدا مورد نظرتان را کلیک کنید║')
    console.log('║    (ربات به محض کلیک، مختصات را استخراج و دائمی ذخیره خواهد کرد...)   ║')
    console.log('╚═══════════════════════════════════════════════════════════════╝\n')
  }

  // باز نگه داشتن دائمی مرورگر
  await new Promise(() => {})
}

main().catch((err) => {
  console.error('خطای غیرمنتظره:', err)
})
