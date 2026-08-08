/**
 * ==============================================================================
 * نام فایل: iran_cities_collector.js
 * نسخه: گام ۵ + عبور خودکار به گام ۶ + اجرای همان منطق نقشه در گام ۶
 * ==============================================================================
 * نکات امنیتی:
 *   برای جلوگیری از ذخیره رمز داخل فایل، نام کاربری/رمز را در .env بگذارید:
 *      BARBARG_USERNAME=...
 *      BARBARG_PASSWORD=...
 *
 * نحوه اجرا:
 *      npm i dotenv playwright
 *      node iran_cities_collector.js
 * ==============================================================================
 */

require('dotenv').config()

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

/* -------------------------------------------------------------------------- */
/* تنظیمات و مسیرها                                                            */
/* -------------------------------------------------------------------------- */

const CONFIG = {
  username: process.env.BARBARG_USERNAME || '3070427898',
  password: process.env.BARBARG_PASSWORD || '@Rb7553925',

  loginUrl: 'https://barname.utcms.ir/Barname/Account/Login',
  formUrl: 'https://barname.utcms.ir/barname/Document/HagigiHogugi',

  // فایل‌های ذخیره نقطه‌هایی که خودتان روی نقشه کلیک می‌کنید.
  savedSourceLocationFile: path.join(__dirname, 'saved_map_location.json'),
  savedDestLocationFile: path.join(__dirname, 'saved_map_location_dest.json'),

  // حالت اصلی فعلی: ربات خودش نقطه نمی‌زند؛ منتظر کلیک دستی شما روی نقشه می‌ماند.
  manualMapSelection: true,

  // اگر قبلاً با کلیک دستی نقطه را ذخیره کرده باشید، اجرای بعدی همان نقطه ذخیره‌شده را روی نقشه نشان می‌دهد.
  // هیچ مختصات پیش‌فرضی در برنامه نیست؛ فقط از فایل saved_map_location*.json استفاده می‌شود.
  useSavedLocationOnNextRun: true,

  // حالت قدیمیِ خودکار کامل. معمولاً لازم نیست روشن شود؛ useSavedLocationOnNextRun کافی است.
  autoMoveSavedLocation: false,

  // بعد از اینکه نقطه گام ۵ مشخص شد، دکمه رفتن به گام ۶ خودکار زده شود.
  autoAdvanceToStep6: true,

  // بعد از تکمیل نقشه گام ۶، اگر true شود به گام ۷ هم می‌رود.
  // طبق درخواست فعلی، پیش‌فرض false است تا مرورگر روی گام ۶ باز بماند.
  autoAdvanceAfterStep6: false,

  waybillData: {
    sender: {
      firstName: 'شرکت',
      lastName: 'شرکت',
      mobile: '09131784512',
      nationalId: '3070427898',
    },
    receiver: {
      firstName: 'شرکت',
      lastName: 'شرکت',
      mobile: '09131784512',
      nationalId: '3070427898',
    },
    cargo: {
      name: 'آجر',
      packaging: 'سایر',
      count: '10',
      weightTon: '10',
      value: '10000000',
    },
  },
}

// هیچ مختصات پیش‌فرضی داخل برنامه وجود ندارد.
// نقطه نقشه فقط با کلیک دستی شما یا از فایل ذخیره‌شده معتبر خوانده می‌شود.

const BOX_TYPES = {
  'کارتن': '8',
  'جعبه': '9',
  'کیسه': '10',
  'گونی': '11',
  'جامبو': '12',
  'بشکه': '18072',
  'رول': '18073',
  'فله': '18074',
  'عدل': '18075',
  'شاخه': '18076',
  'سایر': '18077',
}

const STEP_MAP = {
  origin: {
    kind: 'origin',
    label: 'گام ۵: مبدا بارگیری',
    paneId: 'pills-5',
    nextBtn: '#btnGoLVL6',
    nextPaneId: 'pills-6',
    mapSelectors: [
      '#mapp-MapSource',
      '#MapSource',
      '#mapSource',
      '#sourceMap',
      '#SourceMap',
    ],
    addressIds: [
      'txtAddressSourceFromMap',
      'txtAddressSource',
      'txtAddressSourceView',
      'AddressSource',
      'sourceAddress',
    ],
    latIds: ['latSource', 'LatSource', 'SourceLat', 'LatitudeSource', 'txtLatitudeSource', 'sourceLat'],
    lonIds: ['lonSource', 'lngSource', 'LonSource', 'LngSource', 'SourceLon', 'SourceLng', 'LongitudeSource', 'txtLongitudeSource', 'sourceLon', 'sourceLng'],
  },

  dest: {
    kind: 'dest',
    label: 'گام ۶: مقصد تخلیه',
    paneId: 'pills-6',
    nextBtn: '#btnGoLVL7',
    nextPaneId: 'pills-7',
    // سلکتورهای دقیق مقصد در پروژه به شکل MapCity2/AddressSearch2 آمده‌اند؛
    // برای خود نقشه، این لیست چند حالت محتمل را پوشش می‌دهد و اگر پیدا نشود
    // موتور عمومی، نقشه فعال داخل گام ۶ را از روی Leaflet پیدا می‌کند.
    mapSelectors: [
      '#mapp-MapDest',
      '#MapDest',
      '#mapp-MapDestination',
      '#MapDestination',
      '#mapp-MapTarget',
      '#MapTarget',
      '#mapp-MapMaghsad',
      '#MapMaghsad',
      '#destMap',
      '#DestMap',
      '#destinationMap',
      '#DestinationMap',
    ],
    addressIds: [
      'txtAddressDestFromMap',
      'txtAddressDest',
      'txtAddressDestView',
      'AddressDest',
      'destAddress',
      'destinationAddress',
    ],
    latIds: ['latDest', 'LatDest', 'DestLat', 'DestinationLat', 'LatitudeDest', 'txtLatitudeDest', 'destLat'],
    lonIds: ['lonDest', 'lngDest', 'LonDest', 'LngDest', 'DestLon', 'DestLng', 'DestinationLon', 'DestinationLng', 'LongitudeDest', 'txtLongitudeDest', 'destLon', 'destLng'],
  },
}

