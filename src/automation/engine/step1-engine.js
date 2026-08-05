/**
 * step1-engine.js — موتور مشترک ثبت بارنامه
 * ═══════════════════════════════════════════════════════════════════
 *  این فایل «کپی بی‌کم‌وکاست» توابع test-step1.js است.
 *  هم `node test-step1.js` و هم تب «اتوماسیون ← مرکز کنترل» (ورکر)
 *  دقیقا از همین کد استفاده می‌کنند، پس رفتارشان همیشه یکسان است.
 *
 *  تنها تفاوت‌ها:
 *    ۱) console.log به یک logger قابل تنظیم وصل شده تا لاگ‌ها در پنل دیده شوند
 *    ۲) داده از پارامتر می‌آید (پروفایل کاربر) نه از ثابت WAYBILL
 * ═══════════════════════════════════════════════════════════════════
 */

const path = require('path')
const fs = require('fs')

const SITE = process.env.SITE_URL || 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE}/Barname/Account/Login`
const TARGET_URL = `${SITE}/barname/Document/HagigiHogugi`
const IMG_SEL = '#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]'
const OUT = path.join(process.cwd(), 'diagnostics')

/* ── logger قابل تعویض ──
   توابع پایین همگی console.log می‌زنند؛ اینجا console را در محدوده‌ی
   همین ماژول سایه می‌اندازیم تا خروجی هم به ترمینال و هم به پنل برود. */
let SINK = null
function setLogSink(fn) { SINK = fn }
const console = {
  log: (...a) => {
    const line = a.map(x => (typeof x === 'string' ? x : String(x))).join(' ')
    globalThis.console.log(line)
    if (SINK) { try { SINK(line) } catch (e) {} }
  },
  error: (...a) => globalThis.console.error(...a),
  warn:  (...a) => globalThis.console.warn(...a),
}

/* ═══════════ اعتبارسنجی محلی (مثل خود سایت) ═══════════ */

/** قاعده‌ی رایج کد پستی ایران */
function checkPostal(v) {
  if (!v) return { ok: true }
  const s = String(v).replace(/\D/g, '')
  if (s.length !== 10) return { ok: false, why: `باید ۱۰ رقم باشد (الان ${s.length})` }
  if (/^(\d)\1{9}$/.test(s)) return { ok: false, why: 'همه‌ی ارقام یکسان' }
  if (!/^[13-9]{4}[1346-9][013-9]{5}$/.test(s)) {
    const bad = []
    if (!/^[13-9]{4}/.test(s)) bad.push('۴ رقم اول نباید ۰ یا ۲ باشد')
    if (!/^.{4}[1346-9]/.test(s)) bad.push('رقم پنجم نباید ۰،۲،۵ باشد')
    if (!/^.{5}[013-9]{5}$/.test(s)) bad.push('۵ رقم آخر نباید ۲ باشد')
    return { ok: false, why: bad.join(' / ') || 'الگو نامعتبر' }
  }
  return { ok: true }
}

/** کد ملی ۱۰ رقمی با رقم کنترلی */
function checkNationalCode(v) {
  if (!v) return { ok: true }
  const s = String(v).replace(/\D/g, '')
  if (s.length === 11 && s.startsWith('10')) return { ok: true }   // شناسه‌ی حقوقی
  if (s.length !== 10) return { ok: false, why: `باید ۱۰ رقم باشد (الان ${s.length})` }
  if (/^(\d)\1{9}$/.test(s)) return { ok: false, why: 'همه‌ی ارقام یکسان' }
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(s[i], 10) * (10 - i)
  const r = sum % 11
  const expect = r < 2 ? r : 11 - r
  if (parseInt(s[9], 10) !== expect) return { ok: false, why: `رقم کنترلی باید ${expect} باشد` }
  return { ok: true }
}

function checkMobile(v) {
  if (!v) return { ok: false, why: 'اجباری است' }
  const s = String(v).replace(/\D/g, '')
  if (s.length !== 11) return { ok: false, why: `باید ۱۱ رقم باشد (الان ${s.length})` }
  if (!s.startsWith('09')) return { ok: false, why: 'باید با 09 شروع شود' }
  return { ok: true }
}

function checkTell(v) {
  if (!v) return { ok: true }
  const s = String(v).replace(/\D/g, '')
  if (s.length < 8 || s.length > 11) return { ok: false, why: `طول نامعتبر (${s.length})` }
  if (!s.startsWith('0')) return { ok: false, why: 'باید با 0 شروع شود' }
  return { ok: true }
}

/** بررسی کل داده‌ی یک شخص پیش از تایپ */
function validatePerson(person, label) {
  const checks = [
    ['نام',          person.firstName  ? { ok: true } : { ok: false, why: 'اجباری است' }],
    ['نام خانوادگی', person.lastName   ? { ok: true } : { ok: false, why: 'اجباری است' }],
    ['موبایل',       checkMobile(person.mobile)],
    ['کد ملی',       checkNationalCode(person.nationalId)],
    ['تلفن',         checkTell(person.phone)],
    ['کدپستی',       checkPostal(person.postalCode)],
  ]
  const bad = checks.filter(([, r]) => !r.ok)
  if (bad.length) {
    console.log(`   ⚠ هشدار اعتبارسنجی ${label}:`)
    bad.forEach(([f, r]) => console.log(`      • ${f}: ${r.why}`))
  }
  return bad.length === 0
}
/* ═══════════ پایان اعتبارسنجی ═══════════ */



const BLOCK_RE = /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_TIMED_OUT/
const isBlock = (e) => BLOCK_RE.test(String((e && e.message) || e))
const fmtT = (s) => { const m = Math.floor(s / 60); return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s` }
/** عدد تصادفی بین a و b — برای مدت انتظارهای غیرقابل‌پیش‌بینی */
const rand = (a, b) => a + Math.random() * (b - a)

function norm(s) {
  return String(s).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
                  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
}
function solveMath(t) {
  const s = norm(t).replace(/\s+/g, '')
  const m = s.match(/(\d{1,3})\s*([+\-*/×÷])\s*(\d{1,3})/)
  if (m) {
    const a = +m[1], b = +m[3]
    switch (m[2]) {
      case '+': return String(a + b); case '-': return String(a - b)
      case '*': case '×': return String(a * b)
      case '/': case '÷': return b ? String(Math.round(a / b)) : null
    }
  }
  if (/[+\-*/×÷]/.test(s)) { const d = s.match(/\d/g); if (!d || d.length < 2) return null }
  const o = s.match(/^\D*(\d{1,6})\D*$/)
  return o ? o[1] : null
}

async function probe(page, url) {
  try { const r = await page.request.get(url, { timeout: 12000 }); return r.status() > 0 } catch { return false }
}
async function waitBack(page, url, maxMs) {
  const t0 = Date.now()
  console.log(`   ⏳ صبر تا برگشتن سایت (حداکثر ${fmtT(Math.round(maxMs / 1000))})`)
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 15000))
    if (await probe(page, url)) { console.log(`   ✅ سایت برگشت (${fmtT(Math.round((Date.now() - t0) / 1000))})`); return true }
  }
  return false
}
async function gotoR(page, url, label, max = 20) {
  let tmo = 0
  for (let a = 1; a <= max; a++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return true }
    catch (e) {
      if (isBlock(e)) {
        console.log(`   ⚠ IP بلاک (${a}/${max}) — ${label}`)
        if (a === max) return false
        await waitBack(page, url, 180000 + Math.random() * 120000)
      } else if (/Timeout .* exceeded/.test(String(e.message))) {
        tmo++
        console.log(`   ✖ تایم‌اوت (${tmo}/2)`)
        if (tmo >= 2) return 'TIMEOUT'
        await new Promise(r => setTimeout(r, 4000))
      } else { console.log('   ✖ ' + String(e.message).split('\n')[0].slice(0, 100)); if (a === max) return false; await new Promise(r => setTimeout(r, 5000)) }
    }
  }
  return false
}

// ---- template matching for Persian captcha ----
async function classifyTemplate(page) {
  return page.evaluate((sel) => {
    const img = document.querySelector(sel)
    if (!img) return { error: 'no-image' }
    if (!img.complete || (img.naturalWidth || 0) < 8) return { error: 'not-loaded' }
    const w = img.naturalWidth, h = img.naturalHeight
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d'); if (!ctx) return { error: 'no-ctx' }
    ctx.drawImage(img, 0, 0)
    let data; try { data = ctx.getImageData(0, 0, w, h).data } catch { return { error: 'tainted' } }
    const ink = []; let cnt = 0
    for (let y = 0; y < h; y++) { const r = []
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4
        const g = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]
        const v = (data[i+3] > 40 && g < 160) ? 1 : 0; r.push(v); cnt += v }
      ink.push(r) }
    if (cnt < 15) return { error: 'empty' }
    const colHas = []
    for (let x = 0; x < w; x++) { let hs = false; for (let y = 0; y < h; y++) if (ink[y][x]) { hs = true; break } colHas.push(hs) }
    const boxes = []; let st = -1
    for (let x = 0; x <= w; x++) { const on = x < w ? colHas[x] : false
      if (on && st === -1) st = x
      else if (!on && st !== -1) { if (x - st >= 2) { let y0 = h, y1 = -1
        for (let y = 0; y < h; y++) for (let xx = st; xx < x; xx++) if (ink[y][xx]) { if (y < y0) y0 = y; if (y > y1) y1 = y; break }
        if (y1 >= y0) boxes.push({ x0: st, x1: x, y0, y1 }) } st = -1 } }
    if (boxes.length < 2 || boxes.length > 5) return { error: 'boxes=' + boxes.length }
    const N = 24
    const gridOf = (m, x0, x1, y0, y1) => { const bw = x1 - x0, bh = y1 - y0 + 1, out = new Array(N * N).fill(0)
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        const sx0 = x0 + Math.floor(gx * bw / N), sx1 = x0 + Math.max(Math.floor((gx+1) * bw / N), Math.floor(gx * bw / N) + 1)
        const sy0 = y0 + Math.floor(gy * bh / N), sy1 = y0 + Math.max(Math.floor((gy+1) * bh / N), Math.floor(gy * bh / N) + 1)
        let on = 0, tot = 0
        for (let y = sy0; y < sy1 && y <= y1; y++) for (let x = sx0; x < sx1 && x < x1; x++) { on += m[y][x]; tot++ }
        out[gy * N + gx] = tot > 0 && on / tot > 0.35 ? 1 : 0 }
      return out }
    const FONTS = ['Tahoma','Arial','Segoe UI','Times New Roman','Courier New','Vazirmatn','IRANSans','B Nazanin','Nazanin','sans-serif','serif']
    const D = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹']
    const OPS = [['+','+'],['-','-'],['×','*'],['÷','/']]
    const render = (ch, font) => { const S = 96
      const rc = document.createElement('canvas'); rc.width = S; rc.height = S
      const rx = rc.getContext('2d'); if (!rx) return null
      rx.fillStyle = '#fff'; rx.fillRect(0,0,S,S); rx.fillStyle = '#000'
      rx.font = Math.floor(S*0.66) + 'px "' + font + '"'; rx.textAlign = 'center'; rx.textBaseline = 'middle'
      rx.fillText(ch, S/2, S/2)
      let d; try { d = rx.getImageData(0,0,S,S).data } catch { return null }
      const m = []; let x0 = S, x1 = -1, y0 = S, y1 = -1, n = 0
      for (let y = 0; y < S; y++) { const r = []
        for (let x = 0; x < S; x++) { const i = (y*S+x)*4; const v = d[i] < 140 ? 1 : 0; r.push(v)
          if (v) { n++; if (x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y } }
        m.push(r) }
      if (n < 8 || x1 < x0) return null
      return gridOf(m, x0, x1+1, y0, y1) }
    const rd = [], ro = []
    for (const f of FONTS) { for (let i = 0; i < 10; i++) { const g = render(D[i], f); if (g) rd.push({v:String(i),g}) }
      for (const [ch,v] of OPS) { const g = render(ch,f); if (g) ro.push({v,g}) } }
    if (!rd.length) return { error: 'no-refs' }
    const iou = (a,b) => { let I=0,U=0; for (let i=0;i<a.length;i++){ if(a[i]&&b[i])I++; if(a[i]||b[i])U++ } return U?I/U:0 }
    const best = (g,refs) => { const sc = new Map()
      for (const r of refs) { const s = iou(g,r.g); if (s > (sc.get(r.v) ?? 0)) sc.set(r.v,s) }
      const so = [...sc.entries()].sort((p,q)=>q[1]-p[1]); return { value: so[0]?.[0] ?? '', score: so[0]?.[1] ?? 0 } }
    const syms = []
    for (let i = 0; i < boxes.length; i++) { const b = boxes[i]
      const g = gridOf(ink, b.x0, b.x1, b.y0, b.y1)
      const isOp = boxes.length === 3 && i === 1
      const r = best(g, isOp ? ro : rd)
      syms.push({ value: r.value, score: r.score }) }
    return { symbols: syms, expr: syms.map(s=>s.value).join(''), boxes: boxes.length }
  }, IMG_SEL).catch(e => ({ error: String(e).slice(0,60) }))
}

/**
 * پر کردن یک گام «شخص» (فرستنده یا گیرنده) و رفتن به گام بعد.
 * نوع همیشه «حقیقی» انتخاب می‌شود.
 */
async function fillPersonStep(page, cfg, person, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }
  const invalidFields = []

  // بررسی محلی قبل از تایپ — جلوی رفت‌وبرگشت بیهوده را می‌گیرد
  if (verbose) validatePerson(person, cfg.label)

  // --- نوع: همیشه حقیقی (value=1) ---
  await page.selectOption(cfg.typeSel, '1').catch(() => {})
  await page.evaluate((sel) => {
    const s = document.querySelector(sel)
    if (!s) return
    s.value = '1'
    s.dispatchEvent(new Event('input',  { bubbles: true }))
    s.dispatchEvent(new Event('change', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(s).val('1').trigger('change') } catch (e) {} }
  }, cfg.typeSel).catch(() => {})
  await page.waitForTimeout(450)

  // باز کردن div‌های hidden در صورت نیاز
  const opened = await page.evaluate((ids) => {
    const done = []
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el && el.classList.contains('hidden')) { el.classList.remove('hidden'); done.push(id) }
    }
    return done
  }, cfg.wrapperIds).catch(() => [])
  if (opened.length) log(`   ⚠ JS سایت باز نکرد، دستی نمایان شد: ${opened.join(', ')}`)
  await page.waitForTimeout(150)

  const vis = async (sel) => page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return false
    let n = el
    while (n) {
      const st = getComputedStyle(n)
      if (st.display === 'none' || st.visibility === 'hidden') return false
      if (n.classList && (n.classList.contains('hidden') || n.classList.contains('d-none'))) return false
      n = n.parentElement
    }
    return true
  }, sel).catch(() => false)

  const fields = [
    [cfg.firstName,  person.firstName,  'نام'],
    [cfg.lastName,   person.lastName,   'نام خانوادگی'],
    [cfg.mobile,     person.mobile,     'موبایل'],
    [cfg.nationalId, person.nationalId, 'کد ملی'],
    [cfg.tell,       person.phone,      'تلفن'],
    [cfg.postalCode, person.postalCode, 'کدپستی'],
  ]

  for (const [sel, val, label] of fields) {
    if (!val) { log(`   – ${label.padEnd(14)} (خالی)`); continue }
    const el = await page.$(sel)
    if (!el) { log(`   ✖ ${label.padEnd(14)} سلکتور نیست: ${sel}`); continue }

    let visible = await vis(sel)
    if (!visible) {
      await page.evaluate((s) => {
        let n = document.querySelector(s)
        while (n) {
          if (n.classList) { n.classList.remove('hidden'); n.classList.remove('d-none') }
          if (n.style && n.style.display === 'none') n.style.display = ''
          n = n.parentElement
        }
      }, sel).catch(() => {})
      await page.waitForTimeout(80)
      visible = await vis(sel)
    }
    if (!visible) { log(`   – ${label.padEnd(14)} مخفی (رد شد)`); continue }

    await el.click({ clickCount: 3 }).catch(() => {})
    await el.fill('').catch(() => {})
    await el.type(String(val), { delay: 12 })
    await page.evaluate((s) => {
      const i = document.querySelector(s); if (!i) return
      i.dispatchEvent(new Event('input',  { bubbles: true }))
      i.dispatchEvent(new Event('change', { bubbles: true }))
      i.dispatchEvent(new Event('blur',   { bubbles: true }))
      if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
    }, sel).catch(() => {})

    const got = await page.evaluate(s => document.querySelector(s)?.value ?? '', sel)
    const ok = got === String(val) || got.replace(/\D/g, '') === String(val).replace(/\D/g, '')

    // پیام خطای خود سایت برای همین فیلد
    const fieldErr = await page.evaluate((s) => {
      const inp = document.querySelector(s)
      if (!inp) return ''
      const name = inp.getAttribute('data-fv-field') || inp.name
      if (!name) return ''
      for (const el of document.querySelectorAll(`small.help-block[data-fv-for="${name}"]`)) {
        if (el.getAttribute('data-fv-result') === 'INVALID' || el.offsetParent !== null) {
          const t = (el.innerText || '').trim()
          if (t) return t
        }
      }
      return ''
    }, sel).catch(() => '')

    if (fieldErr) {
      log(`   ✖ ${label.padEnd(14)} "${got}"  ← ${fieldErr}`)
      invalidFields.push({ label, value: got, error: fieldErr })
    } else {
      log(`   ${ok ? '✔' : '✖'} ${label.padEnd(14)} "${got}"`)
    }
  }

  await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
  await page.waitForTimeout(200)

  const nb = await page.$(cfg.nextBtn)
  if (!nb) { log(`   ✖ ${cfg.nextBtn} پیدا نشد`); return false }
  await nb.click().catch(() => {})
  await page.waitForTimeout(2000)

  const active = await page.evaluate((id) => {
    const p = document.getElementById(id)
    return !!(p && p.classList.contains('active'))
  }, cfg.nextPane).catch(() => false)

  if (!active) {
    log('   ✖ گام بعد باز نشد — خطاهای اعتبارسنجی:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block').forEach(e => {
        if (e.offsetParent !== null && e.innerText.trim()) o.push(e.innerText.trim())
      })
      return o.slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    if (invalidFields.length) {
      log('   ── فیلدهای مشکل‌دار ──')
      invalidFields.forEach(f => log(`      ✖ ${f.label}: "${f.value}" → ${f.error}`))
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}


/* ═══════════════ گام ۳: راننده و خودرو ═══════════════
   دو حالت دارد:
     A) «تجمیعی» — #frmpelaqTajmi دیده می‌شود:
        پلاک از #PelakComboTajmi و راننده از #DriverListTajmi انتخاب می‌شوند.
        مقدار هر آپشن پلاک یک JSON کامل است.
     B) «دستی» — #frmpelaq (اگر d-none نداشته باشد):
        اجزای پلاک تک‌تک تایپ می‌شوند + کد ملی راننده در #txtDriverSearch
   ══════════════════════════════════════════════════════ */

const PLATE_LETTERS = {
  'الف':'1','ب':'2','پ':'3','ت':'4','ث':'5','ج':'6','چ':'7','ح':'8','خ':'9','د':'10',
  'ذ':'11','ر':'12','ز':'13','ژ':'14','س':'15','ش':'16','ص':'17','ض':'18','ط':'19',
  'ظ':'20','ع':'21','غ':'22','ف':'23','ق':'24','ک':'25','گ':'26','ل':'27','م':'28',
  'ن':'29','و':'30','ه':'31','ی':'32',
}

/** ارقام فارسی/عربی → لاتین */
function toLatin(v) {
  return String(v ?? '')
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
}

async function fillDriverVehicleStep(page, driver, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }

  const mode = await page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false
      if (el.classList.contains('d-none')) return false
      const s = getComputedStyle(el)
      return s.display !== 'none' && s.visibility !== 'hidden'
    }
    return {
      tajmi:  vis(document.getElementById('frmpelaqTajmi')),
      manual: vis(document.getElementById('frmpelaq')),
      hasCombo: !!document.getElementById('PelakComboTajmi'),
      plateOptions: Array.from(document.querySelectorAll('#PelakComboTajmi option'))
        .map(o => (o.textContent || '').trim()).filter(Boolean),
      driverOptions: Array.from(document.querySelectorAll('#DriverListTajmi option'))
        .map(o => (o.textContent || '').trim()).filter(Boolean),
    }
  }).catch(() => null)

  if (!mode) { log('   ✖ وضعیت گام ۳ خوانده نشد'); return false }
  log(`   حالت: ${mode.tajmi ? 'تجمیعی (انتخاب از لیست)' : (mode.manual ? 'دستی' : 'نامشخص')}`)

  /* ── انتظار برای فهرست پلاک (AJAX) ──
     گزینه‌های *واقعی* شمرده می‌شوند نه کل option ها، چون گزینه‌ی
     «انتخاب کنید» همیشه هست و باعث می‌شد حلقه زودتر از موعد بشکند. */
  log('   ⏱ صبر تا فهرست پلاک‌ها بیاید...')
  await page.waitForTimeout(1500)

  let plateCount = 0
  for (let i = 0; i < 40; i++) {
    plateCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#PelakComboTajmi option'))
        .filter(o => o.value && o.value !== '0').length).catch(() => 0)
    if (plateCount > 0) break
    await page.waitForTimeout(500)
  }
  if (plateCount > 0) log(`   ⓘ ${plateCount} پلاک در فهرست`)

  // فهرست را دوباره بخوان (ممکن است تازه پر شده باشد)
  mode.plateOptions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#PelakComboTajmi option'))
      .map(o => (o.textContent || '').trim()).filter(Boolean)).catch(() => mode.plateOptions)
  let ok = false

  /* ---------- حالت A: انتخاب از لیست ---------- */
  if (mode.tajmi && mode.hasCombo) {
    log(`   پلاک‌های موجود: ${mode.plateOptions.length ? mode.plateOptions.join(' | ') : '(خالی)'}`)

    // پلاک را با تطبیق ارقام پیدا کن (نه متن خام، چون قالبش فرق دارد)
    const want = [driver.plate.twoDigit, driver.plate.threeDigit, driver.plate.iran].map(toLatin)
    const picked = await page.evaluate(({ want }) => {
      const sel = document.getElementById('PelakComboTajmi')
      if (!sel) return null
      const norm = (t) => String(t)
        .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/\D/g, '')
      for (const o of Array.from(sel.options)) {
        if (!o.value) continue
        // ۱) از JSON مقدار
        try {
          const j = JSON.parse(o.value)
          if (String(j.irTagPart1) === want[0] &&
              String(j.irTagPart4) === want[1] &&
              String(j.irTagPart2) === want[2]) {
            sel.value = o.value
            sel.dispatchEvent(new Event('change', { bubbles: true }))
            if (window.jQuery) { try { window.jQuery(sel).val(o.value).trigger('change') } catch (e) {} }
            return { text: (o.textContent || '').trim(), via: 'json' }
          }
        } catch (e) { /* not json */ }
        // ۲) تطبیق ارقام متن
        const d = norm(o.textContent)
        if (want.every(w => d.includes(w))) {
          sel.value = o.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
          if (window.jQuery) { try { window.jQuery(sel).val(o.value).trigger('change') } catch (e) {} }
          return { text: (o.textContent || '').trim(), via: 'text' }
        }
      }
      return null
    }, { want }).catch(() => null)

    if (!picked) {
      const real = mode.plateOptions.filter(t => /\d/.test(t))
      if (real.length === 0) {
        const sw = await waitForSwalError(page, 2500)
        log(`   ✖ فهرست پلاک‌ها خالی است${sw ? ` — خطای سایت: ${sw}` : ' (سایت پاسخ نداد)'}`)
        log('      → مشکل موقتی: باید مرورگر بسته و ۱۰ تا ۱۵ دقیقه صبر شود')
      } else {
        log(`   ✖ پلاک «${driver.plateText}» در لیست پیدا نشد`)
        log(`      فهرست موجود: ${real.join(' | ')}`)
        log('      → باید ابتدا در خود سامانه به ناوگان اضافه شود')
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-noplate.png`), fullPage: true }).catch(() => {})
      return false
    }
    log(`   ✔ پلاک انتخاب شد: ${picked.text}  (${picked.via})`)

    /* ── انتظار برای پر شدن فهرست راننده (AJAX) ──
       سرعت پاسخ سایت هر بار فرق می‌کند؛ تا ۲۰ ثانیه فعالانه صبر می‌کنیم
       و اگر نیامد صریحا خطا می‌دهیم (قبلا بی‌صدا رد می‌شد و همین باعث
       می‌شد یک بار کار کند و بار بعد نه). */
    await page.waitForTimeout(1200)
    let drvCount = 0
    for (let i = 0; i < 40; i++) {
      drvCount = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#DriverListTajmi option'))
          .filter(o => o.value && o.value !== '0').length).catch(() => 0)
      if (drvCount > 0) break
      await page.waitForTimeout(500)
    }

    if (drvCount === 0) {
      const sw = await waitForSwalError(page, 2000)
      log(`   ✖ فهرست راننده‌ها بعد از ۲۰ ثانیه هنوز خالی است${sw ? ` — خطای سایت: ${sw}` : ''}`)
      log('      → یا سایت کند/مشغول است، یا برای این پلاک راننده‌ای ثبت نشده')
      await page.screenshot({ path: path.join(OUT, `${tag}-nodriverlist.png`), fullPage: true }).catch(() => {})
      return false
    }
    log(`   ⓘ ${drvCount} راننده در فهرست`)

    const drv = await page.evaluate(({ name, nid }) => {
      const sel = document.getElementById('DriverListTajmi')
      if (!sel) return null

      /* یکسان‌سازی حروف عربی/فارسی — مهم‌ترین بخش.
         سایت «علي» می‌دهد (ي عربی U+064A) ولی کاربر «علی» تایپ می‌کند
         (ی فارسی U+06CC). همین یک کاراکتر تطبیق را خراب می‌کرد. */
      const fold = (t) => String(t || '')
        .replace(/[\u064A\u0649]/g, '\u06CC')   // ي , ى  →  ی
        .replace(/\u0643/g, '\u06A9')           // ك      →  ک
        .replace(/[\u0622\u0623\u0625]/g, '\u0627') // آ أ إ →  ا
        .replace(/\u0629/g, '\u0647')           // ة      →  ه
        .replace(/[\u064B-\u0652\u0640]/g, '')  // اعراب و کشیده
        .replace(/[\u200c\u200f\u200e]/g, ' ')  // نیم‌فاصله
        .replace(/\s+/g, ' ')
        .trim()

      const digits = (t) => String(t || '')
        .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/\D/g, '')

      const opts = Array.from(sel.options).filter(o => o.value && o.value !== '0')
      const wantName = fold(name)
      const wantNid = digits(nid)
      // نام را به کلمات بشکن تا ترتیب نام/فامیل مهم نباشد
      const wantParts = wantName.split(' ').filter(w => w.length > 1)

      let hit = null, via = ''

      // ۱) کد ملی — مطمئن‌ترین راه (هم در JSON مقدار، هم در متن)
      if (!hit && wantNid) {
        for (const o of opts) {
          let nidInJson = ''
          try { nidInJson = digits(JSON.parse(o.value).driverNationalCode) } catch (e) {}
          if (nidInJson === wantNid || digits(o.value).includes(wantNid) || digits(o.textContent).includes(wantNid)) {
            hit = o; via = 'کد ملی'; break
          }
        }
      }

      // ۲) نام کامل
      if (!hit && wantName) {
        for (const o of opts) {
          const t = fold(o.textContent)
          if (t === wantName || t.includes(wantName)) { hit = o; via = 'نام کامل'; break }
        }
      }

      // ۳) همه‌ی کلمات نام (ترتیب مهم نیست)
      if (!hit && wantParts.length) {
        for (const o of opts) {
          const t = fold(o.textContent)
          if (wantParts.every(w => t.includes(w))) { hit = o; via = 'اجزای نام'; break }
        }
      }

      // ۴) نام داخل JSON مقدار
      if (!hit && wantParts.length) {
        for (const o of opts) {
          let j = null
          try { j = JSON.parse(o.value) } catch (e) { continue }
          const full = fold(`${j.driverName || ''} ${j.driverLastName || ''}`)
          if (wantParts.every(w => full.includes(w))) { hit = o; via = 'JSON'; break }
        }
      }

      // ۵) اگر فقط یک راننده هست، همان
      if (!hit && opts.length === 1) { hit = opts[0]; via = 'تنها گزینه' }

      if (!hit) {
        return { list: opts.map(o => String(o.textContent || '').replace(/\s+/g, ' ').trim()) }
      }

      sel.value = hit.value
      sel.dispatchEvent(new Event('input', { bubbles: true }))
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      if (window.jQuery) { try { window.jQuery(sel).val(hit.value).trigger('change') } catch (e) {} }

      return {
        text: String(hit.textContent || '').replace(/\s+/g, ' ').trim(),
        via,
        applied: sel.value === hit.value,
      }
    }, { name: driver.name, nid: driver.nationalId }).catch(() => null)

    if (!drv || !drv.text) {
      log(`   ✖ راننده «${driver.name}»${driver.nationalId ? ` / ${driver.nationalId}` : ''} در فهرست پیدا نشد`)
      if (drv && drv.list) {
        log('      فهرست موجود در سایت:')
        drv.list.forEach(t => log(`         • ${t}`))
        log('      → اسم را دقیقا مطابق یکی از بالا در پروفایل بنویس،')
        log('        یا کد ملی راننده را وارد کن (مطمئن‌تر است)')
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-nodriver.png`), fullPage: true }).catch(() => {})
      return false
    }
    log(`   ✔ راننده انتخاب شد: ${drv.text}   (تطبیق با ${drv.via})`)

    // تایید اینکه سایت انتخاب را واقعا پذیرفته و فیلدها را پر کرده
    await page.waitForTimeout(1200)
    for (let i = 0; i < 16; i++) {
      const filled = await page.evaluate(() =>
        !!((document.getElementById('DriverFullNameTajmi') || {}).value || '').trim()).catch(() => false)
      if (filled) break
      await page.waitForTimeout(500)
    }

    const info = await page.evaluate(() => {
      const g = (id) => (document.getElementById(id) || {}).value || ''
      return {
        name: g('DriverFullNameTajmi'), license: g('DriverNumberDriverLicenseTajmi'),
        mobile: g('DriverMobileTajmi'),
        capFrom: g('CapacityTajmi'), capTo: g('CapacityTajmiTo'),
        loader: g('TypeofLoaderTajmi'), insurance: g('ThirdPartyInsuranceTajmi'),
      }
    }).catch(() => ({}))
    if (info.name)    log(`      راننده : ${info.name}${info.mobile ? ' | ' + info.mobile : ''}`)
    if (info.capFrom) log(`      ظرفیت  : ${info.capFrom} تا ${info.capTo}${info.loader ? ' | ' + info.loader : ''}`)
    ok = true
  }

  /* ---------- حالت B: ورود دستی ---------- */
  else if (mode.manual) {
    const letterVal = PLATE_LETTERS[driver.plate.letter] || ''
    if (!letterVal) log(`   ⚠ حرف پلاک «${driver.plate.letter}» شناخته نشد`)

    const typeInto = async (sel, val) => {
      const el = await page.$(sel)
      if (!el || !val) return false
      await el.click({ clickCount: 3 }).catch(() => {})
      await el.fill('').catch(() => {})
      await el.type(String(val), { delay: 12 })
      await page.evaluate((s) => {
        const i = document.querySelector(s); if (!i) return
        i.dispatchEvent(new Event('input', { bubbles: true }))
        i.dispatchEvent(new Event('change', { bubbles: true }))
        i.dispatchEvent(new Event('blur', { bubbles: true }))
        if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
      }, sel).catch(() => {})
      return true
    }

    await typeInto('#pelakIrNum',  driver.plate.twoDigit)
    await typeInto('#pelakCenter', driver.plate.threeDigit)
    if (letterVal) {
      await page.selectOption('#pelakCombo', letterVal).catch(() => {})
      await page.evaluate((v) => {
        const s = document.getElementById('pelakCombo'); if (!s) return
        s.value = v; s.dispatchEvent(new Event('change', { bubbles: true }))
        if (window.jQuery) { try { window.jQuery(s).val(v).trigger('change') } catch (e) {} }
      }, letterVal).catch(() => {})
    }
    await typeInto('#pelakFirst', driver.plate.iran)
    log(`   ✔ پلاک تایپ شد: ${driver.plate.twoDigit} ${driver.plate.letter} ${driver.plate.threeDigit} ایران ${driver.plate.iran}`)

    await typeInto('#txtDriverSearch', driver.nationalId)
    log(`   ✔ کد ملی راننده: ${driver.nationalId}`)
    await page.waitForTimeout(1500)

    const shown = await page.evaluate(() =>
      (document.getElementById('DriverFullName') || {}).value || '').catch(() => '')
    if (shown) log(`      راننده شناسایی شد: ${shown}`)
    ok = true
  } else {
    log('   ✖ هیچ‌کدام از فرم‌های پلاک قابل مشاهده نیست')
    await page.screenshot({ path: path.join(OUT, `${tag}-nomode.png`), fullPage: true }).catch(() => {})
    return false
  }

  await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
  await page.waitForTimeout(200)

  const nb = await page.$('#btnGoLVL4')
  if (!nb) { log('   ✖ #btnGoLVL4 پیدا نشد'); return false }
  await nb.click().catch(() => {})
  await page.waitForTimeout(2200)

  const active = await page.evaluate(() => {
    const p = document.getElementById('pills-4')
    return !!(p && p.classList.contains('active'))
  }).catch(() => false)

  if (!active) {
    log('   ✖ گام ۴ باز نشد — خطاها:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block, #pelakinvalidtotal').forEach(e => {
        if (e.offsetParent !== null && e.innerText.trim()) o.push(e.innerText.trim())
      })
      return Array.from(new Set(o)).slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}