let activeRecordingKind = null
let suppressReverseMapRecording = false
const lastRecordedLocation = { origin: null, dest: null }
const mapSelectionWaiters = { origin: [], dest: [] }

/* -------------------------------------------------------------------------- */
/* توابع کمکی                                                                   */
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
    const a = +m[1]
    const b = +m[3]
    switch (m[2]) {
      case '+': return String(a + b)
      case '-': return String(a - b)
      case '*':
      case '×': return String(a * b)
      case '/':
      case '÷': return b ? String(Math.round(a / b)) : null
      default: return null
    }
  }
  const o = s.match(/^\D*(\d{1,6})\D*$/)
  return o ? o[1] : null
}

function loadLocation(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠ فایل نقطه ذخیره‌شده ${label} وجود ندارد: ${path.basename(filePath)}`)
    return null
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (data && Number.isFinite(+data.lat) && Number.isFinite(+data.lon)) {
      const loc = { ...data, lat: +data.lat, lon: +data.lon }
      console.log(`📁 نقطه ذخیره‌شده ${label}: [Lat: ${loc.lat}, Lon: ${loc.lon}]`)
      if (loc.address) console.log(`🏠 آدرس ${label}: ${loc.address}`)
      return loc
    }
  } catch (e) {
    console.log(`⚠ فایل ${path.basename(filePath)} خوانده نشد یا JSON معتبر نبود.`)
  }

  return null
}

async function waitForPaneActive(page, paneId, timeoutMs = 60000) {
  const started = Date.now()
  while (!timeoutMs || Date.now() - started < timeoutMs) {
    const active = await page.evaluate((id) => {
      const el = document.getElementById(id)
      return !!(el && el.classList.contains('active'))
    }, paneId).catch(() => false)
    if (active) return true
    await sleep(500)
  }
  return false
}

async function clickNextStep(page, btnSelector, nextPaneId, label) {
  console.log(`\n➜ ${label} ...`)

  const btn = await page.$(btnSelector)
  if (!btn) {
    console.log(`   ✖ دکمه ${btnSelector} پیدا نشد.`)
    return false
  }

  await btn.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(300)
  await btn.click().catch(() => {})

  const ok = await waitForPaneActive(page, nextPaneId, 25000)
  if (ok) {
    console.log(`   ✅ ${label} با موفقیت انجام شد.`)
    return true
  }

  const diagnostics = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('small.help-block, .alert-danger, .field-validation-error, .text-danger').forEach((e) => {
      const el = e
      const t = (el.innerText || el.textContent || '').trim()
      if (t && el.offsetParent !== null) out.push(t)
    })
    const swal = document.querySelector('.swal2-popup, .swal-modal')
    if (swal) {
      const t = (swal.innerText || swal.textContent || '').trim()
      if (t) out.push(`پاپ‌آپ: ${t}`)
    }
    return Array.from(new Set(out)).slice(0, 10)
  }).catch(() => [])

  console.log(`   ✖ ${label} انجام نشد؛ گام بعد فعال نشد.`)
  diagnostics.forEach((d) => console.log(`      • ${d}`))
  return false
}

function notifyMapSelection(kind, locationRecord) {
  lastRecordedLocation[kind] = locationRecord
  const waiters = mapSelectionWaiters[kind] || []
  mapSelectionWaiters[kind] = []
  waiters.forEach((resolve) => resolve(locationRecord))
}

function waitForRecordedSelection(kind, timeoutMs = 0) {
  if (lastRecordedLocation[kind]) return Promise.resolve(lastRecordedLocation[kind])

  return new Promise((resolve, reject) => {
    let timer = null
    const done = (loc) => {
      if (timer) clearTimeout(timer)
      resolve(loc)
    }

    mapSelectionWaiters[kind].push(done)

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        mapSelectionWaiters[kind] = mapSelectionWaiters[kind].filter((fn) => fn !== done)
        reject(new Error(`timeout waiting for ${kind} map click`))
      }, timeoutMs)
    }
  })
}

async function installManualMapClickWatcher(page, stepCfg) {
  await page.evaluate((cfg) => {
    window.__barbargMapClickWatcherInstalled = window.__barbargMapClickWatcherInstalled || false
    window.__barbargExpectedMapKind = cfg.kind
    window.__barbargCurrentMapPaneId = cfg.paneId
    window.__barbargCurrentMapSelectors = cfg.mapSelectors || []
    window.__barbargLastManualMapClick = null

    if (window.__barbargMapClickWatcherInstalled) return
    window.__barbargMapClickWatcherInstalled = true

    document.addEventListener('click', (ev) => {
      const paneId = window.__barbargCurrentMapPaneId
      const selectors = window.__barbargCurrentMapSelectors || []
      const pane = paneId ? document.getElementById(paneId) : null
      const target = ev.target
      if (!target) return

      const containers = []
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) containers.push(el)
      }
      document.querySelectorAll('.leaflet-container, .mapp-map').forEach((el) => containers.push(el))

      const clickedMap = containers.some((el) => {
        if (!el || !el.contains(target)) return false
        return !pane || pane.contains(el)
      })

      if (clickedMap) {
        window.__barbargLastManualMapClick = {
          kind: window.__barbargExpectedMapKind,
          at: Date.now(),
        }
      }
    }, true)
  }, stepCfg).catch(() => {})
}

async function waitForUserMapSelection(page, stepCfg) {
  activeRecordingKind = stepCfg.kind
  lastRecordedLocation[stepCfg.kind] = null
  await installManualMapClickWatcher(page, stepCfg)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`🖱 ${stepCfg.label}`)
  console.log('   ربات دیگر خودش هیچ لوکیشنی نمی‌زند.')
  console.log('   لطفاً خودتان روی نقطه موردنظر داخل نقشه کلیک کنید.')
  console.log('   بعد از اینکه آدرس سایت نشست، ربات همان نقطه را ذخیره می‌کند و ادامه می‌دهد.')
  console.log('═══════════════════════════════════════════════════════════════')

  const loc = await waitForRecordedSelection(stepCfg.kind, 0)
  await sleep(1200)
  return loc
}

/* -------------------------------------------------------------------------- */
/* حل کپچا - همان منطق قبلی، فقط از نظر نحوی اصلاح شده است                     */
/* -------------------------------------------------------------------------- */

async function solveCaptcha(page) {
  return page.evaluate(() => {
    const img = document.querySelector('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]')
    if (!img || !img.complete || (img.naturalWidth || 0) < 8) return { error: 'کپچا بارگذاری نشد' }

    const w = img.naturalWidth
    const h = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return { error: 'خطای canvas' }
    ctx.drawImage(img, 0, 0)

    let data
    try {
      data = ctx.getImageData(0, 0, w, h).data
    } catch (e) {
      return { error: 'دسترسی محدود' }
    }

    const ink = []
    let cnt = 0
    for (let y = 0; y < h; y++) {
      const row = []
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const v = data[i + 3] > 40 && gray < 160 ? 1 : 0
        row.push(v)
        cnt += v
      }
      ink.push(row)
    }

    if (cnt < 15) return { error: 'کپچا خالی است' }

    const colHas = []
    for (let x = 0; x < w; x++) {
      let has = false
      for (let y = 0; y < h; y++) {
        if (ink[y][x]) { has = true; break }
      }
      colHas.push(has)
    }

    const boxes = []
    let st = -1
    for (let x = 0; x <= w; x++) {
      const on = x < w ? colHas[x] : false
      if (on && st === -1) st = x
      else if (!on && st !== -1) {
        if (x - st >= 2) {
          let y0 = h
          let y1 = -1
          for (let y = 0; y < h; y++) {
            for (let xx = st; xx < x; xx++) {
              if (ink[y][xx]) {
                if (y < y0) y0 = y
                if (y > y1) y1 = y
                break
              }
            }
          }
          if (y1 >= y0) boxes.push({ x0: st, x1: x, y0, y1 })
        }
        st = -1
      }
    }

    if (boxes.length < 2 || boxes.length > 5) return { error: 'کاراکتر نامتعارف' }

    const N = 24
    const gridOf = (matrix, x0, x1, y0, y1) => {
      const bw = x1 - x0
      const bh = y1 - y0 + 1
      const out = new Array(N * N).fill(0)
      for (let gy = 0; gy < N; gy++) {
        for (let gx = 0; gx < N; gx++) {
          const sx0 = x0 + Math.floor(gx * bw / N)
          const sx1 = x0 + Math.max(Math.floor((gx + 1) * bw / N), Math.floor(gx * bw / N) + 1)
          const sy0 = y0 + Math.floor(gy * bh / N)
          const sy1 = y0 + Math.max(Math.floor((gy + 1) * bh / N), Math.floor(gy * bh / N) + 1)
          let on = 0
          let total = 0
          for (let y = sy0; y < sy1 && y <= y1; y++) {
            for (let x = sx0; x < sx1 && x < x1; x++) {
              on += matrix[y][x]
              total++
            }
          }
          out[gy * N + gx] = total > 0 && on / total > 0.35 ? 1 : 0
        }
      }
      return out
    }

    const fonts = ['Tahoma', 'Arial', 'Segoe UI', 'Times New Roman', 'Vazirmatn', 'IRANSans', 'B Nazanin', 'sans-serif']
    const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
    const ops = [['+', '+'], ['-', '-'], ['×', '*'], ['÷', '/']]

    const render = (ch, font) => {
      const S = 96
      const rc = document.createElement('canvas')
      rc.width = S
      rc.height = S
      const rx = rc.getContext('2d')
      if (!rx) return null
      rx.fillStyle = '#fff'
      rx.fillRect(0, 0, S, S)
      rx.fillStyle = '#000'
      rx.font = `${Math.floor(S * 0.66)}px "${font}"`
      rx.textAlign = 'center'
      rx.textBaseline = 'middle'
      rx.fillText(ch, S / 2, S / 2)

      let d
      try { d = rx.getImageData(0, 0, S, S).data } catch (e) { return null }

      const m = []
      let x0 = S
      let x1 = -1
      let y0 = S
      let y1 = -1
      let n = 0
      for (let y = 0; y < S; y++) {
        const r = []
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4
          const v = d[i] < 140 ? 1 : 0
          r.push(v)
          if (v) {
            n++
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
        m.push(r)
      }
      if (n < 8 || x1 < x0) return null
      return gridOf(m, x0, x1 + 1, y0, y1)
    }

    const digitRefs = []
    const opRefs = []
    for (const f of fonts) {
      for (let i = 0; i < 10; i++) {
        const g = render(digits[i], f)
        if (g) digitRefs.push({ v: String(i), g })
      }
      for (const [ch, v] of ops) {
        const g = render(ch, f)
        if (g) opRefs.push({ v, g })
      }
    }

    if (!digitRefs.length) return { error: 'عدم تولید کاراکترهای مرجع' }

    const iou = (a, b) => {
      let I = 0
      let U = 0
      for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) I++
        if (a[i] || b[i]) U++
      }
      return U ? I / U : 0
    }

    const best = (g, refs) => {
      const scores = new Map()
      for (const r of refs) {
        const s = iou(g, r.g)
        if (s > (scores.get(r.v) ?? 0)) scores.set(r.v, s)
      }
      const sorted = [...scores.entries()].sort((p, q) => q[1] - p[1])
      return { value: sorted[0]?.[0] ?? '', score: sorted[0]?.[1] ?? 0 }
    }

    const symbols = []
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      const g = gridOf(ink, b.x0, b.x1, b.y0, b.y1)
      const isOp = boxes.length === 3 && i === 1
      const r = best(g, isOp ? opRefs : digitRefs)
      symbols.push({ value: r.value, score: r.score })
    }

    return { symbols, expr: symbols.map((s) => s.value).join(''), boxes: boxes.length }
  })
}

/* -------------------------------------------------------------------------- */
/* ورود و تکمیل گام‌های ۱ تا ۴                                                  */
/* -------------------------------------------------------------------------- */

async function launchBrowser() {
  try {
    return await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
    })
  } catch (e) {
    console.log('⚠ Chrome پیدا نشد؛ Chromium داخلی Playwright استفاده می‌شود.')
    return chromium.launch({
      headless: false,
      args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
    })
  }
}

function attachReverseMapRecorder(page) {
  page.on('response', async (response) => {
    try {
      const kind = activeRecordingKind
      if (!kind) return
      if (!response.url().includes('RevereseMap')) return
      if (suppressReverseMapRecording) return

      const urlObj = new URL(response.url())
      const lat = parseFloat(urlObj.searchParams.get('lat'))
      const lon = parseFloat(urlObj.searchParams.get('lon'))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

      // نادیده گرفتن مختصات پیش‌فرض سایت، اگر همان حوالی تهران باشد.
      if (Math.abs(lat - 35.7219) < 0.001 && Math.abs(lon - 51.3347) < 0.001) return

      // در حالت دستی، فقط پاسخی قبول می‌شود که بعد از کلیک واقعی شما روی نقشه آمده باشد.
      // این قسمت جلوی همان مشکل را می‌گیرد که سایت/ربات خودش در ابتدای گام لوکیشن ثبت کند.
      if (CONFIG.manualMapSelection) {
        const hadRecentManualClick = await page.evaluate((expectedKind) => {
          const x = window.__barbargLastManualMapClick
          return !!(x && x.kind === expectedKind && Date.now() - x.at < 45000)
        }, kind).catch(() => false)

        if (!hadRecentManualClick) {
          console.log(`   ⏭ پاسخ RevereseMap برای ${kind === 'dest' ? 'مقصد' : 'مبدا'} نادیده گرفته شد؛ چون کلیک دستی روی نقشه ثبت نشده بود.`)
          return
        }
      }

      const data = await response.json().catch(() => null)
      const obj = data && data.obj ? data.obj : {}
      const address = obj.postal_address || obj.address || ''
      const locationRecord = {
        lat,
        lon,
        address,
        province: obj.province || 'بوشهر',
        county: obj.county || 'بوشهر',
        region: obj.region || '',
        neighbourhood: obj.neighbourhood || '',
        savedAt: new Date().toISOString(),
      }

      const targetFile = kind === 'dest'
        ? CONFIG.savedDestLocationFile
        : CONFIG.savedSourceLocationFile
      fs.writeFileSync(targetFile, JSON.stringify(locationRecord, null, 2), 'utf8')

      console.log('\n═══════════════════════════════════════════════════════════════')
      console.log(`🎉 نقطه جدید نقشه برای ${kind === 'dest' ? 'مقصد' : 'مبدا'} توسط کلیک شما ذخیره شد!`)
      console.log(`📍 Lat: ${lat}`)
      console.log(`📍 Lon: ${lon}`)
      console.log(`🏠 آدرس متنی: ${address}`)
      console.log(`💾 فایل: ${path.basename(targetFile)}`)
      console.log('═══════════════════════════════════════════════════════════════\n')

      notifyMapSelection(kind, locationRecord)
    } catch (e) {
      // عمداً بی‌صدا؛ نباید پردازش اصلی را متوقف کند.
    }
  })
}

async function launchAndLoginToStep5() {
  console.log('\n🔄 در حال راه‌اندازی مرورگر و ورود به سامانه با سرعت آرام و مطمئن...')

  if (!CONFIG.username || !CONFIG.password) {
    console.error('❌ نام کاربری/رمز عبور در env تنظیم نشده است. فایل .env بسازید و BARBARG_USERNAME و BARBARG_PASSWORD را قرار دهید.')
    return { browser: null, page: null, ok: false }
  }

  const browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: null,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
  })

  const page = await context.newPage()
  attachReverseMapRecorder(page)

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
    console.log(`[لاگین] حل کپچا (تلاش ${att}/6)...`)
    const captchaRes = await solveCaptcha(page)
    if (captchaRes.error) {
      console.log(`   ⚠ ${captchaRes.error}`)
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
    }

    await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
    await sleep(1500)
    await (await page.$('#NationalCode'))?.fill(CONFIG.username)
    await (await page.$('#user-password'))?.fill(CONFIG.password)
  }

  if (!loggedIn) {
    console.error('❌ خطا در ورود به سامانه.')
    return { browser, page, ok: false }
  }

  console.log('\n→ در حال بارگذاری فرم صدور باربرگ...')
  await sleep(1500)
  await page.goto(CONFIG.formUrl, { waitUntil: 'domcontentloaded', timeout: 50000 }).catch(() => {})
  await sleep(3000)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

  const data = CONFIG.waybillData

  const typeSlow = async (sel, val, label) => {
    if (!val) return
    const el = await page.$(sel)
    if (!el) {
      console.log(`   ⚠ ${label}: فیلد ${sel} پیدا نشد`)
      return
    }
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await el.click({ clickCount: 3 }).catch(() => {})
    await sleep(150)
    await el.fill('')
    await sleep(150)
    await el.type(String(val), { delay: 90 })
    console.log(`   ✔ ${label}: ${val}`)
    await sleep(300)
  }

  // ═══════════════════════════════════════════════════════════════
  // گام ۱: فرستنده
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۱: مشخصات فرستنده ═══')
  await page.selectOption('#senderSelectType', '1').catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('.hidden, .d-none').forEach((e) => {
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
  // گام ۲: گیرنده
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══ گام ۲: مشخصات گیرنده ═══')
  await page.selectOption('#receiverSelectType', '1').catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('.hidden, .d-none').forEach((e) => {
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
  // گام ۳: راننده و خودرو
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
  // گام ۴: مشخصات کالا
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
          const match = items.find((li) => (li.innerText || '').trim().includes(want)) || items[0]
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
    if (s) {
      s.value = v
      s.dispatchEvent(new Event('change', { bubbles: true }))
      if (window.jQuery) window.jQuery(s).val(v).trigger('change')
    }
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
/* موتور نقشه برای گام ۵ و گام ۶ - بدون تایپ در هیچ کادر                         */
/* -------------------------------------------------------------------------- */

async function moveMapToExactPointDirectly(page, savedLoc, stepCfg) {
  const { lat, lon } = savedLoc
  const address = savedLoc.address || `${lat}, ${lon}`

  activeRecordingKind = stepCfg.kind

  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`🎯 ${stepCfg.label} — جابجایی مستقیم نقشه و مارکر، بدون هیچ تایپ:`)
  console.log(`📍 مختصات دقیق: [Lat: ${lat}, Lon: ${lon}]`)
  console.log(`🏠 آدرس متنی: ${address}`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  await sleep(2000)
  await waitForPaneActive(page, stepCfg.paneId, 15000).catch(() => false)

  const scanResult = await page.evaluate(async ({ lat, lon, address, stepCfg }) => {
    const visible = (el) => {
      if (!el) return false
      const st = window.getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 20 && r.height > 20
    }

    const isMap = (v) => v && typeof v === 'object' && typeof v.setView === 'function' && typeof v.panTo === 'function'

    const pane = document.getElementById(stepCfg.paneId)

    function candidateContainers() {
      const arr = []
      for (const sel of stepCfg.mapSelectors || []) {
        const el = document.querySelector(sel)
        if (el) arr.push(el)
      }
      document.querySelectorAll('.leaflet-container, .mapp-map, [id*="Map"], [id*="map"]').forEach((el) => arr.push(el))

      const uniq = []
      const seen = new Set()
      for (const el of arr) {
        if (!el || seen.has(el)) continue
        seen.add(el)
        uniq.push(el)
      }

      return uniq.sort((a, b) => {
        const score = (el) => {
          let s = 0
          if (pane && pane.contains(el)) s += 100
          if (visible(el)) s += 50
          if (el.classList.contains('leaflet-container')) s += 20
          if ((stepCfg.mapSelectors || []).some((x) => x === `#${el.id}`)) s += 30
          return s
        }
        return score(b) - score(a)
      })
    }

    function allMapsFromWindow() {
      const found = []
      const add = (v) => { if (isMap(v) && !found.includes(v)) found.push(v) }

      const containers = candidateContainers()

      // ۱) روی خود DOM و jQuery data
      for (const el of containers) {
        for (const key of Object.getOwnPropertyNames(el)) {
          try { add(el[key]) } catch (e) {}
        }
        if (window.jQuery) {
          try {
            const d = window.jQuery(el).data()
            for (const k in d) add(d[k])
          } catch (e) {}
        }
      }

      // ۲) Mapp SDK
      if (window.mapp) {
        if (typeof window.mapp.getMap === 'function') {
          for (const el of containers) {
            if (el.id) {
              try { add(window.mapp.getMap(el.id)) } catch (e) {}
            }
          }
        }
        if (window.mapp.maps) {
          for (const k in window.mapp.maps) add(window.mapp.maps[k])
        }
      }

      // ۳) متغیرهای سراسری و یک سطح زیرمجموعه
      const keys = Object.getOwnPropertyNames(window)
      for (const k of keys) {
        try {
          const v = window[k]
          add(v)
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            for (const sub of Object.keys(v).slice(0, 120)) add(v[sub])
          }
        } catch (e) {}
      }

      return found
    }

    function pickBestMap() {
      const maps = allMapsFromWindow()
      const containers = candidateContainers()
      if (!maps.length) return { map: null, container: containers[0] || null, maps: 0, containers: containers.length }

      const scoreMap = (m) => {
        let s = 0
        const c = m._container || m.getContainer?.()
        if (c) {
          if (pane && pane.contains(c)) s += 200
          if (visible(c)) s += 100
          if (containers.includes(c)) s += 80
          if ((stepCfg.mapSelectors || []).some((x) => x === `#${c.id}`)) s += 80
        }
        return s
      }

      maps.sort((a, b) => scoreMap(b) - scoreMap(a))
      const map = maps[0]
      return { map, container: map._container || map.getContainer?.() || containers[0] || null, maps: maps.length, containers: containers.length }
    }

    const picked = pickBestMap()
    const map = picked.map
    let mapMoved = false
    let markerMoved = false
    let clickFired = false
    let reverseCalled = false
    let addressApplied = 0
    let coordsApplied = 0

    const latlngArr = [lat, lon]
    const latlngObj = window.L && window.L.latLng ? window.L.latLng(lat, lon) : { lat, lng: lon }

    if (map) {
      try {
        if (typeof map.invalidateSize === 'function') map.invalidateSize(true)
        if (typeof map.flyTo === 'function') map.flyTo(latlngArr, 17, { animate: true, duration: 1.2 })
        map.setView(latlngArr, 17)
        map.panTo(latlngArr)
        if (typeof map.invalidateSize === 'function') map.invalidateSize(true)
        mapMoved = true
      } catch (e) {
        try { map.setView(latlngArr, 17); mapMoved = true } catch (e2) {}
      }

      try {
        if (map.eachLayer) {
          map.eachLayer((layer) => {
            // فقط marker-like ها؛ به لایه‌های tile/polyline دست نمی‌زنیم.
            if (layer && typeof layer.setLatLng === 'function' && (layer._icon || layer.options?.icon || layer.dragging)) {
              layer.setLatLng(latlngArr)
              markerMoved = true
            }
          })
        }
      } catch (e) {}

      if (!markerMoved && window.L && typeof window.L.marker === 'function') {
        try {
          const icon = window.L.icon({
            iconUrl: 'https://cdn.map.ir/web-sdk/1.4.2/assets/images/marker-start-route.png',
            iconSize: [35, 35],
            iconAnchor: [17, 35],
          })
          window.L.marker(latlngArr, { icon }).addTo(map)
          markerMoved = true
        } catch (e) {
          try { window.L.marker(latlngArr).addTo(map); markerMoved = true } catch (e2) {}
        }
      }

      try {
        const cPoint = map.latLngToContainerPoint ? map.latLngToContainerPoint(latlngObj) : { x: 200, y: 200 }
        if (typeof map.fire === 'function') {
          map.fire('click', {
            latlng: latlngObj,
            layerPoint: cPoint,
            containerPoint: cPoint,
            originalEvent: new MouseEvent('click', { bubbles: true }),
          })
          clickFired = true
        }
      } catch (e) {}
    }

    // مقداردهی مستقیم آدرس‌های همان گام، بدون تایپ انسانی.
    for (const id of stepCfg.addressIds || []) {
      const el = document.getElementById(id)
      if (el) {
        el.value = address
        el.setAttribute('value', address)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
        if (window.jQuery) {
          try { window.jQuery(el).val(address).trigger('input').trigger('change').trigger('blur') } catch (e) {}
        }
        addressApplied++
      }
    }

    // تلاش عمومی برای hidden/input های lat/lon همان گام.
    const setByIds = (ids, value) => {
      let n = 0
      for (const id of ids || []) {
        const el = document.getElementById(id)
        if (el) {
          el.value = String(value)
          el.setAttribute('value', String(value))
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          n++
        }
      }
      return n
    }
    coordsApplied += setByIds(stepCfg.latIds, lat)
    coordsApplied += setByIds(stepCfg.lonIds, lon)

    try {
      const res = await fetch(`/Barname/Document/RevereseMap?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      reverseCalled = !!res
    } catch (e) {}

    return {
      mapFound: !!map,
      mapMoved,
      markerMoved,
      clickFired,
      reverseCalled,
      addressApplied,
      coordsApplied,
      mapsScanned: picked.maps,
      containersScanned: picked.containers,
      containerId: picked.container ? picked.container.id || picked.container.className || '' : '',
    }
  }, { lat, lon, address, stepCfg })

  console.log(`نتیجه موتور نقشه (${stepCfg.label}):`)
  console.log(`   ${scanResult.mapFound ? '✔' : '✖'} موتور نقشه پیدا شد`)
  console.log(`   ${scanResult.mapMoved ? '✔' : '✖'} دوربین نقشه منتقل شد`)
  console.log(`   ${scanResult.markerMoved ? '✔' : '✖'} مارکر روی نقطه قفل شد`)
  console.log(`   ${scanResult.clickFired ? '✔' : '✖'} رویداد کلیک نقشه شلیک شد`)
  console.log(`   ${scanResult.reverseCalled ? '✔' : '✖'} وب‌سرویس RevereseMap فراخوانی شد`)
  console.log(`   آدرس‌های مقداردهی‌شده: ${scanResult.addressApplied}`)
  console.log(`   فیلدهای مختصات مقداردهی‌شده: ${scanResult.coordsApplied}`)
  console.log(`   اسکن: ${scanResult.mapsScanned} map / ${scanResult.containersScanned} container / container=${scanResult.containerId || 'نامشخص'}\n`)

  await sleep(1500)

  // کلیک فیزیکی در مرکز کانتینر نقشه فعال برای تحریک DOM؛ این کلیک تایپ نیست.
  try {
    const clicked = await page.evaluate((stepCfg) => {
      const pane = document.getElementById(stepCfg.paneId)
      const isVisible = (el) => {
        if (!el) return false
        const st = window.getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 20 && r.height > 20
      }
      const candidates = []
      for (const sel of stepCfg.mapSelectors || []) {
        const el = document.querySelector(sel)
        if (el) candidates.push(el)
      }
      document.querySelectorAll('.leaflet-container, .mapp-map').forEach((el) => candidates.push(el))
      const el = candidates.find((x) => pane && pane.contains(x) && isVisible(x)) || candidates.find(isVisible)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, stepCfg).catch(() => null)

    if (clicked) await page.mouse.click(clicked.x, clicked.y)
  } catch (e) {}

  console.log(`🎉 ${stepCfg.label} بدون تایپ متنی، مستقیماً روی نقطه هدف تنظیم شد.`)
}

/* -------------------------------------------------------------------------- */
/* تابع اصلی                                                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🗺 ربات باربرگ — گام ۵ و ۶ با انتخاب دستی نقطه روی نقشه')
  console.log(`👤 نام کاربری: ${CONFIG.username ? CONFIG.username : '(تنظیم نشده)'}`)
  console.log(`🖱 حالت انتخاب نقشه: ${CONFIG.manualMapSelection ? 'دستی؛ ربات منتظر کلیک شما می‌ماند' : 'خودکار'}`)
  console.log('═══════════════════════════════════════════════════════════════')

  const session = await launchAndLoginToStep5()
  if (!session.ok) return

  const { page } = session

  if (CONFIG.manualMapSelection) {
    // ۱) گام ۵: اگر قبلاً نقطه مبدا ذخیره شده باشد، همان را نشان می‌دهد؛ وگرنه منتظر کلیک شما می‌ماند.
    const savedSourceLocation = CONFIG.useSavedLocationOnNextRun
      ? loadLocation(CONFIG.savedSourceLocationFile, 'مبدا')
      : null

    if (savedSourceLocation) {
      console.log('\n📍 نقطه ذخیره‌شده مبدا پیدا شد؛ همان نقطه روی نقشه گام ۵ نشان داده می‌شود.')
      suppressReverseMapRecording = true
      try {
        await moveMapToExactPointDirectly(page, savedSourceLocation, STEP_MAP.origin)
      } finally {
        suppressReverseMapRecording = false
      }
    } else {
      await waitForUserMapSelection(page, STEP_MAP.origin)
    }

    // ۲) بعد از مشخص شدن مبدا، رفتن خودکار به گام ۶
    if (CONFIG.autoAdvanceToStep6) {
      const advanced = await clickNextStep(page, STEP_MAP.origin.nextBtn, STEP_MAP.origin.nextPaneId, 'رفتن خودکار از گام ۵ به گام ۶')

      if (!advanced) {
        console.log('\n⚠ رفتن خودکار به گام ۶ موفق نشد. اگر سایت خطا نشان داده، آن را اصلاح کنید یا خودتان دکمه مرحله بعد را بزنید؛ ربات منتظر فعال شدن گام ۶ می‌ماند...')
        await waitForPaneActive(page, STEP_MAP.dest.paneId, 0)
      }
    } else {
      console.log('\nℹ autoAdvanceToStep6=false است؛ خودتان دکمه مرحله بعد گام ۵ را بزنید. ربات منتظر فعال شدن گام ۶ می‌ماند...')
      await waitForPaneActive(page, STEP_MAP.dest.paneId, 0)
    }

    // ۳) گام ۶: اگر قبلاً نقطه مقصد ذخیره شده باشد، همان را نشان می‌دهد؛ وگرنه منتظر کلیک شما می‌ماند.
    const savedDestLocation = CONFIG.useSavedLocationOnNextRun
      ? loadLocation(CONFIG.savedDestLocationFile, 'مقصد')
      : null

    if (savedDestLocation) {
      console.log('\n📍 نقطه ذخیره‌شده مقصد پیدا شد؛ همان نقطه روی نقشه گام ۶ نشان داده می‌شود.')
      suppressReverseMapRecording = true
      try {
        await moveMapToExactPointDirectly(page, savedDestLocation, STEP_MAP.dest)
      } finally {
        suppressReverseMapRecording = false
      }
    } else {
      await waitForUserMapSelection(page, STEP_MAP.dest)
    }
  } else {
    // حالت قدیمی/خودکار؛ فقط وقتی اجرا می‌شود که manualMapSelection=false باشد.
    const sourceLocation = CONFIG.autoMoveSavedLocation
      ? loadLocation(CONFIG.savedSourceLocationFile, 'مبدا')
      : null
    const destLocation = CONFIG.autoMoveSavedLocation
      ? loadLocation(CONFIG.savedDestLocationFile, 'مقصد')
      : null

    if (!sourceLocation || !destLocation) {
      console.error('❌ حالت خودکار روشن است، اما مختصات ذخیره‌شده مبدا/مقصد وجود ندارد. یا manualMapSelection را true کنید، یا اول روی نقشه کلیک کنید تا فایل ذخیره شود.')
      return
    }

    await moveMapToExactPointDirectly(page, sourceLocation, STEP_MAP.origin)

    if (CONFIG.autoAdvanceToStep6) {
      const advanced = await clickNextStep(page, STEP_MAP.origin.nextBtn, STEP_MAP.origin.nextPaneId, 'رفتن خودکار از گام ۵ به گام ۶')
      if (!advanced) await waitForPaneActive(page, STEP_MAP.dest.paneId, 0)
    } else {
      await waitForPaneActive(page, STEP_MAP.dest.paneId, 0)
    }

    await moveMapToExactPointDirectly(page, destLocation, STEP_MAP.dest)
  }

  if (CONFIG.autoAdvanceAfterStep6) {
    await clickNextStep(page, STEP_MAP.dest.nextBtn, STEP_MAP.dest.nextPaneId, 'رفتن خودکار از گام ۶ به گام ۷')
  } else {
    console.log('\n✅ گام ۶ هم با کلیک شما ثبت شد. مرورگر باز می‌ماند.')
    console.log('   اگر خواستید بعد از گام ۶ هم خودکار به گام ۷ برود، CONFIG.autoAdvanceAfterStep6 را true کنید.')
  }

  // باز نگه داشتن دائمی مرورگر
  await new Promise(() => {})
}

main().catch((err) => {
  console.error('خطای غیرمنتظره:', err)
})