/* ═══════════════ گام ۴: مشخصات کالا ═══════════════
   جریان متفاوت با بقیه:
     ۱) کلیک #btnAddLoad → مودال «ثبت کالا» باز می‌شود
     ۲) #txtLoadName یک autocomplete جی‌کوئری است؛ باید تایپ کرد،
        منتظر لیست پیشنهاد ماند و یک گزینه را کلیک کرد.
     ۳) وزن + نوع بسته‌بندی + تعداد → کلیک #btnInsertLoad
     ۴) مودال بسته می‌شود و ردیف در #gridfullLoaddata می‌نشیند
     ۵) ارزش بار در #txtLoadsValue → کلیک #btnGoLVL5
   ═════════════════════════════════════════════════ */

const BOX_TYPES = {
  'کارتن':'8','جعبه':'9','کیسه':'10','گونی':'11','جامبو':'12','بشکه':'18072',
  'رول':'18073','فله':'18074','عدل':'18075','شاخه':'18076','سایر':'18077',
}

async function fillCargoStep(page, cargo, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }

  // ---------- ۱) باز کردن مودال ----------
  const addBtn = await page.$('#btnAddLoad')
  if (!addBtn) { log('   ✖ دکمه «افزودن کالای جدید» پیدا نشد'); return false }
  await addBtn.click().catch(() => {})

  let modalOpen = false
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300)
    modalOpen = await page.evaluate(() => {
      const el = document.getElementById('txtLoadName')
      return !!(el && el.offsetParent !== null)
    }).catch(() => false)
    if (modalOpen) break
  }
  if (!modalOpen) { log('   ✖ مودال «ثبت کالا» باز نشد'); return false }
  log('   ✔ مودال ثبت کالا باز شد')
  await page.waitForTimeout(400)

  // ---------- ۲) نام کالا از autocomplete ----------
  const nameEl = await page.$('#txtLoadName')
  if (!nameEl) { log('   ✖ #txtLoadName نیست'); return false }
  await nameEl.click({ clickCount: 3 }).catch(() => {})
  await nameEl.fill('').catch(() => {})
  await nameEl.type(String(cargo.name), { delay: 110 })   // آهسته تا AJAX جستجو تحریک شود
  await page.evaluate(() => {
    const i = document.getElementById('txtLoadName'); if (!i) return
    i.dispatchEvent(new Event('input', { bubbles: true }))
    i.dispatchEvent(new Event('keyup', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(i).trigger('keydown').trigger('keyup') } catch (e) {} }
  }).catch(() => {})

  // منتظر لیست پیشنهادها
  let picked = null
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(300)
    picked = await page.evaluate((want) => {
      const lists = document.querySelectorAll('ul.ui-autocomplete, .ui-menu, .ui-autocomplete')
      for (const ul of lists) {
        if (ul.offsetParent === null) continue
        const items = Array.from(ul.querySelectorAll('li'))
          .filter(li => (li.innerText || '').trim())
        if (!items.length) continue
        const exact = items.find(li => (li.innerText || '').trim() === want)
        const target = exact || items[0]
        const a = target.querySelector('a') || target
        a.click()
        return (target.innerText || '').trim()
      }
      return null
    }, cargo.name).catch(() => null)
    if (picked) break
  }

  if (picked) {
    log(`   ✔ نام کالا از لیست انتخاب شد: «${picked}»`)
  } else {
    log(`   ⚠ لیست پیشنهاد ظاهر نشد — مقدار تایپ‌شده باقی ماند`)
  }
  await page.waitForTimeout(500)

  const chosen = await page.evaluate(() => ({
    text: (document.getElementById('txtLoadName') || {}).value || '',
    hidden: (document.getElementById('selecteditme') || {}).value || '',
  })).catch(() => ({ text: '', hidden: '' }))
  log(`      فیلد نام: "${chosen.text}"${chosen.hidden ? ` | کد: ${chosen.hidden}` : ' | ⚠ کد انتخاب خالی است'}`)

  // ---------- ۳) وزن، بسته‌بندی، تعداد ----------
  const setVal = async (sel, val) => {
    if (!val) return
    const el = await page.$(sel); if (!el) { log(`   ✖ ${sel} نیست`); return }
    await el.click({ clickCount: 3 }).catch(() => {})
    await el.fill('').catch(() => {})
    await el.type(String(val), { delay: 12 })
    await page.evaluate((s) => {
      const i = document.querySelector(s); if (!i) return
      i.dispatchEvent(new Event('input', { bubbles: true }))
      i.dispatchEvent(new Event('change', { bubbles: true }))
      i.dispatchEvent(new Event('blur', { bubbles: true }))
      if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
    }, sel).catch(() => {})
  }

  await setVal('#txtWeight', cargo.weightTon)
  log(`   ✔ وزن: ${cargo.weightTon} تن`)

  const boxVal = BOX_TYPES[cargo.packaging] || BOX_TYPES['سایر']
  await page.selectOption('#ddBoxType', boxVal).catch(() => {})
  await page.evaluate((v) => {
    const s = document.getElementById('ddBoxType'); if (!s) return
    s.value = v
    s.dispatchEvent(new Event('change', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(s).val(v).trigger('change') } catch (e) {} }
  }, boxVal).catch(() => {})
  log(`   ✔ بسته‌بندی: ${cargo.packaging} (value=${boxVal})`)

  await setVal('#txtBoxNum', cargo.count)
  log(`   ✔ تعداد بسته: ${cargo.count}`)

  if (cargo.detail) await setVal('#txtLoadDetail', cargo.detail)

  await page.screenshot({ path: path.join(OUT, `${tag}-modal.png`), fullPage: true }).catch(() => {})

  // ---------- ۴) ثبت کالا ----------
  const insBtn = await page.$('#btnInsertLoad')
  if (!insBtn) { log('   ✖ #btnInsertLoad نیست'); return false }
  await insBtn.click().catch(() => {})
  await page.waitForTimeout(1500)

  // مودال باید بسته شود و ردیف اضافه شود
  let rows = 0
  for (let i = 0; i < 16; i++) {
    rows = await page.evaluate(() =>
      document.querySelectorAll('#gridfullLoaddata tr').length).catch(() => 0)
    if (rows > 0) break
    await page.waitForTimeout(400)
  }

  if (rows === 0) {
    log('   ✖ کالا به جدول اضافه نشد — خطاهای مودال:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block, #spanvalidation, #txtLoadNameValidationSpan').forEach(e => {
        if (e.offsetParent !== null && (e.innerText || '').trim()) o.push(e.innerText.trim())
      })
      return Array.from(new Set(o)).slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    await page.screenshot({ path: path.join(OUT, `${tag}-modal-error.png`), fullPage: true }).catch(() => {})
    return false
  }
  log(`   ✔ کالا ثبت شد (${rows} ردیف در جدول)`)

  // مودال ممکن است هنوز باز باشد
  await page.evaluate(() => {
    const b = document.querySelector('.modal.show [data-bs-dismiss="modal"]')
    if (b) b.click()
  }).catch(() => {})
  await page.waitForTimeout(700)

  // ---------- ۵) ارزش بار + مرحله بعد ----------
  await setVal('#txtLoadsValue', cargo.value)
  const shown = await page.evaluate(() =>
    (document.getElementById('txtLoadsValue') || {}).value || '').catch(() => '')
  log(`   ✔ ارزش بار: ${shown}`)

  await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
  await page.waitForTimeout(200)

  const nb = await page.$('#btnGoLVL5')
  if (!nb) { log('   ✖ #btnGoLVL5 نیست'); return false }
  await nb.click().catch(() => {})
  await page.waitForTimeout(2200)

  const active = await page.evaluate(() => {
    const p = document.getElementById('pills-5')
    return !!(p && p.classList.contains('active'))
  }).catch(() => false)

  if (!active) {
    log('   ✖ گام ۵ باز نشد — خطاها:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block, #LoadNumberMinValidator').forEach(e => {
        if (e.offsetParent !== null && (e.innerText || '').trim()) o.push(e.innerText.trim())
      })
      return Array.from(new Set(o)).slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}


/* ═══════════ گام ۵/۶: مبدا و مقصد ═══════════
   نکته: سایت به‌طور پیش‌فرض حالت «نقشه» را نشان می‌دهد و بخش
   #normalmabda / #normalmagsad کلاس d-none دارد. ما آن را نمایان
   می‌کنیم تا بتوانیم استان/شهر/آدرس را مستقیم پر کنیم.
   شهر با AJAX بعد از انتخاب استان پر می‌شود.
   ═══════════════════════════════════════════ */

const PROVINCES = {
  'آذربایجان شرقی':'4','آذربایجان شرقى':'4','آذربایجان غربی':'5','آذربایجان غربى':'5',
  'اردبیل':'25','اصفهان':'11','البرز':'31','ایلام':'18','بوشهر':'22','تهران':'1',
  'چهارمحال و بختیاری':'16','چهارمحال و بختیارى':'16','خراسان جنوبی':'30',
  'خراسان رضوی':'10','خراسان شمالی':'29','خوزستان':'7','زنجان':'20','سمنان':'23',
  'سیستان و بلوچستان':'12','فارس':'8','قزوین':'27','قم':'26','گلستان':'28','گیلان':'2',
  'لرستان':'17','مازندران':'3','مرکزی':'24','مرکزى':'24','هرمزگان':'14','همدان':'15',
  'کردستان':'13','کرمان':'9','کرمانشاه':'6','کهگیلویه و بویر احمد':'19','یزد':'21',
}

async function unhide(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i)
    if (el) { el.classList.remove('d-none'); el.classList.remove('hidden') }
  }, id).catch(() => {})
}

async function pickSelect(page, sel, value) {
  await page.selectOption(sel, value).catch(() => {})
  await page.evaluate(({ s, v }) => {
    const el = document.querySelector(s); if (!el) return
    el.value = v
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(el).val(v).trigger('change') } catch (e) {} }
  }, { s: sel, v: value }).catch(() => {})
}

/** انتخاب شهر از لیستی که با AJAX پر می‌شود */
async function pickCity(page, sel, cityName) {
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate((s) =>
      document.querySelectorAll(s + ' option').length, sel).catch(() => 0)
    if (n > 1) break
    await page.waitForTimeout(400)
  }
  return page.evaluate(({ s, want }) => {
    const el = document.querySelector(s); if (!el) return null
    const clean = (t) => String(t).replace(/[\u200c\s]+/g, ' ').trim()
    const target = clean(want)
    let hit = null
    for (const o of Array.from(el.options)) {
      if (!o.value) continue
      const t = clean(o.textContent)
      if (t === target) { hit = o; break }
    }
    if (!hit) for (const o of Array.from(el.options)) {
      if (!o.value) continue
      if (clean(o.textContent).includes(target)) { hit = o; break }
    }
    if (!hit) return { list: Array.from(el.options).map(o => clean(o.textContent)).slice(0, 12) }
    el.value = hit.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(el).val(hit.value).trigger('change') } catch (e) {} }
    return { text: clean(hit.textContent) }
  }, { s: sel, want: cityName }).catch(() => null)
}

async function fillLocationStep(page, cfg, loc, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }

  await unhide(page, cfg.wrapperId)
  await page.waitForTimeout(300)

  const pv = PROVINCES[loc.province]
  if (!pv) { log(`   ✖ استان «${loc.province}» شناخته نشد`); return false }
  await pickSelect(page, cfg.state, pv)
  log(`   ✔ استان: ${loc.province} (${pv})`)
  await page.waitForTimeout(800)

  const city = await pickCity(page, cfg.city, loc.city)
  if (!city || !city.text) {
    log(`   ✖ شهر «${loc.city}» پیدا نشد`)
    if (city && city.list) log(`      موجود: ${city.list.join(' | ')}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-nocity.png`), fullPage: true }).catch(() => {})
    return false
  }
  log(`   ✔ شهر: ${city.text}`)

  const setVal = async (sel, val) => {
    if (!val) return
    const el = await page.$(sel); if (!el) return
    await el.click({ clickCount: 3 }).catch(() => {})
    await el.fill('').catch(() => {})
    await el.type(String(val), { delay: 10 })
    await page.evaluate((s) => {
      const i = document.querySelector(s); if (!i) return
      i.dispatchEvent(new Event('input', { bubbles: true }))
      i.dispatchEvent(new Event('change', { bubbles: true }))
      i.dispatchEvent(new Event('blur', { bubbles: true }))
      if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
    }, sel).catch(() => {})
  }

  if (loc.postalCode) await setVal(cfg.postal, loc.postalCode)
  await setVal(cfg.address, loc.address)
  log(`   ✔ آدرس: ${loc.address}`)

  await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
  await page.waitForTimeout(200)

  const nb = await page.$(cfg.nextBtn)
  if (!nb) { log(`   ✖ ${cfg.nextBtn} نیست`); return false }
  await nb.click().catch(() => {})
  await page.waitForTimeout(2200)

  const active = await page.evaluate((id) => {
    const el = document.getElementById(id)
    return !!(el && el.classList.contains('active'))
  }, cfg.nextPane).catch(() => false)

  if (!active) {
    log('   ✖ گام بعد باز نشد:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block').forEach(e => {
        if (e.offsetParent !== null && (e.innerText || '').trim()) o.push(e.innerText.trim())
      })
      return Array.from(new Set(o)).slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}

const STEP_ORIGIN = {
  label: 'گام ۵: مبدا بارگیری', wrapperId: 'normalmabda',
  state: '#ddStateSource', city: '#ddCitySource',
  postal: '#sourcePostalCode', address: '#txtAddressSource',
  nextBtn: '#btnGoLVL6', nextPane: 'pills-6',
}
const STEP_DEST = {
  label: 'گام ۶: مقصد تخلیه', wrapperId: 'normalmagsad',
  state: '#ddStateDest', city: '#ddCityDest',
  postal: '#destPostalCode', address: '#txtAddressDest',
  nextBtn: '#btnGoLVL7', nextPane: 'pills-7',
}

/* ═══════════ گام ۷: فقط نمایش ═══════════ */
async function passReviewStep(page, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }
  const info = await page.evaluate(() => ({
    src: (document.getElementById('txtAddressSourceView') || {}).value || '',
    dst: (document.getElementById('txtAddressDestView') || {}).value || '',
  })).catch(() => ({ src: '', dst: '' }))
  if (info.src) log(`   مبدا: ${info.src}`)
  if (info.dst) log(`   مقصد: ${info.dst}`)

  const ok = await page.evaluate(() => {
    const b = document.querySelector('#pills-7 button.btn-next[data-to="#pills-8-tab"]')
    if (!b) return false
    b.click(); return true
  }).catch(() => false)
  if (!ok) { log('   ✖ دکمه مرحله بعد پیدا نشد'); return false }
  await page.waitForTimeout(2000)

  return page.evaluate(() => {
    const el = document.getElementById('pills-8')
    return !!(el && el.classList.contains('active'))
  }).catch(() => false)
}

/* ═══════════ گام ۸: کرایه ═══════════ */

/**
 * ساعت جاری تهران را از خود مرورگر می‌خواند و `plusMin` دقیقه جلوتر می‌برد.
 * سایت اجازه نمی‌دهد زمان بارگیری از ساعت فعلی کمتر باشد:
 *   «زمان بارگیری نمی تواند قبل از ساعت روز جاری باشد»
 */
async function currentTehranTime(page, plusMin = 10) {
  const now = await page.evaluate(() =>
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Tehran', hour12: false, hour: '2-digit', minute: '2-digit',
    })).catch(() => null)

  let h, m
  const p = now && String(now).match(/(\d{1,2}):(\d{2})/)
  if (p) { h = +p[1] % 24; m = +p[2] }
  else { const d = new Date(Date.now() + 3.5 * 3600 * 1000); h = d.getUTCHours(); m = d.getUTCMinutes() }

  let total = h * 60 + m + plusMin
  // اگر از نیمه‌شب رد شد، روی ۲۳:۵۵ همین روز بایست
  if (total >= 24 * 60) total = 23 * 60 + 55
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function fillFareStep(page, fare, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }

  const setVal = async (sel, val) => {
    if (val === undefined || val === null || val === '') return
    const el = await page.$(sel); if (!el) return
    const dis = await page.evaluate((s) => !!document.querySelector(s)?.disabled, sel).catch(() => false)
    if (dis) return
    await el.click({ clickCount: 3 }).catch(() => {})
    await el.fill('').catch(() => {})
    await el.type(String(val), { delay: 10 })
    await page.evaluate((s) => {
      const i = document.querySelector(s); if (!i) return
      i.dispatchEvent(new Event('input', { bubbles: true }))
      i.dispatchEvent(new Event('change', { bubbles: true }))
      i.dispatchEvent(new Event('blur', { bubbles: true }))
      if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
    }, sel).catch(() => {})
    // دیتاپیکر ممکن است پاپ‌آپ باز کند — ببندش
    await page.keyboard.press('Escape').catch(() => {})
  }

  await setVal('#txtkeraye', fare.amount)
  log(`   ✔ کرایه: ${fare.amount}`)
  if (fare.prepaid) await setVal('#txtPishKeraye', fare.prepaid)

  const dt = await page.evaluate(() =>
    (document.getElementById('loadingDate') || {}).value || '').catch(() => '')
  if (dt) log(`      تاریخ (از سایت): ${dt}`)

  /* ── ساعت شروع حمل ──
     فیلد اجباری است و نمی‌تواند از ساعت فعلی عقب‌تر باشد.
     اگر کاربر ساعت نداده (یا ساعتش گذشته) خودمان ساعت تهران + ۱۰ دقیقه می‌گذاریم. */
  const autoTime = await currentTehranTime(page, 10)
  let useTime = String(fare.time || '').trim()

  const toMin = (t) => { const m = toLatin(t).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : -1 }

  if (!useTime) {
    useTime = autoTime
    log(`   ℹ ساعت شروع حمل در پروفایل خالی بود — خودکار: ${useTime}`)
  } else if (toMin(useTime) >= 0 && toMin(useTime) < toMin(autoTime) - 10) {
    log(`   ⚠ ساعت پروفایل (${useTime}) از الان گذشته — به ${autoTime} تغییر یافت`)
    useTime = autoTime
  }

  // تا ۴ بار: اگر سایت گفت زمان عقب است، جلوتر می‌بریم
  const bumps = [0, 15, 45, 90]
  let active = false

  for (let i = 0; i < bumps.length; i++) {
    const t = i === 0 ? useTime : await currentTehranTime(page, 10 + bumps[i])

    await setVal('#loadingTime', t)
    const got = await page.evaluate(() =>
      (document.getElementById('loadingTime') || {}).value || '').catch(() => '')
    log(`   ${got ? '✔' : '✖'} ساعت شروع حمل: "${got}"${i > 0 ? `  (تلاش ${i + 1})` : ''}`)

    if (!got) {
      log('      ✖ فیلد ساعت پر نشد')
      await page.screenshot({ path: path.join(OUT, `${tag}-notime.png`), fullPage: true }).catch(() => {})
      return false
    }

    await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})

    const btn = await page.$('#btnregisterbarname')
    if (!btn) { log('   ✖ #btnregisterbarname نیست'); return false }
    await btn.click().catch(() => {})

    // پاپ‌آپ toast فقط ۵ ثانیه می‌ماند — همزمان با انتظار گام ۹ بپایمش
    let swal = ''
    active = false
    for (let k = 0; k < 20; k++) {
      active = await page.evaluate(() => {
        const el = document.getElementById('pills-9')
        return !!(el && el.classList.contains('active'))
      }).catch(() => false)
      if (active) break
      if (!swal) swal = await readSwalError(page)
      await page.waitForTimeout(250)
    }

    if (active) break
    const timeIssue = /زمان بارگیری|قبل از ساعت|ساعت روز جاری/.test(swal)

    if (timeIssue && i < bumps.length - 1) {
      log(`   ↻ سایت: ${swal}`)
      log('      زمان را جلوتر می‌بریم...')
      await page.evaluate(() => {
        const b = document.querySelector('.swal2-popup .swal2-confirm, .swal2-popup .swal2-close')
        if (b) b.click()
      }).catch(() => {})
      await page.waitForTimeout(1200)
      continue
    }

    if (swal) log(`   ✖ خطای سایت: ${swal}`)
    break
  }

  if (!active) {
    log('   ✖ گام ۹ باز نشد:')
    const errs = await page.evaluate(() => {
      const o = []
      document.querySelectorAll('small.help-block, .alert-danger').forEach(e => {
        if (e.offsetParent !== null && (e.innerText || '').trim()) o.push(e.innerText.trim())
      })
      return Array.from(new Set(o)).slice(0, 8)
    }).catch(() => [])
    errs.forEach(e => log('      • ' + e))
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}

/* ═══════════ گام ۹: تایید + کپچا + ثبت نهایی ═══════════ */
async function finalConfirmStep(page, OUT, tag, opts = {}) {
  const { verbose = true, dryRun = true } = opts
  const log = (m) => { if (verbose) console.log(m) }

  const sum = await page.evaluate(() => {
    const g = (id) => (document.getElementById(id) || {}).value || ''
    return {
      sender: g('rqsSender'), receiver: g('rqsReceiver'), driver: g('rqsDriver'),
      plate: g('rqsPelauq'), origin: g('rqsOrigin'), dest: g('rqsDestination'),
      value: g('rqsValue'), start: g('shippingStartDate'),
    }
  }).catch(() => ({}))
  log('   ── خلاصه بارنامه ──')
  for (const [k, v] of Object.entries(sum)) if (v) log(`      ${k.padEnd(9)}: ${v}`)

  // کپچای نهایی
  let solved = false
  for (let att = 1; att <= 6; att++) {
    const t = await classifyTemplate(page)
    if (t.error) {
      log(`   ✖ کپچا: ${t.error} → تازه‌سازی`)
      await page.evaluate(() => document.getElementById('dntCaptchaRefreshButton')?.click()).catch(() => {})
      await page.waitForTimeout(1800); continue
    }
    const ans = solveMath(t.expr)
    const minS = Math.min(...t.symbols.map(x => x.score))
    log(`   ◈ کپچا: ${t.expr} ⇒ ${ans} (${(minS * 100).toFixed(0)}%)`)
    if (ans === null || minS < 0.42) {
      await page.evaluate(() => document.getElementById('dntCaptchaRefreshButton')?.click()).catch(() => {})
      await page.waitForTimeout(1800); continue
    }
    const ci = await page.$('#DNTCaptchaInputText')
    if (!ci) { log('   ✖ فیلد کپچا نیست'); return false }
    await ci.fill(''); await ci.type(ans, { delay: 35 })
    solved = true; break
  }
  if (!solved) { log('   ✖ کپچای نهایی حل نشد'); return false }

  await page.screenshot({ path: path.join(OUT, `${tag}-ready.png`), fullPage: true }).catch(() => {})

  if (dryRun) {
    log('\n   🛑 حالت آزمایشی — دکمه «ثبت نهایی سند حمل» زده نشد')
    log('      برای ثبت واقعی:  node test-step1.js --submit')
    return true
  }

  const btn = await page.$('#btnRegisterFinished')
  if (!btn) { log('   ✖ #btnRegisterFinished نیست'); return false }
  await btn.click().catch(() => {})
  log('   ⏳ در حال ثبت نهایی...')

  let code = ''
  let swalErr = ''
  for (let i = 0; i < 40; i++) {
    code = await page.evaluate(() =>
      (document.getElementById('TrackingCodeNumber') || {}).value || '').catch(() => '')
    if (code) break
    swalErr = await readSwalError(page)
    if (swalErr) break
    await page.waitForTimeout(500)
  }

  if (swalErr) {
    const permanent = /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید/.test(swalErr)
    log(`\n   ✖ خطای سایت هنگام ثبت نهایی:`)
    log(`      ${swalErr}`)
    if (permanent) {
      log('   🛑 این خطا دائمی است — تکرار بی‌فایده است، داده را اصلاح کن')
    } else {
      log('   ↻ خطای موقتی — ربات اصلی ۱۰ تا ۱۵ دقیقه صبر و تا ۱۰۰ بار تکرار می‌کند')
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-swal.png`), fullPage: true }).catch(() => {})
    return false
  }

  if (code) {
    log(`\n   🎉 بارنامه ثبت شد — کد رهگیری: ${code}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-receipt.png`), fullPage: true }).catch(() => {})
    return code
  }

  log('   ✖ کد رهگیری دریافت نشد:')
  const errs = await page.evaluate(() => {
    const o = []
    document.querySelectorAll('.alert-danger, small.help-block, .swal2-html-container').forEach(e => {
      if (e.offsetParent !== null && (e.innerText || '').trim()) o.push(e.innerText.trim())
    })
    return Array.from(new Set(o)).slice(0, 8)
  }).catch(() => [])
  errs.forEach(e => log('      • ' + e))
  await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  return false
}

// پیکربندی گام‌های «شخص»
const STEP_SENDER = {
  label: 'گام ۱: مشخصات فرستنده',
  typeSel: '#senderSelectType',
  wrapperIds: ['senderName', 'senderLastName'],
  firstName: '#txtSenderFirstName', lastName: '#txtSenderLastName',
  mobile: '#txtSenderMobile', nationalId: '#txtSenderNationalCode',
  tell: '#txtSenderTell', postalCode: '#txtSenderPostalCode',
  nextBtn: '#btnGoLVL2', nextPane: 'pills-2',
}
const STEP_RECEIVER = {
  label: 'گام ۲: مشخصات گیرنده',
  typeSel: '#receiverSelectType',
  wrapperIds: ['receiverName', 'receiverLastName'],
  firstName: '#txtReceiverFirstName', lastName: '#txtReceiverLastName',
  mobile: '#txtReceiverMobile', nationalId: '#txtReceiverNationalCode',
  tell: '#txtReceiverTell', postalCode: '#txtReceiverPostalCode',
  nextBtn: '#btnGoLVL3', nextPane: 'pills-3',
}

async function waitLoginResult(page, maxMs = 45000) {
  const t0 = Date.now()
  let lastLog = 0
  let transient = ''          // خطای موقتی دیده‌شده (مثل 503)
  let hardError = ''

  // الگوهای خطای موقتی سمت سرور — لاگین ممکن است با تاخیر ادامه پیدا کند
  const TRANSIENT = /50[0-9]|service is unavailable|Internal Server Error|قادر به پاسخگویی|timeout|Gateway/i
  // الگوهای خطای قطعی — تکرار بی‌فایده است
  const FATAL = /رمز|کلمه عبور|کاربری یافت نشد|کد ملی|نام کاربری|قفل|مسدود|غیرفعال/

  while (Date.now() - t0 < maxMs) {
    // ۱) از صفحه‌ی ورود خارج شدیم؟  (مهم‌ترین نشانه‌ی موفقیت)
    let url = ''
    try { url = page.url() } catch { /* در حال ناوبری */ }
    if (url && !url.includes('Login')) {
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      return { ok: true, waited: Math.round((Date.now() - t0) / 1000), transient }
    }

    // ۲) نشانه‌ی دوم موفقیت: فرم ورود از صفحه رفته یا فرم بارنامه آمده
    const gone = await page.evaluate(() => {
      const hasLogin = !!document.querySelector('#NationalCode, #user-password, #inter')
      const hasApp = !!document.querySelector('#senderSelectType, #btnAddLoad, .navbar, #layout-menu')
      return !hasLogin && hasApp
    }).catch(() => false)
    if (gone) {
      return { ok: true, waited: Math.round((Date.now() - t0) / 1000), transient }
    }

    // ۳) پیام خطا
    const err = await page.evaluate(() => {
      const sels = ['.swal2-html-container', '.alert-danger', '.text-danger',
                    '.validation-summary-errors', '[role="alert"]', '.toast-error']
      for (const s of sels) {
        for (const el of document.querySelectorAll(s)) {
          if (el.offsetParent === null) continue
          const t = (el.innerText || '').trim()
          if (t && t.length > 2) return t.replace(/\s+/g, ' ').slice(0, 200)
        }
      }
      return ''
    }).catch(() => '')

    if (err) {
      if (FATAL.test(err)) {
        // خطای قطعی ⇒ همین‌جا تمام
        return { ok: false, error: err, fatal: true, waited: Math.round((Date.now() - t0) / 1000) }
      }
      if (TRANSIENT.test(err)) {
        // خطای موقتی ⇒ فقط یادداشت کن و به پایش ادامه بده
        if (err !== transient) {
          transient = err
          console.log(`      ⚠ خطای موقتی سایت (ادامه می‌دهیم): ${err.slice(0, 90)}`)
        }
      } else {
        hardError = err
      }
    }

    const el = Math.round((Date.now() - t0) / 1000)
    if (el >= 5 && el - lastLog >= 5) {
      lastLog = el
      console.log(`      ⏱ هنوز در حال ورود... (${el}s)`)
    }

    await page.waitForTimeout(500).catch(() => {})
  }

  return {
    ok: false,
    error: hardError || transient || 'زمان انتظار ورود تمام شد',
    transient,
    waited: Math.round((Date.now() - t0) / 1000),
  }
}


// ---------- «سرور مشغول» ----------
const BUSY_PATTERNS = ['قادر به پاسخگویی', 'چند دقیقه دیگر مجدد', 'سرور در حال حاضر',
                       'The service is unavailable', 'service is unavailable',
                       'Service Unavailable', 'temporarily unavailable']

async function isServerBusy(page) {
  return page.evaluate((pats) => {
    const body = (document.body?.innerText || '').slice(0, 3000)
    if (!body) return false
    if (!pats.some(p => body.includes(p))) return false
    const hasLogin = !!document.querySelector('#NationalCode, #user-password')
    const hasForm  = !!document.querySelector('#senderSelectType, #btnAddLoad')
    return !hasLogin && !hasForm
  }, BUSY_PATTERNS).catch(() => false)
}

async function readBusyMessage(page) {
  return page.evaluate(() => {
    const pre = document.querySelector('pre')
    if (pre) return pre.innerText.trim().slice(0, 200)
    return (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  }).catch(() => '')
}

async function sleepWithLog(ms) {
  const total = Math.round(ms / 1000)
  console.log(`   \u23f3 صبر ${Math.round(total / 60)} دقیقه (${total}s)...`)
  let waited = 0
  while (waited < ms) {
    const chunk = Math.min(30000, ms - waited)
    await new Promise(r => setTimeout(r, chunk))
    waited += chunk
    const rem = Math.round((ms - waited) / 1000)
    if (rem > 0) console.log(`      ... ${rem}s باقی`)
  }
}


// ---------- پاپ‌آپ خطا (SweetAlert) ----------
async function readSwalError(page) {
  return page.evaluate(() => {
    const pop = document.querySelector('.swal2-popup.swal2-icon-error')
    if (!pop || pop.offsetParent === null) return ''
    const body = (document.getElementById('swal2-html-container')?.textContent || '').trim()
    const title = (document.getElementById('swal2-title')?.textContent || '').trim()
    return (body || title).replace(/\s+/g, ' ').slice(0, 160)
  }).catch(() => '')
}

async function waitForSwalError(page, ms = 3000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const e = await readSwalError(page)
    if (e) return e
    await page.waitForTimeout(300).catch(() => {})
  }
  return ''
}


/* ═══════════════════════════════════════════════════════════════════
   تشخیص وضعیت سلامت — «چه بلایی سر ما آمد؟»
   ═══════════════════════════════════════════════════════════════════ */

/** خطاهای شبکه‌ای که یعنی IP بلاک شده یا اتصال قطع است */
const NET_BLOCK_RE = /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_SOCKET_NOT_CONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|net::ERR_/i

/** صفحه/مرورگر مرده است */
const PAGE_DEAD_RE = /Target page, context or browser has been closed|Target closed|browser has been closed|Session closed|Protocol error/i

/** خطای دائمی — تکرار بی‌فایده است */
const PERMANENT_RE = /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید|رمز|کلمه عبور|کاربری یافت نشد|نام کاربری|قفل|مسدود|غیرفعال/

const isNetBlockError  = (e) => NET_BLOCK_RE.test(String((e && e.message) || e))
const isPageDeadError  = (e) => PAGE_DEAD_RE.test(String((e && e.message) || e))
const isPermanentError = (e) => PERMANENT_RE.test(String((e && e.message) || e))

/**
 * چالش امنیتی WAF — صفحه‌ی «Security check» با کپچای تصویری.
 * فعلا فقط تشخیص می‌دهیم (حلش پیاده نشده) تا لااقل صریح گزارش شود
 * به‌جای اینکه به‌عنوان «فرم باز نشد» رد شود.
 */
async function isWafChallenge(page) {
  return page.evaluate(() => {
    const t = (document.body?.innerText || '').slice(0, 1500)
    const hasText = /Security check|Please enter the above text/i.test(t)
    const hasField = !!document.querySelector('input[name="pcode"], input[name="vcode"], input[name="req_data"]')
    return hasText || hasField
  }).catch(() => false)
}

/**
 * وضعیت فعلی صفحه را می‌خواند.
 * خروجی: 'ok' | 'block' | 'busy' | 'waf' | 'login' | 'dead'
 */
async function pageHealth(page) {
  let url = ''
  try { url = page.url() } catch { return 'dead' }
  if (!url || url === 'about:blank') return 'dead'

  const st = await page.evaluate(() => {
    const body = (document.body?.innerText || '').slice(0, 2500)
    return {
      body,
      hasLogin: !!document.querySelector('#NationalCode, #user-password, #inter'),
      hasForm: !!document.querySelector('#senderSelectType, #btnAddLoad'),
      hasWafField: !!document.querySelector('input[name="pcode"], input[name="req_data"]'),
    }
  }).catch(() => null)

  if (!st) return 'dead'

  if (st.hasWafField || /Security check|Please enter the above text/i.test(st.body)) return 'waf'
  if (st.hasForm) return 'ok'

  const BUSY = ['قادر به پاسخگویی', 'چند دقیقه دیگر مجدد', 'سرور در حال حاضر',
                'The service is unavailable', 'service is unavailable',
                'Service Unavailable', 'temporarily unavailable']
  if (BUSY.some(p => st.body.includes(p))) return 'busy'

  if (st.hasLogin || /Login/i.test(url)) return 'login'
  if (!st.body.trim()) return 'block'
  return 'ok'
}

/**
 * فعالانه می‌پاید تا سایت برگردد (به‌جای خواب کور).
 * هر ۱۵ ثانیه یک درخواست سبک می‌زند.
 */
async function waitUntilSiteBack(page, maxMs) {
  const t0 = Date.now()
  console.log(`   ⏳ پایش سایت هر ۱۵ ثانیه (حداکثر ${fmtT(Math.round(maxMs / 1000))})`)
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 15000))
    let alive = false
    try {
      const res = await page.request.get(LOGIN_URL, { timeout: 12000 })
      alive = res.status() > 0 && res.status() < 500
    } catch { alive = false }
    const el = Math.round((Date.now() - t0) / 1000)
    if (alive) { console.log(`   ✅ سایت برگشت (بعد از ${fmtT(el)})`); return true }
    console.log(`      ... هنوز در دسترس نیست (${fmtT(el)})`)
  }
  return false
}

/* ═══════════════════════════════════════════════════════════════════
   runWaybill — همان توالی main() در test-step1.js
   ولی داده از بیرون می‌آید (پروفایل کاربر) و مرورگر هم می‌تواند
   از بیرون تزریق شود.

   opts = {
     credentials: { username, password },
     data:  { sender, receiver, driver, cargo, origin, destination, fare },
     submit: true|false,      // false ⇒ گام ۹ فقط شبیه‌سازی
     headless: false,
     onLog: (line) => {},     // هر سطر لاگ
     onStep: (n, ok, label) => {},   // پایان هر گام
     keepOpenMs: 0,           // چند میلی‌ثانیه مرورگر باز بماند
   }

   خروجی:
     { success, trackingCode, steps:[bool x9], error, lastStep, page, browser }
   ═══════════════════════════════════════════════════════════════════ */
async function runWaybillOnce(opts) {
  const {
    credentials, data, submit = false, headless = false,
    onLog = null, onStep = null, keepOpenMs = 0, closeBrowser = true,
  } = opts

  if (onLog) setLogSink(onLog)
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const step = async (n, ok, label) => {
    if (onStep) { try { await onStep(n, ok, label) } catch (e) {} }
    return ok
  }

  /* قبل از هر گام چک می‌کنیم کاربر لغو کرده یا نه */
  const stopRequested = async () => {
    if (!opts.shouldStop) return false
    try { return await opts.shouldStop() } catch (e) { return false }
  }

  const { chromium } = require('playwright')
  const LAUNCH = {
    headless,
    channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  }
  const CTX = { viewport: null, locale: 'fa-IR', timezoneId: 'Asia/Tehran' }

  let browser = await chromium.launch(LAUNCH)
  let ctx = await browser.newContext(CTX)
  let page = await ctx.newPage()

  const fail = async (error, kind = 'error') => {
    if (closeBrowser) await browser.close().catch(() => {})
    return { success: false, error, kind, steps: [], trackingCode: null }
  }

  console.log(`حساب: ${credentials.username}`)
  console.log('\n→ ورود به سامانه...')

  {
    const nav = await gotoR(page, LOGIN_URL, 'صفحه ورود')
    if (nav === 'TIMEOUT') {
      console.log('   ⚠ تایم‌اوت — بستن مرورگر و صبر ۲ تا ۵ دقیقه')
      await browser.close().catch(() => {})
      await sleepWithLog(rand(2 * 60 * 1000, 5 * 60 * 1000))
      browser = await chromium.launch(LAUNCH)
      ctx = await browser.newContext(CTX)
      page = await ctx.newPage()
      if (!await gotoR(page, LOGIN_URL, 'صفحه ورود'))
        return fail('بعد از تایم‌اوت، اتصال به صفحه ورود برقرار نشد', 'timeout')
    } else if (!nav) return fail('اتصال به صفحه ورود برقرار نشد (بلاک یا قطعی شبکه)', 'block')
  }
  await page.waitForTimeout(2500)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

  // «سرور در حال حاضر قادر به پاسخگویی نمی‌باشد» → مرورگر تازه، ۲ دقیقه صبر
  for (let busyTry = 1; busyTry <= 5; busyTry++) {
    if (!await isServerBusy(page)) break
    const bmsg = await readBusyMessage(page)
    console.log(`\n   ⚠ سرور مشغول است (${busyTry}/5): ${bmsg}`)
    if (busyTry === 5) return fail('سرور همچنان مشغول است: ' + bmsg, 'busy')
    console.log('   ↻ بستن مرورگر...')
    await browser.close().catch(() => {})
    // ۲ تا ۵ دقیقهی تصادفی — الگوی قابل‌تشخیص نمی‌سازد
    await sleepWithLog(rand(2 * 60 * 1000, 5 * 60 * 1000))
    browser = await chromium.launch(LAUNCH)
    ctx = await browser.newContext(CTX)
    page = await ctx.newPage()
    console.log('   ↻ مرورگر تازه — تلاش مجدد')
    if (!await gotoR(page, LOGIN_URL, 'صفحه ورود')) return fail('اتصال نشد (بلاک یا قطعی شبکه)', 'block')
    await page.waitForTimeout(2500)
    await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})
  }

  await (await page.$('#NationalCode'))?.fill(credentials.username)
  await (await page.$('#user-password'))?.fill(credentials.password)

  let logged = false
  let loginErr = 'ورود ناموفق'
  let captchaAttempts = 0
  for (let att = 1; att <= 6; att++) {
    captchaAttempts = att
    const t = await classifyTemplate(page)
    if (t.error) {
      console.log(`   ✖ کپچا: ${t.error} → رفرش`)
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(2500)
      await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})
      await (await page.$('#NationalCode'))?.fill(credentials.username)
      await (await page.$('#user-password'))?.fill(credentials.password)
      continue
    }
    const ans = solveMath(t.expr)
    const minS = Math.min(...t.symbols.map(s => s.score))
    console.log(`   ◈ کپچا: ${t.expr} ⇒ ${ans} (اطمینان ${(minS * 100).toFixed(0)}%)`)
    if (ans === null || minS < 0.42) {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
      await page.waitForTimeout(1500); continue
    }
    const ci = await page.$('#DNTCaptchaInputText')
    await ci?.fill(''); await ci?.type(ans, { delay: 35 })
    await page.waitForTimeout(300)
    await (await page.$('#inter'))?.click()

    const res = await waitLoginResult(page, 45000)
    if (res.ok) {
      logged = true
      console.log(`   ✅ ورود موفق (${res.waited}s)` + (res.transient ? '  [با وجود خطای موقتی سایت]' : ''))
      break
    }
    if (res.fatal) { loginErr = res.error; console.log(`   🛑 خطای قطعی: ${res.error}`); break }
    loginErr = res.error || loginErr
    console.log(`   ✖ ورود نشد (${res.waited}s)${res.error ? ' — ' + res.error.slice(0, 90) : ''}`)

    if (res.transient) {
      console.log('   ↻ رفرش کامل صفحه (سایت خطای موقتی داشت)...')
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(3000)
      await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})
    } else {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(() => {})
      await page.waitForTimeout(1200)
    }
    await (await page.$('#NationalCode'))?.fill(credentials.username)
    await (await page.$('#user-password'))?.fill(credentials.password)
  }
  if (!logged) return fail(loginErr)

  console.log('\n→ باز کردن فرم بارنامه...')
  {
    const nav2 = await gotoR(page, TARGET_URL, 'فرم بارنامه')
    if (nav2 === 'TIMEOUT') return fail('تایم‌اوت هنگام باز کردن فرم بارنامه', 'timeout')
    if (!nav2) return fail('فرم بارنامه باز نشد (بلاک یا قطعی شبکه)', 'block')
  }
  await page.waitForTimeout(2500)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

  {
    const sw = await waitForSwalError(page, 3500)
    if (sw) {
      console.log(`\n   ⚠ پاپ‌آپ خطای سایت: ${sw}`)
      await page.screenshot({ path: path.join(OUT, 'swal-error.png'), fullPage: true }).catch(() => {})
    }
  }

  const hasForm = await page.$('#senderSelectType')
  if (!hasForm) {
    // چرا فرم نیامد؟ بلاک؟ مشغول؟ WAF؟ پرت‌شدن به لاگین؟
    const h = await pageHealth(page)
    await page.screenshot({ path: path.join(OUT, 'noform.png'), fullPage: true }).catch(() => {})
    const reason = {
      waf:   'چالش امنیتی WAF (Security check) — سایت کپچای اضافی خواست',
      busy:  'سرور مشغول است',
      block: 'صفحه خالی برگشت — احتمال بلاک IP',
      login: 'به صفحه‌ی ورود پرت شدیم — سشن منقضی شد',
      dead:  'صفحه/مرورگر بسته شد',
    }[h] || 'فرم باربرگ باز نشد (#senderSelectType پیدا نشد)'
    console.log(`❌ ${reason}`)
    return fail(reason, h === 'ok' ? 'error' : h)
  }
  console.log('   ✅ فرم باز شد')

  /* ───────── گام‌ها — دقیقا همان توالی test-step1.js ───────── */
  const d = data

  let ok1 = false, ok2 = false, ok3 = false, ok4 = false, ok5 = false
  let ok6 = false, ok7 = false, ok8 = false, ok9 = false
  let trackingCode = null
  let lastStep = 'فرستنده'
  let midFail = null          // اگر وسط گام‌ها اتصال قطع شد

  try {
  console.log('\n═══ ' + STEP_SENDER.label + ' ═══')
  console.log('   نوع: حقیقی (value=1)')
  ok1 = await step(1, await fillPersonStep(page, STEP_SENDER, d.sender, OUT, 'step1'), 'فرستنده')

  if (ok1 && await stopRequested()) {
    console.log('   ⏹ لغو شد — ادامه داده نمی‌شود')
    midFail = { kind: 'stopped', error: 'توسط کاربر لغو شد' }
    ok1 = false
  }

  if (ok1) {
    console.log('\n═══ ' + STEP_RECEIVER.label + ' ═══')
    lastStep = 'گیرنده'
    ok2 = await step(2, await fillPersonStep(page, STEP_RECEIVER, d.receiver, OUT, 'step2'), 'گیرنده')
  }
  if (ok2) {
    console.log('\n═══ گام ۳: مشخصات راننده و خودرو ═══')
    console.log(`   راننده: ${d.driver.name} | پلاک: ${d.driver.plateText}`)
    lastStep = 'راننده و خودرو'
    ok3 = await step(3, await fillDriverVehicleStep(page, d.driver, OUT, 'step3'), 'راننده و خودرو')
  }
  if (ok3) {
    console.log('\n═══ گام ۴: مشخصات کالا ═══')
    console.log(`   ${d.cargo.name} | ${d.cargo.packaging} | ${d.cargo.count} بسته | ${d.cargo.weightTon} تن`)
    lastStep = 'کالا'
    ok4 = await step(4, await fillCargoStep(page, d.cargo, OUT, 'step4'), 'کالا')
  }
  if (ok4 && await stopRequested()) {
    console.log('   ⏹ لغو شد — ادامه داده نمی‌شود')
    midFail = { kind: 'stopped', error: 'توسط کاربر لغو شد' }
    ok4 = false
  }

  if (ok4) {
    console.log('\n═══ ' + STEP_ORIGIN.label + ' ═══')
    lastStep = 'مبدا'
    ok5 = await step(5, await fillLocationStep(page, STEP_ORIGIN, d.origin, OUT, 'step5'), 'مبدا')
  }
  if (ok5) {
    console.log('\n═══ ' + STEP_DEST.label + ' ═══')
    lastStep = 'مقصد'
    ok6 = await step(6, await fillLocationStep(page, STEP_DEST, d.destination, OUT, 'step6'), 'مقصد')
  }
  if (ok6) {
    console.log('\n═══ گام ۷: مشخصات مبدا و مقصد ═══')
    lastStep = 'بازبینی'
    ok7 = await step(7, await passReviewStep(page), 'بازبینی')
  }
  if (ok7) {
    console.log('\n═══ گام ۸: کرایه و صدور سند ═══')
    lastStep = 'کرایه'
    ok8 = await step(8, await fillFareStep(page, d.fare, OUT, 'step8'), 'کرایه')
  }
  if (ok8) {
    console.log('\n═══ گام ۹: تایید مشخصات و ثبت نهایی ═══')
    lastStep = 'ثبت نهایی'
    const res = await finalConfirmStep(page, OUT, 'step9', { dryRun: !submit })
    ok9 = !!res
    if (typeof res === 'string') { trackingCode = res; console.log(`\n🎉🎉 کد رهگیری: ${res}`) }
    await step(9, ok9, 'ثبت نهایی')
  }

  } catch (e) {
    /* قطع شدن وسط پر کردن فرم — قبلا فقط «گام فلان ناموفق»
       گزارش می‌شد و دلیل واقعی گم می‌شد. */
    const msg = String((e && e.message) || e).split('\n')[0].slice(0, 160)
    if (isPageDeadError(e))      midFail = { kind: 'dead',  error: `مرورگر در گام «${lastStep}» بسته شد` }
    else if (isNetBlockError(e)) midFail = { kind: 'block', error: `اتصال در گام «${lastStep}» قطع شد (احتمال بلاک IP): ${msg}` }
    else                         midFail = { kind: 'error', error: `خطا در گام «${lastStep}»: ${msg}` }
    console.log(`   ✖ ${midFail.error}`)
  }

  /* اگر گامی بدون پرتاب خطا شکست خورد، ببین علتش سلامت صفحه بوده یا داده */
  if (!midFail && !ok9) {
    const h = await pageHealth(page)
    if (h !== 'ok') {
      const m = {
        waf:   'چالش امنیتی WAF وسط کار ظاهر شد',
        busy:  'سرور وسط کار مشغول شد',
        block: 'وسط کار صفحه خالی شد — احتمال بلاک IP',
        login: 'وسط کار به صفحه‌ی ورود پرت شدیم — سشن منقضی شد',
        dead:  'صفحه/مرورگر بسته شد',
      }[h]
      if (m) { midFail = { kind: h, error: `${m} (گام «${lastStep}»)` }; console.log(`   ✖ ${m}`) }
    }
  }

  const steps = [ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9]
  console.log('\n' + '─'.repeat(46))
  console.log('  خلاصه: ' + steps.map((m, i) => `${i + 1}${m ? '✔' : '✖'}`).join('  '))
  console.log('─'.repeat(46))

  const swalNow = await readSwalError(page)

  if (keepOpenMs > 0) {
    console.log(`\nمرورگر ${Math.round(keepOpenMs / 1000)} ثانیه باز می‌ماند...`)
    await page.waitForTimeout(keepOpenMs).catch(() => {})
  }

  const success = submit ? !!trackingCode : ok9
  const result = {
    success,
    trackingCode,
    steps,
    lastStep,
    kind: success ? 'ok' : (midFail ? midFail.kind : 'error'),
    error: success ? null
         : (midFail ? midFail.error : (swalNow || `گام «${lastStep}» ناموفق بود`)),
    page: closeBrowser ? null : page,
    browser: closeBrowser ? null : browser,
  }

  if (closeBrowser) await browser.close().catch(() => {})
  return result
}

/**
 * آیا سایت واقعا برگشته؟
 *
 * ⚠ فقط status() > 0 کافی نیست: سایت وقتی مشغول است هم پاسخ می‌دهد،
 *   منتها با 503 یا با صفحه‌ای که داخلش نوشته «قادر به پاسخگویی نمی باشد».
 *   قبلا همین باعث می‌شد بعد از ۱۵ ثانیه بگوییم «سایت برگشت» در حالی که
 *   نبرگشته بود، و کل مدت صبر هدر برود.
 */
async function isSiteReallyBack() {
  try {
    const { request } = require('playwright')
    const rc = await request.newContext({ timeout: 15000 })
    let res = null
    try { res = await rc.get(LOGIN_URL) } catch (e) { res = null }

    if (!res) { await rc.dispose().catch(() => {}); return false }

    const st = res.status()
    // 5xx یعنی سرور هنوز مریض است؛ 4xx هم پاسخ سالمی برای صفحه‌ی ورود نیست
    if (st < 200 || st >= 400) { await rc.dispose().catch(() => {}); return false }

    // بدنه را هم بخوان — گاهی 200 می‌دهد ولی متن «سرور مشغول» داخلش است
    let body = ''
    try { body = (await res.text()).slice(0, 4000) } catch (e) { body = '' }
    await rc.dispose().catch(() => {})

    const BUSY = ['قادر به پاسخگویی', 'چند دقیقه دیگر مجدد', 'سرور در حال حاضر',
                  'The service is unavailable', 'service is unavailable',
                  'Service Unavailable', 'temporarily unavailable']
    if (BUSY.some(p => body.includes(p))) return false

    // صفحه‌ی ورود واقعی باید فیلد کد ملی یا فرم ورود داشته باشد
    const looksLikeLogin = /NationalCode|user-password|dntCaptcha|DNTCaptcha/i.test(body)
    return looksLikeLogin || body.length > 500
  } catch (e) {
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════════
   runWaybill — لایه‌ی مقاومت روی runWaybillOnce

   سیاست (انتخاب کاربر: متعادل + شروع مجدد کامل):
     ┌──────────────────┬─────────────┬────────┐
     │ چه شد؟           │ چقدر صبر    │ چند بار│
     ├──────────────────┼─────────────┼────────┤
     │ بلاک IP          │ ۵ تا ۱۰ دقیقه│  ۲۰    │
     │ سرور مشغول       │ ۵ تا ۱۰ دقیقه│  ۲۰    │
     │ چالش WAF         │ ۵ تا ۱۰ دقیقه│  ۲۰    │
     │ صفحه مرده        │ ۱۵ ثانیه     │  ۲۰    │
     │ سشن منقضی        │ ۱۵ ثانیه     │  ۲۰    │
     │ خطای دائمی       │      —      │  بدون  │
     │ خطای داده/گام    │      —      │  بدون  │
     └──────────────────┴─────────────┴────────┘

   در همه‌ی حالت‌ها مرورگر کامل بسته و از صفر شروع می‌شود
   (لاگین تازه + فرم از نو)، چون سشن سایت فقط ~۵ دقیقه عمر دارد.
   ═══════════════════════════════════════════════════════════════════ */
async function runWaybill(opts) {
  const {
    maxRestarts = 20,
    onLog = null,
    shouldStop = null,     // تابع اختیاری: اگر true برگرداند، متوقف شو
  } = opts

  // این نوع خطاها یعنی «سایت/شبکه» — ارزش صبر کردن دارد
  const RETRY_LONG  = ['block', 'busy', 'waf', 'timeout']
  const RETRY_SHORT = ['dead', 'login']

  /* سقف تلاش برای هر نوع — عینا مطابق test-step1.js
       بلاک IP   : gotoR(max = 20)              → ۲۰ بار، هر بار ۳–۵ دقیقه
       سرور مشغول: for (busyTry <= 5)          → ۵ بار، هر بار ۲–۵ دقیقه
       تایم‌اوت  : tmo >= 2 → یک راه‌اندازی مجدد با صبر ۲–۵ دقیقه */
  const LIMITS = {
    block:   maxRestarts,   // پیش‌فرض ۲۰
    waf:     maxRestarts,
    busy:    5,
    timeout: 5,
    dead:    maxRestarts,
    login:   maxRestarts,
  }

  let last = null

  for (let attempt = 1; attempt <= maxRestarts; attempt++) {
    if (shouldStop && await shouldStop()) {
      console.log('   ⏹ درخواست توقف دریافت شد')
      return last || { success: false, error: 'متوقف شد', kind: 'stopped', steps: [] }
    }

    if (attempt > 1) console.log(`\n╔═══ تلاش ${attempt} از ${maxRestarts} — شروع کامل از صفر ═══╗`)

    try {
      last = await runWaybillOnce(opts)
    } catch (e) {
      const msg = String((e && e.message) || e).split('\n')[0].slice(0, 160)
      last = {
        success: false,
        error: msg,
        kind: isPageDeadError(e) ? 'dead' : (isNetBlockError(e) ? 'block' : 'error'),
        steps: [], trackingCode: null,
      }
      console.log(`   ✖ خطای غیرمنتظره: ${msg}`)
    }

    if (last.success) {
      if (attempt > 1) console.log(`   ✅ در تلاش ${attempt} موفق شد`)
      return last
    }

    const kind = last.kind || 'error'

    // خطای دائمی ⇒ تکرار بی‌فایده است
    if (isPermanentError(last.error || '')) {
      console.log(`   🛑 خطای دائمی — تکرار نمی‌شود: ${last.error}`)
      last.kind = 'permanent'
      return last
    }

    // خطای داده یا گام (نه شبکه) ⇒ تکرار کمکی نمی‌کند
    if (!RETRY_LONG.includes(kind) && !RETRY_SHORT.includes(kind)) {
      console.log(`   ✖ ${last.error}`)
      console.log('      این خطا با تکرار حل نمی‌شود — داده یا فرم را بررسی کن')
      return last
    }

    // ── چقدر صبر کنیم؟ (عینا مطابق test-step1.js) ──
    const label = {
      block: 'بلاک IP / قطع اتصال',
      busy:  'سرور مشغول',
      waf:   'چالش امنیتی WAF',
      dead:  'مرورگر بسته شد',
      login: 'سشن منقضی شد',
    }[kind] || kind

    // سقف تلاش برای هر نوع — مطابق فایل اصلی
    const limit = LIMITS[kind] ?? maxRestarts
    if (attempt >= limit) {
      console.log(`   ✖ بعد از ${limit} تلاش همچنان ناموفق (${label}): ${last.error}`)
      return last
    }

    if (RETRY_SHORT.includes(kind)) {
      console.log(`\n   ↻ ${label} (تلاش ${attempt}/${limit}) — مرورگر تازه بعد از ۱۵ ثانیه`)
      await sleepWithLog(15000)
      continue
    }

    /* مدت صبر — دقیقا همان اعداد test-step1.js:
         بلاک IP  : waitBack(180000 + rand*120000)  →  ۳ تا ۵ دقیقه
         سرور مشغول: rand(2*60*1000, 5*60*1000)       →  ۲ تا ۵ دقیقه
         تایم‌اوت  : rand(2*60*1000, 5*60*1000)      →  ۲ تا ۵ دقیقه  */
    const waitMs =
        kind === 'block'   ? 180000 + Math.random() * 120000
      : kind === 'busy'    ? rand(2 * 60 * 1000, 5 * 60 * 1000)
      : kind === 'timeout' ? rand(2 * 60 * 1000, 5 * 60 * 1000)
      :                      rand(2 * 60 * 1000, 5 * 60 * 1000)

    console.log(`\n   ⚠ ${label} (تلاش ${attempt}/${limit})`)
    console.log(`      ${last.error || ''}`)
    console.log(`   ↻ مرورگر بسته شد — صبر ${fmtT(Math.round(waitMs / 1000))}، بعد شروع کامل از صفر`)

    /* بلاک یا مشغولی ⇒ فعالانه بپاییم (probe هر ۱۵ ثانیه، مثل waitBack).
       اگر سایت زودتر برگشت، بلافاصله ادامه می‌دهیم به‌جای خواب کور. */
    if (kind === 'block' || kind === 'busy') {
      const t0 = Date.now()
      let back = false
      console.log(`   ⏳ صبر تا برگشتن سایت (حداکثر ${fmtT(Math.round(waitMs / 1000))})`)
      while (Date.now() - t0 < waitMs) {
        await new Promise(r => setTimeout(r, 15000))
        // وسط صبر هم لغو را بپا — وگرنه تا ۱۰ دقیقه بی‌خود منتظر می‌ماند
        if (shouldStop && await shouldStop()) {
          console.log('   ⏹ درخواست توقف دریافت شد — صبر قطع شد')
          return { success: false, error: 'متوقف شد', kind: 'stopped', steps: [], trackingCode: null }
        }
        back = await isSiteReallyBack()
        const el = Math.round((Date.now() - t0) / 1000)
        if (back) { console.log(`   ✅ سایت برگشت (${fmtT(el)})`); break }
        console.log(`      ... هنوز در دسترس نیست (${fmtT(el)})`)
      }
      if (!back) console.log('   ⚠ در مهلت مقرر برنگشت — به هر حال یک بار دیگر امتحان می‌کنیم')
    } else {
      await sleepWithLog(waitMs)
    }
  }
  return last
}

/* ═══════ تبدیل رکورد RegistrationProfile به داده‌ی موتور ═══════ */
function parsePlateText(txt) {
  const s = toLatin(txt || '').replace(/ایران/g, ' ').replace(/[-_|]/g, ' ').trim()
  const letter = (s.match(/[\u0600-\u06FF]+/) || [''])[0]
  const nums = s.match(/\d+/g) || []
  return {
    twoDigit:   nums[0] || '',
    letter:     letter || '',
    threeDigit: nums[1] || '',
    iran:       nums[2] || '',
  }
}

function profileToData(p) {
  const name = String(p.driverName || '').trim()
  const parts = name.split(/\s+/)
  return {
    sender: {
      type: p.senderType || 'حقیقی',
      firstName: p.senderFirstName || '',
      lastName: p.senderLastName || '',
      mobile: p.senderMobile || '',
      nationalId: p.senderNationalId || '',
      phone: p.senderPhone || '',
      postalCode: p.senderPostalCode || '',
    },
    receiver: {
      type: p.receiverType || 'حقیقی',
      firstName: p.receiverFirstName || '',
      lastName: p.receiverLastName || '',
      mobile: p.receiverMobile || '',
      nationalId: p.receiverNationalId || '',
      phone: p.receiverPhone || '',
      postalCode: p.receiverPostalCode || '',
    },
    driver: {
      name,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      nationalId: p.driverNationalId || '',
      plate: parsePlateText(p.plateNumber),
      plateText: p.plateNumber || '',
    },
    cargo: {
      name: p.cargoName || '',
      packaging: p.cargoPackaging || 'سایر',
      count: toLatin(p.cargoQuantity || ''),
      weightTon: toLatin(p.cargoWeight || ''),
      value: toLatin(p.cargoValue || ''),
      insurance: toLatin(p.insuranceAmount || '0'),
    },
    origin: {
      province: p.originProvince || '',
      city: p.originCity || '',
      address: p.originAddress || '',
      postalCode: p.originPostalCode || '',
    },
    destination: {
      province: p.destProvince || '',
      city: p.destCity || '',
      address: p.destAddress || '',
      postalCode: p.destPostalCode || '',
    },
    fare: {
      amount: toLatin(p.freightCost || ''),
      prepaid: toLatin(p.advanceFare || ''),
      // خالی می‌ماند تا موتور خودش ساعت جاری تهران + ۱۰ دقیقه را بگذارد.
      // هر ساعت ثابتی بالاخره می‌گذرد و سایت خطای
      // «زمان بارگیری نمی تواند قبل از ساعت روز جاری باشد» می‌دهد.
      time: '',
    },
  }
}

/** فیلدهای اجباری — پیش از باز کردن مرورگر بررسی می‌شوند */
function validateData(d) {
  const miss = []
  const req = [
    [d.sender.firstName, 'نام فرستنده'], [d.sender.lastName, 'نام خانوادگی فرستنده'],
    [d.sender.mobile, 'موبایل فرستنده'], [d.sender.nationalId, 'کد ملی فرستنده'],
    [d.receiver.firstName, 'نام گیرنده'], [d.receiver.lastName, 'نام خانوادگی گیرنده'],
    [d.receiver.mobile, 'موبایل گیرنده'], [d.receiver.nationalId, 'کد ملی گیرنده'],
    [d.driver.name, 'نام راننده'], [d.driver.plate.twoDigit, 'پلاک (دو رقم اول)'],
    [d.driver.plate.letter, 'پلاک (حرف)'], [d.driver.plate.threeDigit, 'پلاک (سه رقم)'],
    [d.driver.plate.iran, 'پلاک (کد ایران)'],
    [d.cargo.name, 'نام کالا'], [d.cargo.weightTon, 'وزن کالا'], [d.cargo.value, 'ارزش کالا'],
    [d.origin.province, 'استان مبدا'], [d.origin.city, 'شهر مبدا'], [d.origin.address, 'آدرس مبدا'],
    [d.destination.province, 'استان مقصد'], [d.destination.city, 'شهر مقصد'], [d.destination.address, 'آدرس مقصد'],
    [d.fare.amount, 'مبلغ کرایه'],
  ]
  for (const [v, label] of req) if (!String(v || '').trim()) miss.push(label)
  return miss
}

module.exports = {
  runWaybill, runWaybillOnce, profileToData, validateData, parsePlateText, setLogSink,
  // برای استفاده‌ی مستقیم در ابزارهای تست
  gotoR, classifyTemplate, solveMath, waitLoginResult,
  fillPersonStep, fillDriverVehicleStep, fillCargoStep, fillLocationStep,
  passReviewStep, fillFareStep, finalConfirmStep,
  pageHealth, isWafChallenge, waitUntilSiteBack,
  isNetBlockError, isPageDeadError, isPermanentError,
  isServerBusy, readBusyMessage, readSwalError, waitForSwalError, sleepWithLog,
  STEP_SENDER, STEP_RECEIVER, STEP_ORIGIN, STEP_DEST,
  SITE, LOGIN_URL, TARGET_URL, OUT,
}
