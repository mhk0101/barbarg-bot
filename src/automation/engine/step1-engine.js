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



/* ⚠ قبلا ERR_CONNECTION_TIMED_OUT را نمی‌گرفت (فقط ERR_TIMED_OUT داشت)،
   پس حلقه‌ی ۲۰ باره‌ی بی‌فایده اجرا می‌شد و مرورگر باز می‌ماند. */
const BLOCK_RE = /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_SOCKET_NOT_CONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_PROXY_CONNECTION_FAILED/
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

/* توابع probe() و waitBack() حذف شدند.
   آن‌ها هنگام بلاک، مرورگر را تا ۵ دقیقه باز نگه می‌داشتند
   (چون probe از page.request استفاده می‌کرد و به صفحه‌ی زنده نیاز داشت).
   حالا مرورگر فورا بسته می‌شود و پایش سایت با isSiteReallyBack()
   انجام می‌شود که مستقل از مرورگر است. */

/**
 * ناوبری مقاوم.
 *
 * خروجی:
 *   true       موفق
 *   'BLOCKED'  بلاک IP — لایه‌ی بالاتر باید مرورگر را ببندد و صبر کند
 *   'TIMEOUT'  تایم‌اوت
 *   false      خطای دیگر
 *
 * ⚠ قبلا هنگام بلاک، همین‌جا تا ۵ دقیقه صبر می‌کرد و مرورگر
 *   تمام این مدت باز می‌ماند — تا ۲۰ بار، یعنی ساعت‌ها.
 *   حالا فورا برمی‌گردد تا مرورگر بسته شود، بعد صبر انجام می‌شود.
 */
async function gotoR(page, url, label, max = 20) {
  let tmo = 0
  for (let a = 1; a <= max; a++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return true }
    catch (e) {
      if (isBlock(e)) {
        console.log(`   ⚠ IP بلاک — ${label}`)
        console.log('      مرورگر بسته می‌شود و بعد صبر می‌کنیم')
        return 'BLOCKED'
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

/**
 * پایش فعال بلاک IP — هر لحظه که صدا زده شود یک درخواست سبک به سایت می‌زند.
 *
 * چرا لازم است؟ گرفتن بلاک فقط هنگام goto کافی نیست: اگر IP «وسط» عملیات
 * (حل کپچا، کلیک ورود، پر کردن گام‌ها) بلاک شود، صفحه‌ی قبلی هنوز در مرورگر
 * لود است و هیچ خطای ناوبری پرتاب نمی‌شود — موتور بی‌خبر می‌ماند و بی‌فایده
 * تکرار می‌کند. این تابع مستقل از DOM، اتصال واقعی به سایت را می‌سنجد.
 *
 * خروجی: true یعنی اتصال به سایت الان برقرار نیست (احتمال بلاک IP).
 */
async function probeIpBlock(page, timeoutMs = 15000) {
  try {
    const res = await page.request.get(LOGIN_URL, { timeout: timeoutMs })
    const st = res.status()
    return !(st > 0)   // هر پاسخ HTTP (حتی 4xx/5xx) یعنی اتصال هنوز هست
  } catch (e) {
    const msg = String((e && e.message) || e)
    // مرورگر بسته شده — مسئله‌ی دیگری است، بلاک نیست
    if (/Target page, context or browser has been closed|Target closed|Session closed/i.test(msg)) return false
    return isBlock(e) || /Timeout .* exceeded/i.test(msg)
  }
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

   ⚠ حالت جدید (خواسته‌ی کاربر) — گام ۵ و ۶ فقط همین دو ورودی:
       گام ۵ (مبدا):  MapCity (استان/شهرستان) + AddressSearch (محله/آدرس)
       گام ۶ (مقصد):  MapCity2 (استان/شهرستان) + AddressSearch2 (محله/آدرس)
     • استان اول از روی پلاک (کد ایران) تشخیص داده می‌شود
     • در هر ورودی حتما تایپ می‌شود (حرف‌به‌حرف)
     • بعد از تایپ صبر می‌شود تا لیست بالا بیاید
     • بعد گزینه‌ی درست انتخاب می‌شود
     • هیچ فیلد دیگری (dropdown استان، کدپستی، آدرس متنی و...) دست نمی‌خورد
     فعال‌سازی: کلید `onlySelect2: true` در STEP_ORIGIN / STEP_DEST
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   تشخیص استان از روی کد دو رقمی سمت راست پلاک

   در پلاک «۴۵ ع ۹۲۳ ۱۷»:
       ۴۵  = دو رقم اول (کد شهر/استان محل صدور)
       ۱۷  = کد ایران (استان)

   جدول رسمی راهنمایی و رانندگی — کد ایران به استان.
   ═══════════════════════════════════════════════════════════════════ */
const IRAN_CODE_TO_PROVINCE = {
  // مبنا: تشخیص استان از عدد اول پلاک در قالب پنل/پروفایل.
  '10': 'تهران', '11': 'تهران', '12': 'خراسان رضوی', '13': 'اصفهان',
  '14': 'خوزستان', '15': 'آذربایجان شرقی', '16': 'قم', '17': 'آذربایجان غربی',
  '18': 'همدان', '19': 'کرمانشاه', '20': 'تهران', '21': 'البرز',
  '22': 'تهران', '23': 'اصفهان', '24': 'خوزستان', '25': 'آذربایجان شرقی',
  '26': 'خراسان شمالی', '27': 'آذربایجان غربی', '28': 'همدان', '29': 'کرمانشاه',
  '30': 'البرز', '31': 'لرستان', '32': 'خراسان رضوی', '33': 'تهران',
  '34': 'خوزستان', '35': 'آذربایجان شرقی', '36': 'خراسان رضوی', '37': 'آذربایجان غربی',
  '38': 'البرز', '39': 'کرمان', '40': 'تهران', '41': 'لرستان',
  '42': 'خراسان رضوی', '43': 'اصفهان', '44': 'تهران', '45': 'کرمان',
  '46': 'گیلان', '47': 'مرکزی', '48': 'بوشهر', '49': 'کهگیلویه و بویر احمد',
  '51': 'کردستان', '52': 'خراسان جنوبی', '53': 'اصفهان', '54': 'یزد',
  '55': 'تهران', '56': 'گیلان', '57': 'مرکزی', '58': 'بوشهر',
  '59': 'گلستان', '61': 'کردستان', '62': 'مازندران', '63': 'فارس',
  '64': 'یزد', '65': 'کرمان', '66': 'تهران', '67': 'اصفهان',
  '68': 'البرز', '69': 'گلستان', '71': 'چهارمحال و بختیاری', '72': 'مازندران',
  '73': 'فارس', '74': 'خراسان رضوی', '75': 'کرمان', '76': 'گیلان',
  '77': 'تهران', '78': 'تهران', '79': 'قزوین', '81': 'چهارمحال و بختیاری',
  '82': 'مازندران', '83': 'فارس', '84': 'هرمزگان', '85': 'سیستان و بلوچستان',
  '86': 'سمنان', '87': 'زنجان', '88': 'تهران', '89': 'قزوین',
  '91': 'اردبیل', '92': 'مازندران', '93': 'فارس', '94': 'هرمزگان',
  '95': 'سیستان و بلوچستان', '96': 'سمنان', '97': 'زنجان', '98': 'ایلام',
  '99': 'تهران',
}
/**
 * استان را از پلاک تشخیص می‌دهد.
 * ورودی می‌تواند رشته («۴۵ ع ۹۲۳ ۱۷») یا شیء تجزیه‌شده باشد.
 */
function provinceFromPlate(plate) {
  let code = ''
  if (typeof plate === 'string') {
    const p = parsePlateText(plate)
    code = p.twoDigit || p.iran || ''
  } else if (plate && typeof plate === 'object') {
    code = plate.twoDigit || plate.two || plate.code || plate.iran || ''
  }
  code = toLatin(code).replace(/\D/g, '')
  if (!code) return null
  return IRAN_CODE_TO_PROVINCE[code] || null
}

const PROVINCES = {
  'آذربایجان شرقی':'4','آذربایجان شرقى':'4','آذربایجان غربی':'5','آذربایجان غربى':'5',
  'اردبیل':'25','اصفهان':'11','البرز':'31','ایلام':'18','بوشهر':'22','تهران':'1',
  'چهارمحال و بختیاری':'16','چهارمحال و بختیارى':'16','خراسان جنوبی':'30',
  'خراسان رضوی':'10','خراسان شمالی':'29','خوزستان':'7','زنجان':'20','سمنان':'23',
  'سیستان و بلوچستان':'12','فارس':'8','قزوین':'27','قم':'26','گلستان':'28','گیلان':'2',
  'لرستان':'17','مازندران':'3','مرکزی':'24','مرکزى':'24','هرمزگان':'14','همدان':'15',
  'کردستان':'13','کرمان':'9','کرمانشاه':'6','کهگیلویه و بویر احمد':'19','یزد':'21',
}

/* ═══════════════════════════════════════════════════════════════════
   کار با Select2 (کتابخانه‌ای که سایت در گام ۵ و ۶ استفاده می‌کند)

   Select2 یک <select> معمولی نیست — عنصر اصلی مخفی است و یک
   رابط جعلی روی آن ساخته می‌شود:

       <select id="MapCity" class="select2-hidden-accessible">   ← مخفی
       <span class="select2-selection" ...>                       ← چیزی که می‌بینیم
       <input class="select2-search__field">                      ← بعد از باز شدن
       <li class="select2-results__option">تهران</li>             ← گزینه‌ها

   پس نمی‌شود selectOption زد. باید:
       ۱) روی رابط کلیک کرد تا باز شود
       ۲) در کادر جستجو تایپ کرد
       ۳) صبر کرد تا نتایج با AJAX بیاید
       ۴) روی گزینه‌ی درست کلیک کرد
   ═══════════════════════════════════════════════════════════════════ */

/** یکسان‌سازی حروف برای مقایسه‌ی فارسی */
function foldFa(t) {
  return String(t || '')
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/[\u064B-\u0652\u0640\u200c]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * انتخاب یک گزینه از Select2 با تایپ کردن.
 *
 * ⚠ نکته‌ی حیاتی — چرا این‌قدر سخت‌گیرانه نوشته شده:
 *   در گام ۵ و ۶ چند Select2 روی صفحه هست (MapCity، AddressSearch،
 *   MapCity2، AddressSearch2). Select2 کادر جستجو و فهرست نتایج را
 *   در انتهای <body> می‌سازد، نه کنار خود <select>. اگر با سلکتور
 *   عمومی «.select2-container--open» کار کنیم، هیچ تضمینی نیست که
 *   کادرِ بازْ مالِ همان فیلدی باشد که می‌خواهیم — ممکن است شهرِ
 *   مقصد را در کادر مبدا تایپ کنیم.
 *
 *   راه‌حل: از رابطه‌ای که خود سایت در HTML گذاشته استفاده می‌کنیم:
 *       <input class="select2-search__field" aria-controls="select2-MapCity-results">
 *       <ul id="select2-MapCity-results">
 *   یعنی فهرست نتایجِ فیلد X همیشه id برابر  select2-<X>-results  دارد.
 *   پیش از هر تایپی، بررسی می‌کنیم که aria-controls کادر جستجو دقیقاً
 *   به همین فهرست اشاره کند. اگر نکند، تایپ نمی‌کنیم و خطا می‌دهیم.
 *
 * selectId  شناسه‌ی <select> اصلی، مثل 'MapCity'
 * text      متنی که باید تایپ و انتخاب شود
 * opts.exact       اگر true، فقط تطابق دقیق پذیرفته می‌شود
 * opts.allowFirst  اگر true، در نبود تطابق، اولین گزینه انتخاب می‌شود
 *                  (پیش‌فرض false — انتخاب کورکورانه خطرناک است)
 *
 * خروجی: { ok, picked, options[], reason }
 */
async function select2Pick(page, selectId, text, opts = {}) {
  const { exact = false, allowFirst = false, verbose = true } = opts
  const log = (m) => { if (verbose) console.log(m) }
  const want = String(text || '').trim()
  if (!want) return { ok: false, reason: 'متن خالی' }

  const resultsId = `select2-${selectId}-results`

  // ── ۰) هر Select2 بازِ دیگری را ببند ──
  //    وگرنه ممکن است در کادر جستجوی فیلد قبلی تایپ کنیم.
  const alreadyOpen = await page.evaluate(() =>
    !!document.querySelector('.select2-container--open')).catch(() => false)
  if (alreadyOpen) {
    log('      ⓘ یک Select2 باز بود — بسته شد')
    await page.keyboard.press('Escape').catch(() => {})
    await page.evaluate(() => {
      document.querySelectorAll('.select2-container--open')
        .forEach((c) => c.classList.remove('select2-container--open'))
    }).catch(() => {})
    await humanPause(300, 600)
  }

  // ── ۱) باز کردن همین فیلد ──
  const opened = await page.evaluate((id) => {
    const sel = document.getElementById(id)
    if (!sel) return 'no-select'
    /* رابط Select2 معمولا خواهرِ بعدیِ <select> است، ولی همیشه نه.
       اگر نبود، از روی .select2-container که aria-owns/‌فهرستش به
       این select اشاره دارد پیدایش می‌کنیم. */
    let ui = sel.nextElementSibling
    if (!(ui && ui.classList && ui.classList.contains('select2-container'))) {
      ui = (sel.parentElement || document)
        .querySelector(`.select2-container`)
    }
    const trigger = ui && ui.querySelector
      ? ui.querySelector('.select2-selection')
      : null
    if (!trigger) return 'no-ui'
    trigger.scrollIntoView({ block: 'center' })
    /* Select2 روی mousedown باز می‌شود */
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return 'ok'
  }, selectId).catch(() => 'err')

  if (opened !== 'ok') {
    log(`      ✖ باز نشد (${opened}) — ${selectId}`)
    return { ok: false, reason: opened }
  }
  await humanPause(500, 1000)

  // ── ۲) پیدا کردن کادر جستجوی *همین* فیلد ──
  //     تنها راه مطمئن: aria-controls باید برابر select2-<id>-results باشد.
  const boxSel = `input.select2-search__field[aria-controls="${resultsId}"]`
  let box = await page.$(boxSel)

  if (!box) {
    /* بعضی نسخه‌های Select2 به‌جای aria-controls از aria-owns استفاده
       می‌کنند یا فهرست را کمی دیرتر می‌سازند — کمی صبر کن. */
    for (let i = 0; i < 10 && !box; i++) {
      await page.waitForTimeout(300)
      box = await page.$(boxSel)
    }
  }

  if (!box) {
    /* آخرین تلاش: اگر فهرستِ همین فیلد روی صفحه هست، کادر جستجوی
       داخل همان dropdown را بردار. */
    const dropBox = `.select2-dropdown:has(#${resultsId}) input.select2-search__field`
    box = await page.$(dropBox).catch(() => null)
  }

  if (!box) {
    /* هیچ راه مطمئنی نماند — تایپ نمی‌کنیم.
       تایپ کورکورانه یعنی ریسک نوشتن در فیلد اشتباه. */
    const openId = await page.evaluate(() => {
      const i = document.querySelector('.select2-container--open input.select2-search__field')
      return i ? (i.getAttribute('aria-controls') || '(بدون aria-controls)') : '(هیچ کادری باز نیست)'
    }).catch(() => '?')
    log(`      ✖ کادر جستجوی «${selectId}» پیدا نشد — کادرِ باز: ${openId}`)
    await page.keyboard.press('Escape').catch(() => {})
    return { ok: false, reason: 'wrong-or-missing-search-box' }
  }

  // ── ۲.۵) تایید نهایی پیش از تایپ: مطمئن شو فوکوس روی همین کادر است ──
  await box.click().catch(() => {})
  await humanPause(200, 450)

  const focusOk = await page.evaluate((rid) => {
    const a = document.activeElement
    if (!a || !a.classList || !a.classList.contains('select2-search__field')) return false
    return a.getAttribute('aria-controls') === rid
  }, resultsId).catch(() => false)

  if (!focusOk) {
    log(`      ✖ فوکوس روی کادر «${selectId}» ننشست — تایپ نشد (جلوگیری از نوشتن در فیلد اشتباه)`)
    await page.keyboard.press('Escape').catch(() => {})
    return { ok: false, reason: 'focus-mismatch' }
  }

  // کاراکتر به کاراکتر — سایت با هر حرف یک درخواست AJAX می‌زند
  for (const ch of want) {
    await page.keyboard.type(ch, { delay: 0 }).catch(() => {})
    await humanPause(90, 220)
  }
  log(`      ⌨ در «${selectId}» تایپ شد: «${want}» — صبر تا لیست بالا بیاید...`)

  // ── ۳) صبر تا نتایجِ *همین* فهرست بیاید ──
  //     «در حال جستجو» و «موردی یافت نشد» را هم تشخیص می‌دهیم.
  //     ⚠ «موردی یافت نشد» ممکن است موقتی باشد (درخواست AJAX سایت هنوز
  //     جواب نداده)؛ تا ۴ بار دوباره چک می‌کنیم و فقط بعد تسلیم می‌شویم.
  let options = []
  let emptyCount = 0
  await page.waitForTimeout(2000)              // نفسی به AJAX سایت بده
  for (let i = 0; i < 60; i++) {               // تا ۳۰ ثانیه
    await page.waitForTimeout(500)
    const st = await page.evaluate((rid) => {
      const ul = document.getElementById(rid)
      if (!ul) return { state: 'none', items: [] }
      const msg = ul.querySelector('.select2-results__message')
      if (msg) {
        const t = (msg.textContent || '').trim()
        if (/یافت نشد/.test(t)) return { state: 'empty', items: [] }
        return { state: 'loading', items: [] }   // «در حال جستجو…»
      }
      const items = Array.from(ul.querySelectorAll('li.select2-results__option'))
        .filter((li) => !li.classList.contains('select2-results__message'))
        .map((li) => (li.textContent || '').trim())
        .filter(Boolean)
      return { state: items.length ? 'ready' : 'loading', items }
    }, resultsId).catch(() => ({ state: 'err', items: [] }))

    if (st.state === 'ready') { options = st.items; break }
    if (st.state === 'empty') {
      emptyCount++
      if (emptyCount >= 4) {
        log(`      ✖ سایت گفت «موردی یافت نشد» برای «${want}» (پس از ${emptyCount} بررسی)` )
        await page.keyboard.press('Escape').catch(() => {})
        return { ok: false, reason: 'not-found', options: [] }
      }
      await page.waitForTimeout(1200)
      continue
    }
  }

  if (!options.length) {
    log(`      ✖ فهرست نتایج «${selectId}» نیامد`)
    await page.keyboard.press('Escape').catch(() => {})
    return { ok: false, reason: 'no-results' }
  }

  log(`      ⓘ ${options.length} نتیجه: ${options.slice(0, 5).join(' | ')}${options.length > 5 ? ' …' : ''}`)
  await humanPause(400, 900)

  // ── ۴) انتخاب بهترین گزینه — فقط از فهرستِ همین فیلد ──
  const picked = await page.evaluate(({ want, exact, allowFirst, rid }) => {
    const fold = (t) => String(t || '')
      .replace(/[\u064A\u0649]/g, '\u06CC')
      .replace(/\u0643/g, '\u06A9')
      .replace(/[\u0622\u0623\u0625]/g, '\u0627')
      .replace(/[\u064B-\u0652\u0640\u200c]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    const ul = document.getElementById(rid)
    if (!ul) return null
    const items = Array.from(ul.querySelectorAll('li.select2-results__option'))
      .filter((li) => !li.classList.contains('select2-results__message'))
    if (!items.length) return null

    const w = fold(want)
    let hit =
      items.find((li) => fold(li.textContent) === w) ||                          // دقیق
      (exact ? null : items.find((li) => fold(li.textContent).startsWith(w))) || // شروع با
      (exact ? null : items.find((li) => fold(li.textContent).includes(w)))      // شامل
    /* اگر فقط یک گزینه در فهرست است و با متن تایپ‌شده هم‌خانواده است
       (یکی شامل دیگری باشد — مثل «بوشهر» و «شهرستان بوشهر»)، همان را
       انتخاب کن. سایت‌های AJAX گاهی دقیقا فقط همان یک مورد را برمی‌گردانند. */
    if (!hit && items.length === 1) {
      const one = fold(items[0].textContent)
      if (one.includes(w) || w.includes(one)) hit = items[0]
    }
    /* اولین گزینه فقط وقتی که صریحا اجازه داده شده باشد.
       پیش‌تر این کار همیشه انجام می‌شد و می‌توانست شهر اشتباه ثبت کند. */
    if (!hit && allowFirst) hit = items[0]
    if (!hit) return null

    const label = (hit.textContent || '').trim()
    hit.scrollIntoView({ block: 'center' })
    /* Select2 روی mouseup انتخاب می‌کند، ولی برای اطمینان هر سه را می‌زنیم */
    hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    hit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return label
  }, { want, exact, allowFirst, rid: resultsId }).catch(() => null)

  if (!picked) {
    log(`      ✖ گزینه‌ی مناسب برای «${want}» نبود`)
    log(`         موجود: ${options.slice(0, 10).join(' | ')}`)
    await page.keyboard.press('Escape').catch(() => {})
    return { ok: false, reason: 'no-match', options }
  }

  await humanPause(600, 1200)

  // ── ۵) تایید اینکه واقعا در *همین* فیلد نشست ──
  const shown = await page.evaluate((id) => {
    const sel = document.getElementById(id)
    if (!sel) return { text: '', value: '' }
    let ui = sel.nextElementSibling
    if (!(ui && ui.classList && ui.classList.contains('select2-container'))) {
      ui = (sel.parentElement || document).querySelector('.select2-container')
    }
    const r = ui && ui.querySelector ? ui.querySelector('.select2-selection__rendered') : null
    let text = ''
    if (r && !r.querySelector('.select2-selection__placeholder')) {
      text = (r.textContent || '').replace(/×/g, '').trim()
    }
    return { text, value: sel.value || '' }
  }, selectId).catch(() => ({ text: '', value: '' }))

  if (!shown.text) {
    log(`      ⚠ «${picked}» کلیک شد ولی در کادر «${selectId}» ننشست`)
    return { ok: false, reason: 'not-applied', picked, options }
  }

  log(`      ✔ ${selectId} = ${shown.text}${shown.value ? ` (کد ${shown.value})` : ''}`)
  return { ok: true, picked: shown.text, value: shown.value, options }
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

async function fillLocationStep(page, cfg, loc, OUT, tag, verbose = true, plate = null) {
  const log = (m) => { if (verbose) console.log(m) }

  await unhide(page, cfg.wrapperId)
  await humanPause(600, 1200)

  /* ── استان ──
     اگر کاربر «تشخیص خودکار» را انتخاب کرده باشد، استان از کد ایران
     پلاک درمی‌آید. وگرنه همان چیزی که خودش نوشته. */
  let province = loc.province
  const plateProvince = plate ? provinceFromPlate(plate) : null
  const plateShown = typeof plate === 'string' ? plate : ((plate && plate.text) || '')
  if (loc.autoProvince && plate) {
    if (plateProvince) {
      province = plateProvince
      log(`   ⓘ استان از پلاک «${plateShown}» تشخیص داده شد: ${province}`)
    } else {
      log(`   ⚠ استان از پلاک تشخیص داده نشد — از مقدار پروفایل استفاده می‌شود`)
    }
  } else if (plateProvince) {
    log(`   ⓘ کد ایران پلاک «${plateShown}» → استان «${plateProvince}» (به‌عنوان یکی از متن‌های تایپ هم استفاده می‌شود)`)
  }

  /* ═══════════════════════════════════════════════════════════════════
     حالت جدید (گام ۵ و ۶) — فقط همین دو ورودی Select2
     ───────────────────────────────────────────────────────────────────
       گام ۵ (مبدا):  MapCity (شهرستان) + AddressSearch (شهر/روستا/محله)
       گام ۶ (مقصد):  MapCity2 (شهرستان) + AddressSearch2 (شهر/روستا/محله)

       دقیقا طبق خواسته‌ی کاربر:
         • «استان» از پنل ربات (تشخیص‌داده‌شده از پلاک یا انتخاب دستی)
           گرفته می‌شود و اول در «شهرستان» تایپ می‌شود
         • مقدار «شهر مبدا/مقصد» پنل (که محله/روستا در آن گذاشته می‌شود)
           در «شهر/روستا/محله» تایپ می‌شود
         • بعد از هر تایپ صبر می‌کنیم تا لیست بالا بیاید و انتخاب می‌کنیم
         • هیچ فیلد دیگری دست نمی‌خورد
       ═══════════════════════════════════════════════════════════════ */

  /* متنی که شبیه آدرس است نه نام شهرستان —
     «شهید نظام احسایی، خیابان میرزا رضا» را نباید در کادر شهرستان تایپ کرد */
  const looksLikeAddress = (t) =>
    /خیابان|کوچه|میدان|بلوار|جاده|بزرگراه|اتوبان|پارک|بازار|شهرک|مجتمع|برج|ساختمان|بنگاه|تعمیرگاه/.test(String(t || '')) ||
    String(t || '').length > 24

  if (cfg.onlySelect2) {
    /* ── ورودی اول: شهرستان (MapCity / MapCity2) ──
       اول «استان» از پنل تایپ می‌شود (تشخیص‌داده‌شده از پلاک یا انتخاب دستی).
       اگر «شهر» پنل شبیه نام شهرستان بود (نه آدرس/محله)، بعد از استان
       همان هم امتحان می‌شود. */
    if (cfg.mapCity) {
      const chain = unique([
        province,                                   // ۱) استان از پنل/پلاک
        looksLikeAddress(loc.city) ? '' : loc.city, // ۲) شهرستان (اگر آدرس نباشد)
        looksLikeAddress(loc.locality) ? '' : loc.locality,
      ])
      let pickedCity = null
      for (const term of chain) {
        if (!term) continue
        log(`   → ${cfg.mapCity} (شهرستان): تایپ «${term}» — صبر تا لیست...`)
        const r = await select2Pick(page, cfg.mapCity, term, { verbose, allowFirst: false })
        if (r.ok) { pickedCity = r.picked; break }
        log(`      ⓘ «${term}» در لیست نبود (${r.reason}) — تلاش با متن بعدی`)
        await humanPause(500, 1000)
      }
      if (!pickedCity) {
        log(`   ✖ شهرستان «${province || loc.city}» انتخاب نشد — متن‌های امتحان‌شده: ${chain.filter(Boolean).join(' | ') || '(خالی)'}`)
        await page.screenshot({ path: path.join(OUT, `${tag}-nomapcity.png`), fullPage: true }).catch(() => {})
        return false
      }
      log(`   ✔ ${cfg.mapCity} (شهرستان) = «${pickedCity}»`)
      await humanPause(1500, 2500)   // فرصت به AJAX فیلد بعدی (محله)
    }

    /* ── ورودی دوم: شهر/روستا/محله (AddressSearch / AddressSearch2) ──
       اول مقدار «شهر مبدا/مقصد» پنل تایپ می‌شود (همان‌جایی که محله/روستا
       گذاشته می‌شود)؛ بعد محله‌ی جدا، بعد بخش اول آدرس (کوتاه‌شده).
       نمونه: «سرتل ۳۹» → اول «سرتل ۳۹»، بعد «سرتل» (مثل نمونه‌ی واقعی
       سایت که با «سرتل» نتایج «سرتل، کوچه سرتل ۳۹، ...» می‌آمد) */
    if (cfg.addressSearch) {
      const addrPart = String(loc.address || '').trim()
        .split(/[،,\-]/)[0].trim()
      const shortAddr = addrPart.length > 30 ? addrPart.slice(0, 30) : addrPart
      const addrNoDigits = shortAddr.replace(/\s*[\d۰-۹]+\s*$/, '').trim()
      const chain = unique([
        loc.city,                                   // ۱) «شهر» پنل (محله در همین‌جا)
        loc.locality !== loc.city ? loc.locality : '',
        shortAddr,                                  // ۲) بخش اول آدرس
        addrNoDigits,                               // ۳) بدون رقم («سرتل ۳۹» → «سرتل»)
      ])
      let pickedAddr = null
      for (const term of chain) {
        if (!term) continue
        log(`   → ${cfg.addressSearch} (شهر/روستا/محله): تایپ «${term}» — صبر تا لیست...`)
        const r = await select2Pick(page, cfg.addressSearch, term, { verbose, allowFirst: false })
        if (r.ok) { pickedAddr = r.picked; break }
        log(`      ⓘ «${term}» در لیست نبود (${r.reason}) — تلاش با متن بعدی`)
        await humanPause(500, 1000)
      }
      if (!pickedAddr) {
        log(`   ⚠ شهر/روستا/محله انتخاب نشد (متن‌های امتحان‌شده: ${chain.filter(Boolean).join(' | ') || '(خالی)'})`)
        log('      → متن «شهر مبدا/مقصد» پنل را طوری بنویس که در جستجوی سایت پیدا شود')
      } else {
        log(`   ✔ ${cfg.addressSearch} (شهر/روستا/محله) = «${pickedAddr}»`)
      }
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
    await humanPause(600, 1200)

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
      const sw = await readSwalError(page)
      if (sw) log(`      • پاپ‌آپ: ${sw}`)
      await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
    }
    return active
  }

  /* ═══════════════════════════════════════════════════════════════════
     رفتار قبلی (کامل) — فقط برای حالتی که onlySelect2 نباشد:
     dropdown استان + شهر + Select2 ها + کدپستی و آدرس متنی
     ═══════════════════════════════════════════════════════════════════ */

  const pv = PROVINCES[province]
  if (!pv) { log(`   ✖ استان «${province}» شناخته نشد`); return false }
  await pickSelect(page, cfg.state, pv)
  log(`   ✔ استان: ${province} (${pv})`)
  await humanPause(1200, 2200)   // فرصت به AJAX شهرها

  /* ── شهرستان (Select2 اول) ──
     ورودی درست: نام شهر پروفایل. اگر خالی بود، نام استان.
     exact نمی‌گذاریم چون سایت گاهی «سیرجان» را «شهرستان سیرجان»
     می‌نویسد، ولی allowFirst هم نمی‌دهیم تا شهر بی‌ربط انتخاب نشود. */
  if (cfg.mapCity) {
    const cityName = (loc.city || province || '').trim()
    log(`   → ${cfg.mapCity} (شهرستان): تایپ «${cityName}»`)
    const r = await select2Pick(page, cfg.mapCity, cityName, { verbose, allowFirst: false })
    if (!r.ok) {
      log(`   ✖ شهرستان «${cityName}» انتخاب نشد (${r.reason})`)
      if (r.options && r.options.length) log(`      موجود: ${r.options.join(' | ')}`)
      await page.screenshot({ path: path.join(OUT, `${tag}-nomapcity.png`), fullPage: true }).catch(() => {})
      return false
    }
    /* شهرستانِ انتخاب‌شده معمولا فهرست فیلد بعدی را با AJAX عوض می‌کند */
    await humanPause(1200, 2200)
  }

  /* ── جستجوی آدرس / محله (Select2 دوم) ──
     ⚠ این فیلد شهرستان نیست. ورودی درستش متنِ آدرس است، نه نام شهر.
     ترتیب تلاش:  locality → آدرس → شهر
     اگر پیدا نشد، ادامه می‌دهیم چون فیلد آدرس متنی جداگانه هم پر می‌شود. */
  if (cfg.addressSearch) {
    const candidates = [loc.locality, loc.address, loc.city]
      .map((x) => String(x || '').trim())
      .filter(Boolean)

    let done = false
    for (const q of candidates) {
      /* آدرس‌های بلند را کوتاه می‌کنیم — Select2 با جمله‌ی طولانی
         چیزی پیدا نمی‌کند. اولین دو بخشِ آدرس معمولا کافی است. */
      const term = q.length > 30 ? q.split(/[،,\-]/)[0].trim() : q
      if (!term) continue
      log(`   → ${cfg.addressSearch} (جستجوی آدرس): تایپ «${term}»`)
      const r2 = await select2Pick(page, cfg.addressSearch, term, { verbose, allowFirst: false })
      if (r2.ok) { done = true; await humanPause(800, 1500); break }
      log(`      ⓘ «${term}» نتیجه نداد (${r2.reason})`)
      await humanPause(400, 800)
    }
    if (!done) log('   ⚠ جستجوی آدرس نتیجه نداد — با آدرس متنی ادامه می‌دهیم')
  }

  /* ── dropdown قدیمی شهر (اگر هنوز روی صفحه باشد) ── */
  if (cfg.city) {
    const exists = await page.$(cfg.city)
    if (exists) {
      const city = await pickCity(page, cfg.city, loc.city)
      if (city && city.text) log(`   ✔ شهر: ${city.text}`)
    }
  }

  const setVal = async (sel, val) => {
    if (!val) return
    const el = await page.$(sel); if (!el) return
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
    await humanPause(300, 700)
  }

  if (loc.postalCode) await setVal(cfg.postal, loc.postalCode)
  await setVal(cfg.address, loc.address)
  log(`   ✔ آدرس: ${loc.address}`)

  await page.screenshot({ path: path.join(OUT, `${tag}-filled.png`), fullPage: true }).catch(() => {})
  await humanPause(500, 1000)

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
    const sw = await readSwalError(page)
    if (sw) log(`      • پاپ‌آپ: ${sw}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {})
  }
  return active
}

/** عناصر تکراری را با حفظ ترتیب حذف می‌کند (برای زنجیره‌ی متن‌های تایپ) */
function unique(arr) {
  const seen = new Set()
  const out = []
  for (const x of arr) {
    const k = String(x || '').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

const STEP_ORIGIN = {
  label: 'گام ۵: مبدا بارگیری', wrapperId: 'normalmabda',
  state: '#ddStateSource', city: '#ddCitySource',
  // Select2 های نقشه — باید تایپ و انتخاب شوند
  mapCity: 'MapCity', addressSearch: 'AddressSearch',
  postal: '#sourcePostalCode', address: '#txtAddressSource',
  nextBtn: '#btnGoLVL6', nextPane: 'pills-6',
  // خواسته‌ی کاربر: گام ۵ فقط همین دو ورودی (استان/شهرستان + محله) پر شود
  onlySelect2: true,
}
const STEP_DEST = {
  label: 'گام ۶: مقصد تخلیه', wrapperId: 'normalmagsad',
  state: '#ddStateDest', city: '#ddCityDest',
  // در گام ۶ شناسه‌ها عدد ۲ دارند
  mapCity: 'MapCity2', addressSearch: 'AddressSearch2',
  postal: '#destPostalCode', address: '#txtAddressDest',
  nextBtn: '#btnGoLVL7', nextPane: 'pills-7',
  // خواسته‌ی کاربر: گام ۶ فقط همین دو ورودی (استان/شهرستان + محله) پر شود
  onlySelect2: true,
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
    /* خطای «محدودیت زمانی در ثبت بارنامه شهری» را همین‌جا پرتاب کن تا
       نوع rate_limited تشخیص داده شود و وظیفه ۳۰ دقیقه بعد دوباره اجرا شود */
    if (swal && RATE_LIMIT_RE.test(swal)) throw new Error(cleanSiteErrorMessage(swal))
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


/* ── OTP نهایی سایت، بعد از کلیک ثبت نهایی ── */
async function isOtpModalVisible(page) {
  return page.evaluate(() => {
    const m = document.getElementById('GetOptCodeModal')
    if (!m) return false
    const st = window.getComputedStyle(m)
    return st.display !== 'none' && st.visibility !== 'hidden' && m.classList.contains('show')
  }).catch(() => false)
}

async function fillFinalOtpModal(page, code, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }
  const otp = String(code || '').replace(/\D/g, '').slice(0, 6)
  if (otp.length !== 6) return false

  const ok = await page.evaluate((otp) => {
    const modal = document.getElementById('GetOptCodeModal')
    if (!modal) return false
    const boxes = Array.from(modal.querySelectorAll('input.otp-box'))
    if (boxes.length < 6) return false
    for (let i = 0; i < 6; i++) {
      const el = boxes[i]
      el.value = otp[i]
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: otp[i] }))
    }
    const hidden = document.getElementById('otp') || modal.querySelector('input[name="otp"]')
    if (hidden) {
      hidden.value = otp
      hidden.dispatchEvent(new Event('input', { bubbles: true }))
      hidden.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return true
  }, otp).catch(() => false)

  if (!ok) return false
  log(`   ✔ کد پیامکی ${otp} در پنجره OTP وارد شد`)
  await page.waitForTimeout(300)
  await page.click('#submitOtp').catch(async () => {
    await page.evaluate(() => document.getElementById('submitOtp')?.click()).catch(() => {})
  })
  log('   ➜ دکمه ثبت OTP کلیک شد')
  await page.waitForTimeout(1500)
  return true
}

async function waitAndSubmitFinalOtp(page, getOtpCode, timeoutMs = 60_000, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }
  if (typeof getOtpCode !== 'function') {
    log('   ✖ پنجره OTP باز شد ولی منبع دریافت کد پیامکی تعریف نشده است')
    return false
  }

  const started = Date.now()
  log('   🔐 پنجره کد پیامکی نمایش داده شد؛ تا ۱ دقیقه منتظر پیامک همان حساب می‌مانم...')
  let lastCode = ''
  while (Date.now() - started < timeoutMs) {
    let code = ''
    try { code = String(await getOtpCode() || '').replace(/\D/g, '').slice(0, 6) } catch (e) { code = '' }
    if (code && code !== lastCode) {
      lastCode = code
      if (code.length === 6) return fillFinalOtpModal(page, code, verbose)
    }
    await page.waitForTimeout(3000)
  }
  log('   ✖ در مهلت ۱ دقیقه‌ای، کد پیامکی مربوط به این حساب دریافت نشد')
  return false
}

/* ═══════════ گام ۹: تایید + کپچا + ثبت نهایی ═══════════ */
async function finalConfirmStep(page, OUT, tag, opts = {}) {
  const { verbose = true, dryRun = true, getOtpCode = null } = opts
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
  let finalSuccess = null
  let otpHandled = false
  for (let i = 0; i < 90; i++) {
    if (!otpHandled && await isOtpModalVisible(page)) {
      otpHandled = true
      const okOtp = await waitAndSubmitFinalOtp(page, getOtpCode, 60_000, verbose)
      if (!okOtp) {
        await page.screenshot({ path: path.join(OUT, `${tag}-otp-failed.png`), fullPage: true }).catch(() => {})
        return {
          success: false,
          kind: 'otp_failed',
          error: 'کد یکبارمصرف پیامکی دریافت نشد یا در پنجره OTP ثبت نشد',
        }
      }
    }

    const st = await page.evaluate(() => {
      const code = (document.getElementById('TrackingCodeNumber') || {}).value || ''
      const box = document.getElementById('trackingcode')
      const text = (box ? box.innerText : document.body.innerText || '').replace(/\s+/g, ' ').trim()
      const success = !!(
        box &&
        /سند حمل بار/.test(text) &&
        /صادر گردید/.test(text) &&
        document.getElementById('pelakFinal') &&
        document.getElementById('OrginFinal') &&
        document.getElementById('DestFinal')
      )
      return {
        code: String(code || '').trim(),
        success,
        text: success ? text.slice(0, 500) : '',
        plate: (document.getElementById('pelakFinal') || {}).textContent || '',
        origin: (document.getElementById('OrginFinal') || {}).textContent || '',
        dest: (document.getElementById('DestFinal') || {}).textContent || '',
      }
    }).catch(() => ({ code: '', success: false, text: '', plate: '', origin: '', dest: '' }))

    code = st.code || ''
    if (st.success) finalSuccess = st
    if (code || finalSuccess) break
    swalErr = await readSwalError(page)
    if (swalErr) break
    await page.waitForTimeout(500)
  }

  if (swalErr) {
    const cleanErr = cleanSiteErrorMessage(swalErr)
    const rateLimited = isRateLimitError(swalErr) || isRateLimitError(cleanErr)
    const accountRestricted = !rateLimited && (isAccountRestrictedError(swalErr) || isAccountRestrictedError(cleanErr))
    const permanent = accountRestricted || /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید/.test(cleanErr)
    log(`\n   ✖ خطای سایت هنگام ثبت نهایی:`)
    log(`      ${cleanErr}`)
    if (rateLimited) {
      log('   ⏸ محدودیت زمانی ثبت بارنامه شهری — این اکانت/پلاک باید ۳۰ دقیقه صبر کند؛ وظیفه برای نیم ساعت بعد زمان‌بندی می‌شود')
      await page.screenshot({ path: path.join(OUT, `${tag}-ratelimit.png`), fullPage: true }).catch(() => {})
      return { success: false, kind: 'rate_limited', error: cleanErr }
    }
    if (accountRestricted) {
      log('   🛑 حساب برای صدور بارنامه شهری محدود/مسدود شده است — همه عملیات‌های این اکانت متوقف می‌شود')
    } else if (permanent) {
      log('   🛑 این خطا دائمی است — تکرار بی‌فایده است، داده را اصلاح کن')
    } else {
      log('   ↻ خطای موقتی — ربات اصلی طبق سیاست تلاش مجدد دوباره شروع می‌کند')
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-swal.png`), fullPage: true }).catch(() => {})
    return {
      success: false,
      kind: accountRestricted ? 'account_restricted' : (permanent ? 'permanent' : 'error'),
      error: cleanErr,
    }
  }

  if (code) {
    log(`\n   🎉 بارنامه ثبت شد — کد رهگیری: ${code}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-receipt.png`), fullPage: true }).catch(() => {})
    return { success: true, trackingCode: code }
  }

  if (finalSuccess) {
    log('\n   🎉 بارنامه با موفقیت ثبت شد — صفحه «سند حمل صادر گردید» نمایش داده شد')
    const plate = String(finalSuccess.plate || '').trim()
    const origin = String(finalSuccess.origin || '').trim()
    const dest = String(finalSuccess.dest || '').trim()
    if (plate || origin || dest) log(`      ${plate ? `پلاک: ${plate}` : ''}${origin || dest ? ` | مسیر: ${origin || '—'} ← ${dest || '—'}` : ''}`)
    log('      کد رهگیری در فیلد TrackingCodeNumber خوانده نشد، اما رسید نهایی سایت تایید شد.')
    await page.screenshot({ path: path.join(OUT, `${tag}-receipt.png`), fullPage: true }).catch(() => {})
    return { success: true, trackingCode: '', finalReceipt: true }
  }

  log('   ✖ نه کد رهگیری دریافت شد و نه صفحه رسید نهایی دیده شد:')
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

/* ═══════════ تشخیص خطای نام کاربری / رمز عبور ═══════════
   سایت هنگام اشتباه بودن مشخصات، پاپ‌آپ قرمز نشان می‌دهد:
       «کاربری با این مشخصات در سامانه یافت نشد.»
   این خطا با تکرار حل نمی‌شود — باید به کاربر گفته شود. */

/** الگوهای «مشخصات حساب اشتباه است» */
const BAD_CREDENTIALS_RE = /کاربری با این مشخصات|کاربری یافت نشد|کاربر یافت نشد|نام کاربری یا رمز|رمز عبور اشتباه|کلمه عبور اشتباه|رمز اشتباه|اطلاعات ورود نادرست|نام کاربری اشتباه/

/** الگوهای «حساب مسدود یا غیرفعال است» */
const ACCOUNT_LOCKED_RE = /حساب.*مسدود|حساب.*قفل|کاربر.*غیرفعال|دسترسی شما.*مسدود|حساب شما.*تعلیق|غیرفعال شده/

/**
 * خطای ورود را دسته‌بندی می‌کند و پیام فارسی قابل‌فهم می‌سازد.
 * خروجی: { kind, message } یا null اگر مربوط به اعتبار نباشد
 */
function classifyCredentialError(raw) {
  const t = String(raw || '')
  if (!t) return null

  if (ACCOUNT_LOCKED_RE.test(t)) {
    return {
      kind: 'account_locked',
      message: 'حساب باربگ مسدود یا غیرفعال شده است — با پشتیبانی سامانه تماس بگیرید',
    }
  }
  if (BAD_CREDENTIALS_RE.test(t)) {
    return {
      kind: 'bad_credentials',
      message: 'نام کاربری (کد ملی) یا رمز عبور حساب باربگ اشتباه است — از صفحه «حساب‌های باربگ» اصلاحش کنید',
    }
  }
  return null
}



async function isLoggedInByUserMenu(page) {
  return page.evaluate(() => {
    const clean = (t) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()
    const url = location.href
    const onNotification = /\/Barname\/Notification\/Notification/i.test(url)
    const onLogin = /\/Account\/Login/i.test(url)
    const hasLoginForm = !!document.querySelector('#NationalCode, #user-password, #inter')
    if (onLogin || hasLoginForm) return false

    const names = Array.from(document.querySelectorAll('span.user-name, small.user-name'))
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length >= 3 && !/خوش آمدید|نام کاربر|خروج|ورود/.test(t))
    const hasWelcome = Array.from(document.querySelectorAll('.user-status, small.user-status'))
      .some((el) => /خوش آمدید/.test(el.textContent || ''))

    // شرط اصلی کاربر: صفحه Notification کامل لود شده و منوی کاربر آمده باشد.
    // برای مسیرهای مشابه بعد از لاگین هم اگر همین منوی کاربر موجود باشد، موفق حساب می‌شود.
    return names.length > 0 && (hasWelcome || onNotification)
  }).catch(() => false)
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

  /* پاپ‌آپ خطا از نوع toast است و فقط ۵ ثانیه روی صفحه می‌ماند، بعد
     خودش محو می‌شود و سایت دوباره صفحه‌ی Login را نشان می‌دهد.
     اگر دیر بخوانیم، پیام را از دست می‌دهیم و به‌جای «رمز اشتباه»
     «زمان انتظار تمام شد» می‌گیریم — که اشتباها تکرارپذیر حساب می‌شود.
     پس: اولین پیامی که دیدیم را نگه می‌داریم. */
  let seenCredError = null

  while (Date.now() - t0 < maxMs) {
    /* قبل از هر چیز، پاپ‌آپ خطا را بخوان — چون زود محو می‌شود */
    if (!seenCredError) {
      const quick = await page.evaluate(() => {
        const pop = document.querySelector('.swal2-popup.swal2-icon-error')
        if (pop && pop.offsetParent !== null) {
          const b = (document.getElementById('swal2-html-container')?.textContent || '').trim()
          const h = (document.getElementById('swal2-title')?.textContent || '').trim()
          if (b || h) return (b || h).replace(/\s+/g, ' ').slice(0, 200)
        }
        return ''
      }).catch(() => '')
      if (quick) {
        const c = classifyCredentialError(quick)
        if (c) seenCredError = { raw: quick, ...c }
      }
    }
    if (seenCredError) {
      return {
        ok: false, error: seenCredError.message, rawError: seenCredError.raw,
        fatal: true, credentialKind: seenCredError.kind,
        waited: Math.round((Date.now() - t0) / 1000),
      }
    }

    // ۱) شرط قطعی ورود: صفحه بعد از لاگین کامل لود شده و منوی کاربر/خوش‌آمدید آمده باشد.
    // نمونه‌ی مورد انتظار سایت: /Barname/Notification/Notification + span.user-name + user-status=خوش آمدید
    let url = ''
    try { url = page.url() } catch { /* در حال ناوبری */ }
    if (url && !url.includes('Login')) {
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      if (await isLoggedInByUserMenu(page)) {
        return { ok: true, waited: Math.round((Date.now() - t0) / 1000), transient }
      }
    }

    // ۲) پیام خطا
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

    await page.waitForTimeout(250).catch(() => {})
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
    return (body || title).replace(/\s+/g, ' ').slice(0, 1000)
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

async function readServerConnectionTableError(page) {
  return page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('td[colspan]'))
    for (const td of cells) {
      const t = (td.textContent || '').replace(/\s+/g, ' ').trim()
      if (/خطا در برقراری ارتباط با سرور|Service Unavailable/i.test(t)) return t
    }
    return ''
  }).catch(() => '')
}

async function readStep3ServerTempError(page) {
  const sw = await readSwalError(page)
  const td = await readServerConnectionTableError(page)
  const msg = [sw, td].filter(Boolean).join(' | ')
  return isServerTempError(msg) ? (msg || 'Service Unavailable') : ''
}

async function fillDriverVehicleStepWithRetries(page, driver, OUT, tag, verbose = true) {
  const log = (m) => { if (verbose) console.log(m) }
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      log(`   ↻ تلاش مجدد گام ۳ داخل همین صفحه (${attempt}/3) — بدون رفرش`)
      await page.evaluate(() => {
        const b = document.querySelector('.swal2-popup .swal2-close, .swal2-popup .swal2-confirm')
        if (b) b.click()
      }).catch(() => {})
      await page.waitForTimeout(2500)
    }
    const serverErrBefore = await readStep3ServerTempError(page)
    if (serverErrBefore) throw new Error(`SERVER_TEMP_STEP3: ${serverErrBefore}`)
    const ok = await fillDriverVehicleStep(page, driver, OUT, tag, verbose)
    if (ok) return true
    const serverErrAfter = await readStep3ServerTempError(page)
    if (serverErrAfter) throw new Error(`SERVER_TEMP_STEP3: ${serverErrAfter}`)
    lastError = `پلاک یا راننده پیدا نشد: ${driver.plateText || ''} / ${driver.name || ''} ${driver.nationalId || ''}`
  }
  throw new Error(`DRIVER_PLATE_NOT_FOUND: ${lastError}`)
}


/* ═══════════════════════════════════════════════════════════════════
   تشخیص وضعیت سلامت — «چه بلایی سر ما آمد؟»
   ═══════════════════════════════════════════════════════════════════ */



const GENERAL_NETWORK_CHECK_URLS = (process.env.NETWORK_CHECK_URLS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
const DEFAULT_GENERAL_NETWORK_CHECK_URLS = [
  'https://www.gstatic.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace',
  'https://www.msftconnecttest.com/connecttest.txt',
]
async function isGeneralInternetOnline(timeoutMs = 5000) {
  const urls = GENERAL_NETWORK_CHECK_URLS.length ? GENERAL_NETWORK_CHECK_URLS : DEFAULT_GENERAL_NETWORK_CHECK_URLS
  for (const url of urls) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { 'User-Agent': 'barbarg-bot-network-check' } })
      clearTimeout(timer)
      if (res.status > 0 && res.status < 500) return true
    } catch (e) {
      clearTimeout(timer)
    }
  }
  return false
}
async function assertGeneralInternet(stage = 'شروع عملیات') {
  const ok = await isGeneralInternetOnline(5000)
  if (!ok) throw new Error(`INTERNET_DISCONNECTED: اتصال اینترنت قبل از «${stage}» برقرار نیست`)
}

/** خطاهای شبکه‌ای که یعنی IP بلاک شده یا اتصال قطع است */
const NET_BLOCK_RE = /INTERNET_DISCONNECTED|اتصال اینترنت|اینترنت قطع|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_SOCKET_NOT_CONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|net::ERR_/i

/** صفحه/مرورگر مرده است */
const PAGE_DEAD_RE = /Target page, context or browser has been closed|Target closed|browser has been closed|Session closed|Protocol error/i

/** خطاهای موقتی سرور/ارتباط داخلی سایت */
const SERVER_TEMP_RE = /Service Unavailable|service is unavailable|temporarily unavailable|خطا در برقراری ارتباط با سرور|قادر به پاسخگویی|سرور در حال حاضر|چند دقیقه دیگر مجدد|HTTP status code.*400|Status:\s*400/i

/** پاپ‌آپ‌های خطای سرور که یعنی «مرورگر را ببند، ۱ تا ۲ دقیقه صبر کن، از اول شروع کن»:
      • «خطا در پردازش درخواست»
      • «The HTTP status code of the response was not expected (503)»  */
const SERVER_POPUP_RE = /خطا در پردازش درخواست|was not expected\s*\(50[0-9]\)|Status:\s*50[0-9]\b|HTTP status code[\s\S]{0,80}50[0-9]/i
const isServerPopupError = (e) => /SERVER_POPUP/i.test(String((e && e.message) || e)) || SERVER_POPUP_RE.test(String((e && e.message) || e))

/** خطای محدودیت/مسدودی موقت حساب در صدور بارنامه شهری */
const ACCOUNT_RESTRICTED_RE = /صدور غیر مجاز بارنامه شهری|محدودیت در صدور بارنامه شهری|لیست سیاه سامانه|لیست سیاه|resultCode[\"']?\s*[:=]\s*9990|کد.*9990/i

/** خطای «محدودیت زمانی در ثبت بارنامه شهری» — سایت می‌گوید الان نمی‌شود، دقایقی بعد دوباره تلاش کنید.
    این خطا نه دائمی است نه مشکل حساب؛ فقط باید برای همین اکانت/پلاک ~۳۰ دقیقه صبر کرد. */
const RATE_LIMIT_RE = /محدودیت زمانی در ثبت بارنامه|محدودیت زمانی.*بارنامه شهری|امکان ثبت بارنامه را ندارید/i

/** خطای دائمی — تکرار بی‌فایده است */
const PERMANENT_RE = /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید|رمز|کلمه عبور|کاربری یافت نشد|نام کاربری|قفل|مسدود|غیرفعال|صدور غیر مجاز بارنامه شهری|محدودیت در صدور بارنامه شهری|لیست سیاه سامانه|لیست سیاه/

const isNetBlockError  = (e) => NET_BLOCK_RE.test(String((e && e.message) || e))
const isPageDeadError  = (e) => PAGE_DEAD_RE.test(String((e && e.message) || e))
const isAccountRestrictedError = (e) => ACCOUNT_RESTRICTED_RE.test(String((e && e.message) || e))
const isRateLimitError = (e) => RATE_LIMIT_RE.test(String((e && e.message) || e))
const isServerTempError = (e) => SERVER_TEMP_RE.test(String((e && e.message) || e))
const isPermanentError = (e) => PERMANENT_RE.test(String((e && e.message) || e))

function cleanSiteErrorMessage(raw) {
  let t = String(raw || '').trim()
  // خطای سایت گاهی JSON را داخل متن انگلیسی Response می‌گذارد.
  const jsonMatch = t.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0])
      if (obj && obj.resultMessage) t = String(obj.resultMessage)
    } catch (e) {}
  }
  t = t
    .replace(/One or more errors occurred\.\s*/i, '')
    .replace(/The HTTP status code[\s\S]*?Response:\s*/i, '')
    .replace(/Status:\s*\d+/i, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return t || String(raw || '').split('\n')[0].slice(0, 500)
}

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
   انتخاب/اعمال موقعیت نقشه برای گام ۵ و ۶
   - برای capture: کاربر روی نقشه واقعی سایت کلیک می‌کند و آخرین کلیک ملاک است.
   - برای اجرای عادی: اگر پروفایل مختصات ذخیره‌شده داشته باشد، همان نقطه روی نقشه اعمال می‌شود.
   ═══════════════════════════════════════════════════════════════════ */

const MAP_JSON_START = '[map-location-json]'
const MAP_JSON_END = '[/map-location-json]'
const MANUAL_LOCATION_TAG = /\[manual-location\]/

function parseProfileMapLocations(notes) {
  const txt = String(notes || '')
  const i = txt.indexOf(MAP_JSON_START)
  const j = txt.indexOf(MAP_JSON_END)
  if (i < 0 || j <= i) return null
  const raw = txt.slice(i + MAP_JSON_START.length, j).trim()
  try {
    const obj = JSON.parse(raw)
    const valid = (x) => x && Number.isFinite(+x.lat) && Number.isFinite(+x.lon)
    return {
      origin: valid(obj.origin) ? { ...obj.origin, lat: +obj.origin.lat, lon: +obj.origin.lon } : null,
      destination: valid(obj.destination) ? { ...obj.destination, lat: +obj.destination.lat, lon: +obj.destination.lon } : null,
      updatedAt: obj.updatedAt || null,
    }
  } catch (e) {
    return null
  }
}

function mapCfgFor(kind) {
  if (kind === 'dest') {
    return {
      kind: 'dest', label: 'مقصد', paneId: 'pills-6', nextBtn: '#btnGoLVL7', nextPaneId: 'pills-7',
      mapSelectors: ['#mapp-MapDestination', '#MapDestination', '#mapp-MapDest', '#MapDest', '#mapp-MapMaghsad', '#MapMaghsad', '#destMap', '#DestMap'],
      addressIds: ['txtAddressDestFromMap', 'txtAddressDest', 'txtAddressDestView', 'AddressDest', 'destAddress'],
    }
  }
  return {
    kind: 'origin', label: 'مبدا', paneId: 'pills-5', nextBtn: '#btnGoLVL6', nextPaneId: 'pills-6',
    mapSelectors: ['#mapp-MapSource', '#MapSource', '#mapSource', '#sourceMap', '#SourceMap'],
    addressIds: ['txtAddressSourceFromMap', 'txtAddressSource', 'txtAddressSourceView', 'AddressSource', 'sourceAddress'],
  }
}

async function waitForPaneActiveLocal(page, paneId, timeoutMs = 30000) {
  const t0 = Date.now()
  while (!timeoutMs || Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate((id) => {
      const el = document.getElementById(id)
      return !!(el && el.classList.contains('active'))
    }, paneId).catch(() => false)
    if (ok) return true
    await page.waitForTimeout(500).catch(() => {})
  }
  return false
}

async function installMapManualClickWatcher(page, cfg) {
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
  }, cfg).catch(() => {})
}

async function captureLocationFromMapStep(page, kind, opts = {}) {
  const cfg = mapCfgFor(kind)
  const settleMs = Math.max(1000, Number(opts.settleMs || 6000))
  const timeoutMs = Math.max(30000, Number(opts.timeoutMs || 10 * 60 * 1000))

  await waitForPaneActiveLocal(page, cfg.paneId, 20000).catch(() => false)
  await installMapManualClickWatcher(page, cfg)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`🖱 انتخاب ${cfg.label} از نقشه واقعی سامانه`)
  console.log(`   روی نقشه کلیک کنید. اگر اشتباه شد دوباره کلیک کنید؛ آخرین نقطه ملاک است.`)
  console.log(`   ${Math.round(settleMs / 1000)} ثانیه بعد از آخرین کلیک، ${cfg.label} نهایی می‌شود.`)
  console.log('═══════════════════════════════════════════════════════════════')

  let last = null
  let changed = 0

  return new Promise((resolve, reject) => {
    let settleTimer = null
    let healthTimer = null
    let lastNetworkCheck = 0
    let checkingNetwork = false
    let finished = false
    const context = page.context ? page.context() : null
    const browser = context && context.browser ? context.browser() : null

    const cleanup = () => {
      clearTimeout(timeoutTimer)
      if (settleTimer) clearTimeout(settleTimer)
      if (healthTimer) clearInterval(healthTimer)
      page.off('response', onResponse)
      page.off('close', onClosed)
      page.off('crash', onCrashed)
      if (context) context.off('close', onContextClosed)
      if (browser) browser.off('disconnected', onBrowserDisconnected)
    }

    const fail = (err) => {
      if (finished) return
      finished = true
      cleanup()
      reject(err)
    }

    const succeed = (loc) => {
      if (finished) return
      finished = true
      cleanup()
      resolve(loc)
    }

    const onClosed = () => fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} بسته شد`))
    const onCrashed = () => fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} کرش کرد`))
    const onContextClosed = () => fail(new Error(`نشست مرورگر هنگام انتخاب ${cfg.label} بسته شد`))
    const onBrowserDisconnected = () => fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} قطع/بسته شد`))

    const timeoutTimer = setTimeout(() => {
      fail(new Error(`مهلت انتخاب ${cfg.label} از نقشه تمام شد`))
    }, timeoutMs)

    // کمربند ایمنی: بعضی وقت‌ها در ویندوز، بستن دستی پنجره فقط با تأخیر به event تبدیل می‌شود.
    // هر ۱ ثانیه وضعیت صفحه/مرورگر را چک می‌کنیم تا خطا سریع به پنل برگردد.
    healthTimer = setInterval(() => {
      try {
        if (page.isClosed && page.isClosed()) fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} بسته شد`))
        else if (browser && !browser.isConnected()) fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} قطع/بسته شد`))

        if (!finished && Date.now() - lastNetworkCheck > 5000 && !checkingNetwork) {
          lastNetworkCheck = Date.now()
          checkingNetwork = true
          page.request.get(LOGIN_URL, { timeout: 5000 })
            .then((res) => {
              checkingNetwork = false
              if (!finished && (!res || res.status() >= 500)) {
                fail(new Error(`INTERNET_DISCONNECTED: اتصال اینترنت یا سامانه هنگام انتخاب ${cfg.label} قطع شد`))
              }
            })
            .catch(() => {
              checkingNetwork = false
              if (!finished) fail(new Error(`INTERNET_DISCONNECTED: اتصال اینترنت هنگام انتخاب ${cfg.label} قطع شد`))
            })
        }
      } catch (e) {
        fail(new Error(`مرورگر هنگام انتخاب ${cfg.label} بسته شد`))
      }
    }, 1000)

    const scheduleDone = () => {
      if (settleTimer) clearTimeout(settleTimer)
      const seq = changed
      console.log(`   ⏳ ${Math.round(settleMs / 1000)} ثانیه برای تثبیت آخرین ${cfg.label} صبر می‌کنم...`)
      settleTimer = setTimeout(() => {
        if (seq !== changed) return scheduleDone()
        console.log(`   ✅ آخرین ${cfg.label} نهایی شد: [Lat: ${last.lat}, Lon: ${last.lon}]`)
        if (last.address) console.log(`      آدرس: ${last.address}`)
        succeed(last)
      }, settleMs)
    }

    const onResponse = async (response) => {
      try {
        if (!response.url().includes('RevereseMap')) return

        const hadRecentManualClick = await page.evaluate((expectedKind) => {
          const x = window.__barbargLastManualMapClick
          return !!(x && x.kind === expectedKind && Date.now() - x.at < 45000)
        }, cfg.kind).catch(() => false)

        if (!hadRecentManualClick) {
          console.log(`   ⏭ پاسخ RevereseMap برای ${cfg.label} نادیده گرفته شد؛ کلیک دستی روی نقشه ثبت نشده بود.`)
          return
        }

        const u = new URL(response.url())
        const lat = parseFloat(u.searchParams.get('lat'))
        const lon = parseFloat(u.searchParams.get('lon'))
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
        if (Math.abs(lat - 35.7219) < 0.001 && Math.abs(lon - 51.3347) < 0.001) return

        const data = await response.json().catch(() => null)
        const obj = data && data.obj ? data.obj : {}
        last = {
          lat, lon,
          address: obj.postal_address || obj.address || '',
          province: obj.province || '',
          county: obj.county || obj.city || '',
          region: obj.region || '',
          neighbourhood: obj.neighbourhood || '',
          savedAt: new Date().toISOString(),
        }
        changed++
        console.log(`\n   📍 ${cfg.label} انتخاب شد/تغییر کرد:`)
        console.log(`      Lat: ${last.lat}`)
        console.log(`      Lon: ${last.lon}`)
        if (last.address) console.log(`      آدرس: ${last.address}`)
        scheduleDone()
      } catch (e) {}
    }

    page.on('response', onResponse)
    page.on('close', onClosed)
    page.on('crash', onCrashed)
    if (context) context.on('close', onContextClosed)
    if (browser) browser.on('disconnected', onBrowserDisconnected)
  })
}

async function applySavedMapLocationStep(page, kind, loc, OUT, tag, verbose = true) {
  const cfg = mapCfgFor(kind)
  const log = (m) => { if (verbose) console.log(m) }
  if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) {
    log(`   ✖ مختصات ذخیره‌شده ${cfg.label} معتبر نیست`)
    return false
  }
  const lat = +loc.lat
  const lon = +loc.lon
  const address = loc.address || `${lat}, ${lon}`

  log(`   📍 اعمال ${cfg.label} ذخیره‌شده روی نقشه: [${lat}, ${lon}]`)
  if (address) log(`      آدرس: ${address}`)

  const r = await page.evaluate(async ({ cfg, lat, lon, address }) => {
    const visible = (el) => {
      if (!el) return false
      const st = window.getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return st.display !== 'none' && st.visibility !== 'hidden' && b.width > 20 && b.height > 20
    }
    const isMap = (v) => v && typeof v === 'object' && typeof v.setView === 'function' && typeof v.panTo === 'function'
    const pane = document.getElementById(cfg.paneId)

    function containers() {
      const arr = []
      for (const sel of cfg.mapSelectors || []) { const el = document.querySelector(sel); if (el) arr.push(el) }
      document.querySelectorAll('.leaflet-container, .mapp-map, [id*="Map"], [id*="map"]').forEach((el) => arr.push(el))
      return Array.from(new Set(arr)).sort((a, b) => {
        const sc = (el) => (pane && pane.contains(el) ? 200 : 0) + (visible(el) ? 100 : 0) + ((cfg.mapSelectors || []).includes('#' + el.id) ? 80 : 0)
        return sc(b) - sc(a)
      })
    }
    const found = []
    const add = (v) => { if (isMap(v) && !found.includes(v)) found.push(v) }
    const cs = containers()
    for (const el of cs) {
      for (const key of Object.getOwnPropertyNames(el)) { try { add(el[key]) } catch (e) {} }
      if (window.jQuery) { try { const d = window.jQuery(el).data(); for (const k in d) add(d[k]) } catch (e) {} }
    }
    if (window.mapp) {
      if (typeof window.mapp.getMap === 'function') for (const el of cs) { if (el.id) { try { add(window.mapp.getMap(el.id)) } catch (e) {} } }
      if (window.mapp.maps) for (const k in window.mapp.maps) add(window.mapp.maps[k])
    }
    for (const k of Object.getOwnPropertyNames(window)) {
      try {
        const v = window[k]
        add(v)
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const sub of Object.keys(v).slice(0, 120)) add(v[sub])
      } catch (e) {}
    }
    found.sort((a, b) => {
      const sc = (m) => {
        const c = m._container || (m.getContainer && m.getContainer())
        return (c && pane && pane.contains(c) ? 200 : 0) + (c && visible(c) ? 100 : 0)
      }
      return sc(b) - sc(a)
    })
    const map = found[0]
    let marker = false
    let moved = false
    if (map) {
      try {
        if (map.invalidateSize) map.invalidateSize(true)
        if (map.flyTo) map.flyTo([lat, lon], 17, { animate: true, duration: 1 })
        map.setView([lat, lon], 17)
        map.panTo([lat, lon])
        moved = true
      } catch (e) { try { map.setView([lat, lon], 17); moved = true } catch (e2) {} }
      try {
        if (map.eachLayer) map.eachLayer((layer) => {
          if (layer && typeof layer.setLatLng === 'function' && (layer._icon || layer.options?.icon || layer.dragging)) {
            layer.setLatLng([lat, lon]); marker = true
          }
        })
      } catch (e) {}
      if (!marker && window.L && typeof window.L.marker === 'function') {
        try { window.L.marker([lat, lon]).addTo(map); marker = true } catch (e) {}
      }
      try {
        const ll = window.L && window.L.latLng ? window.L.latLng(lat, lon) : { lat, lng: lon }
        const cp = map.latLngToContainerPoint ? map.latLngToContainerPoint(ll) : { x: 200, y: 200 }
        if (map.fire) map.fire('click', { latlng: ll, containerPoint: cp, layerPoint: cp, originalEvent: new MouseEvent('click', { bubbles: true }) })
      } catch (e) {}
    }
    for (const id of cfg.addressIds || []) {
      const el = document.getElementById(id)
      if (el) {
        el.value = address
        el.setAttribute('value', address)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        if (window.jQuery) { try { window.jQuery(el).val(address).trigger('input').trigger('change') } catch (e) {} }
      }
    }
    try { await fetch(`/Barname/Document/RevereseMap?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { credentials: 'include', cache: 'no-store' }) } catch (e) {}
    return { mapFound: !!map, moved, marker }
  }, { cfg, lat, lon, address }).catch(() => ({ mapFound: false, moved: false, marker: false }))

  log(`      ${r.mapFound ? '✔' : '✖'} نقشه پیدا شد | ${r.moved ? '✔' : '✖'} دوربین | ${r.marker ? '✔' : '✖'} مارکر`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, `${tag}-map-saved.png`), fullPage: true }).catch(() => {})

  const btn = await page.$(cfg.nextBtn)
  if (!btn) { log(`   ✖ ${cfg.nextBtn} نیست`); return false }
  await btn.click().catch(() => {})
  await page.waitForTimeout(2200)
  const active = await waitForPaneActiveLocal(page, cfg.nextPaneId, 25000)
  if (!active) {
    const sw = await readSwalError(page)
    if (sw) log(`   ✖ خطای سایت: ${sw}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-map-saved-error.png`), fullPage: true }).catch(() => {})
  }
  return active
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
    /* بین گام‌ها هم بلاک شدن IP را چک کن — اگر پایش مداوم بلاک دیده،
       ادامه دادن گام‌های بعدی بی‌فایده است */
    assertNotBlocked()
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

  let browserClosedByUser = false
  const markBrowserClosed = () => { browserClosedByUser = true }
  browser.on('disconnected', markBrowserClosed)
  ctx.on('close', markBrowserClosed)
  page.on('close', markBrowserClosed)

  const assertBrowserOpen = (where = '') => {
    if (browserClosedByUser || page.isClosed() || !browser.isConnected()) {
      throw new Error(`مرورگر توسط کاربر بسته شد${where ? ` (${where})` : ''}`)
    }
  }

  /* ── پایش «مداوم» بلاک IP در تمام طول عملیات ──
     قبلا بلاک فقط هنگام باز کردن صفحه (goto) تشخیص داده می‌شد؛ اگر IP
     وسط کار (حل کپچا، ورود، پر کردن گام‌ها) بلاک می‌شد، صفحه‌ی قبلی هنوز
     در مرورگر لود بود و موتور بی‌خبر می‌ماند. حالا هر ۲۰ ثانیه یک درخواست
     سبک به سایت زده می‌شود؛ ۲ شکست پشت سر هم ⇒ بلاک وسط عملیات. */
  let ipBlocked = false
  let ipProbeFails = 0
  let ipProbeBusy = false
  const ipWatchdog = setInterval(async () => {
    if (ipProbeBusy || ipBlocked) return
    /* مرورگر ممکن است وسط کار (سرور مشغول/تایم‌اوت) بسته و دوباره باز شود؛
       چون page و browser متغیر let هستند، همیشه نمونه‌ی فعلی چک می‌شود.
       اگر الان صفحه‌ای باز نیست، فقط این دور را رد کن — پایش ادامه دارد. */
    try {
      if (page.isClosed() || !browser.isConnected()) return
    } catch { return }
    ipProbeBusy = true
    try {
      const bad = await probeIpBlock(page)
      if (bad) {
        ipProbeFails++
        console.log(`   ⚠ پایش بلاک IP: اتصال به سایت جواب نداد (${ipProbeFails}/2)`)
        if (ipProbeFails >= 2) {
          ipBlocked = true
          console.log('   ⚠ پایش مداوم: اتصال به سایت قطع شد — احتمال بلاک IP وسط عملیات')
        }
      } else if (ipProbeFails > 0) {
        ipProbeFails = 0
      }
    } catch { /* پایش نباید خود عملیات را خراب کند */ }
    finally { ipProbeBusy = false }
  }, 20000)
  // تایمر پایش نباید مانع خروج پروسه شود (مثلا در اجرای CLI)
  if (typeof ipWatchdog.unref === 'function') ipWatchdog.unref()

  /* ── پایش «مداوم» پاپ‌آپ‌های خطای سرور ──
     پاپ‌آپ‌هایی مثل «خطا در پردازش درخواست» یا
     «The HTTP status code of the response was not expected (503)»
     از نوع toast هستند و فقط ~۵ ثانیه روی صفحه می‌مانند؛ اگر فقط در
     لحظه‌های خاص چک کنیم از دست می‌روند. این پایشگر هر ۲ ثانیه
     پاپ‌آپ خطای قابل‌مشاهده را می‌خواند؛ به محض دیدن یکی از این دو خطا،
     عملیات باید مرورگر را ببندد، ۱ تا ۲ دقیقه صبر کند و از اول شروع کند. */
  let serverPopupMsg = ''
  let popupProbeBusy = false
  const popupWatchdog = setInterval(async () => {
    if (popupProbeBusy || serverPopupMsg || ipBlocked) return
    try {
      if (page.isClosed() || !browser.isConnected()) return
    } catch { return }
    popupProbeBusy = true
    try {
      const txt = await page.evaluate(() => {
        const pop = document.querySelector('.swal2-popup.swal2-icon-error, .swal2-popup.swal2-toast.swal2-icon-error')
        if (!pop) return ''
        const st = window.getComputedStyle(pop)
        if (st.display === 'none' || st.visibility === 'hidden') return ''
        const b = (document.getElementById('swal2-html-container')?.textContent || '').trim()
        const h = (document.getElementById('swal2-title')?.textContent || '').trim()
        return `${h} ${b}`.replace(/\s+/g, ' ').trim().slice(0, 300)
      }).catch(() => '')
      if (txt && SERVER_POPUP_RE.test(txt)) {
        serverPopupMsg = txt
        console.log(`   ⚠ پایش مداوم: پاپ‌آپ خطای سرور دیده شد: «${txt.slice(0, 120)}»`)
        console.log('      مرورگر بسته می‌شود، ۱ تا ۲ دقیقه صبر و شروع از اول')
      }
    } catch { /* پایش نباید خود عملیات را خراب کند */ }
    finally { popupProbeBusy = false }
  }, 2000)
  if (typeof popupWatchdog.unref === 'function') popupWatchdog.unref()

  const stopIpWatchdog = () => { clearInterval(ipWatchdog); clearInterval(popupWatchdog) }
  /** اگر پایش مداوم بلاک یا پاپ‌آپ خطای سرور را دیده، خطا پرتاب کن تا
      مسیر استاندارد (بستن مرورگر + صبر + شروع از صفر) طی شود */
  const assertNotBlocked = () => {
    if (ipBlocked) {
      throw new Error('ERR_CONNECTION_CLOSED: پایش مداوم تشخیص داد اتصال به سایت قطع شده (احتمال بلاک IP وسط عملیات)')
    }
    if (serverPopupMsg) {
      throw new Error(`SERVER_POPUP: ${serverPopupMsg}`)
    }
  }

  const fail = async (error, kind = 'error') => {
    stopIpWatchdog()
    if (closeBrowser) await browser.close().catch(() => {})
    return { success: false, error, kind, steps: [], trackingCode: null }
  }

  try { await assertGeneralInternet('شروع اتوماسیون') }
  catch (e) { return fail(String((e && e.message) || e), 'block') }

  console.log(`حساب: ${credentials.username}`)
  console.log('\n→ ورود به سامانه...')

  {
    const nav = await gotoR(page, LOGIN_URL, 'صفحه ورود')
    if (nav === 'BLOCKED') {
      // مرورگر را ببند و به لایه‌ی بیرونی بگو صبر کند
      return fail('IP بلاک شد هنگام باز کردن صفحه‌ی ورود', 'block')
    }
    if (nav === 'TIMEOUT') {
      console.log('   ⚠ تایم‌اوت — بستن مرورگر و صبر ۲ تا ۵ دقیقه')
      await browser.close().catch(() => {})
      await sleepWithLog(rand(2 * 60 * 1000, 5 * 60 * 1000))
      browser = await chromium.launch(LAUNCH)
      ctx = await browser.newContext(CTX)
      page = await ctx.newPage()
      const nav1b = await gotoR(page, LOGIN_URL, 'صفحه ورود')
      if (nav1b === 'BLOCKED') return fail('IP بلاک شد', 'block')
      if (!nav1b)
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
    const navBusy = await gotoR(page, LOGIN_URL, 'صفحه ورود')
    if (navBusy === 'BLOCKED' || !navBusy) return fail('اتصال نشد (بلاک یا قطعی شبکه)', 'block')
    await page.waitForTimeout(2500)
    await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})
  }

  await (await page.$('#NationalCode'))?.fill(credentials.username)
  await (await page.$('#user-password'))?.fill(credentials.password)

  let logged = false
  let loginErr = 'ورود ناموفق'
  let captchaAttempts = 0
  let loginFatalKind = null   // 'bad_credentials' یا 'account_locked'
  let failedWithGoodCaptcha = 0
  for (let att = 1; att <= 6; att++) {
    // اگر پایش مداوم دیده که IP وسط تلاش‌های ورود بلاک شده، ادامه نده
    if (ipBlocked) return fail('پایش مداوم: اتصال به سایت وسط ورود قطع شد — احتمال بلاک IP', 'block')
    // پاپ‌آپ خطای سرور (خطا در پردازش درخواست / 503) ⇒ مرورگر بسته شود و ۱-۲ دقیقه صبر
    if (serverPopupMsg) return fail(`پاپ‌آپ خطای سرور هنگام ورود: ${serverPopupMsg}`, 'server_popup')
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
    if (res.fatal) {
      loginErr = res.error
      if (res.credentialKind) {
        loginFatalKind = res.credentialKind
        console.log(`   🛑 ${res.error}`)
        if (res.rawError) console.log(`      پیام سایت: «${res.rawError}»`)
        console.log(`      حساب: ${credentials.username}`)
      } else {
        console.log(`   🛑 خطای قطعی: ${res.error}`)
      }
      break
    }
    loginErr = res.error || loginErr
    console.log(`   ✖ ورود نشد (${res.waited}s)${res.error ? ' — ' + res.error.slice(0, 90) : ''}`)

    /* پاپ‌آپ ممکن است قبل از خواندن محو شده باشد. اگر سه بار پشت سر هم
       با کپچای درست وارد نشدیم و هنوز روی صفحه‌ی ورودیم، تقریبا قطعی است
       که مشخصات حساب اشتباه است — وگرنه ساعت‌ها بی‌فایده تلاش می‌کنیم
       و ممکن است حساب در سامانه قفل شود. */
    if (!res.transient) failedWithGoodCaptcha++
    if (failedWithGoodCaptcha >= 3) {
      const stillLogin = await page.evaluate(() =>
        !!document.querySelector('#NationalCode, #user-password, #inter')).catch(() => false)
      if (stillLogin) {
        loginFatalKind = 'bad_credentials'
        loginErr = 'نام کاربری (کد ملی) یا رمز عبور حساب باربگ اشتباه است — ' +
                   'از صفحه «حساب‌های باربگ» اصلاحش کنید'
        console.log(`   🛑 ${loginErr}`)
        console.log(`      پس از ${failedWithGoodCaptcha} تلاش با کپچای درست، هنوز روی صفحه‌ی ورودیم`)
        console.log(`      حساب: ${credentials.username}`)
        break
      }
    }

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
  if (!logged) return fail(loginErr, loginFatalKind || 'error')

  console.log('\n→ باز کردن فرم بارنامه...')
  {
    const nav2 = await gotoR(page, TARGET_URL, 'فرم بارنامه')
    if (nav2 === 'BLOCKED') return fail('IP بلاک شد هنگام باز کردن فرم بارنامه', 'block')
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
  let capturedMapLocations = null
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
    ok3 = await step(3, await fillDriverVehicleStepWithRetries(page, d.driver, OUT, 'step3'), 'راننده و خودرو')
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

  if (ok4 && opts.captureMapLocations) {
    console.log('\n═══ انتخاب نقشه برای ذخیره در پروفایل ═══')
    lastStep = 'انتخاب مبدا از نقشه'
    const origin = await captureLocationFromMapStep(page, 'origin', {
      settleMs: opts.mapSettleMs || 6000,
      timeoutMs: opts.mapSelectionTimeoutMs || 10 * 60 * 1000,
    })
    ok5 = await step(5, !!origin, 'انتخاب مبدا از نقشه')

    if (ok5) {
      console.log('\n➜ رفتن خودکار از گام ۵ به گام ۶ ...')
      const nb = await page.$('#btnGoLVL6')
      if (!nb) throw new Error('دکمه رفتن به گام ۶ (#btnGoLVL6) پیدا نشد')
      await nb.click().catch(() => {})
      const active6 = await waitForPaneActiveLocal(page, 'pills-6', 30000)
      if (!active6) throw new Error('بعد از انتخاب مبدا، گام ۶ باز نشد')
      console.log('   ✅ گام ۶ باز شد')

      lastStep = 'انتخاب مقصد از نقشه'
      const destination = await captureLocationFromMapStep(page, 'dest', {
        settleMs: opts.mapSettleMs || 6000,
        timeoutMs: opts.mapSelectionTimeoutMs || 10 * 60 * 1000,
      })
      ok6 = await step(6, !!destination, 'انتخاب مقصد از نقشه')
      capturedMapLocations = { origin, destination }
      if (ok6) {
        console.log('\n✅ مبدا و مقصد از نقشه واقعی سامانه دریافت شدند؛ مرورگر بسته می‌شود.')
      }
    }
  } else if (ok4) {
    console.log('\n═══ ' + STEP_ORIGIN.label + ' ═══')
    lastStep = 'مبدا'
    if (d.origin && d.origin.mapLocation) {
      ok5 = await step(5, await applySavedMapLocationStep(page, 'origin', d.origin.mapLocation, OUT, 'step5', true), 'مبدا')
    } else {
      ok5 = await step(5, await fillLocationStep(page, STEP_ORIGIN, d.origin, OUT, 'step5', true, d.driver.plate), 'مبدا')
    }
  }
  if (!opts.captureMapLocations && ok5) {
    console.log('\n═══ ' + STEP_DEST.label + ' ═══')
    lastStep = 'مقصد'
    if (d.destination && d.destination.mapLocation) {
      ok6 = await step(6, await applySavedMapLocationStep(page, 'dest', d.destination.mapLocation, OUT, 'step6', true), 'مقصد')
    } else {
      ok6 = await step(6, await fillLocationStep(page, STEP_DEST, d.destination, OUT, 'step6', true, d.driver.plate), 'مقصد')
    }
  }
  if (!opts.captureMapLocations && ok6) {
    console.log('\n═══ گام ۷: مشخصات مبدا و مقصد ═══')
    lastStep = 'بازبینی'
    ok7 = await step(7, await passReviewStep(page), 'بازبینی')
  }
  if (!opts.captureMapLocations && ok7) {
    console.log('\n═══ گام ۸: کرایه و صدور سند ═══')
    lastStep = 'کرایه'
    ok8 = await step(8, await fillFareStep(page, d.fare, OUT, 'step8'), 'کرایه')
  }
  if (!opts.captureMapLocations && ok8) {
    console.log('\n═══ گام ۹: تایید مشخصات و ثبت نهایی ═══')
    lastStep = 'ثبت نهایی'
    const res = await finalConfirmStep(page, OUT, 'step9', { dryRun: !submit, getOtpCode: opts.getOtpCode })
    ok9 = !!res && (typeof res === 'object' ? res.success !== false : true)
    if (res && typeof res === 'object' && res.success === false) {
      midFail = { kind: res.kind || 'error', error: res.error || 'ثبت نهایی ناموفق بود' }
    } else if (typeof res === 'string') {
      trackingCode = res
      console.log(`\n🎉🎉 کد رهگیری: ${res}`)
    } else if (res && typeof res === 'object' && res.trackingCode) {
      trackingCode = res.trackingCode
      console.log(`\n🎉🎉 کد رهگیری: ${trackingCode}`)
    } else if (res && typeof res === 'object' && res.finalReceipt) {
      console.log('\n🎉🎉 ثبت نهایی با نمایش رسید سایت تایید شد')
    }
    await step(9, ok9, 'ثبت نهایی')
  }

  } catch (e) {
    /* قطع شدن وسط پر کردن فرم — قبلا فقط «گام فلان ناموفق»
       گزارش می‌شد و دلیل واقعی گم می‌شد. */
    const msg = String((e && e.message) || e).split('\n')[0].slice(0, 160)
    if (isPageDeadError(e))      midFail = { kind: 'dead',  error: `مرورگر در گام «${lastStep}» بسته شد` }
    else if (/SERVER_POPUP/i.test(msg)) midFail = { kind: 'server_popup', error: cleanSiteErrorMessage(msg.replace(/^SERVER_POPUP:\s*/i, '')) + ` (گام «${lastStep}»)` }
    else if (/DRIVER_PLATE_NOT_FOUND/i.test(msg)) midFail = { kind: 'driver_plate_not_found', error: msg.replace(/^DRIVER_PLATE_NOT_FOUND:\s*/i, '') }
    else if (/SERVER_TEMP_STEP3/i.test(msg) || isServerTempError(e)) midFail = { kind: 'busy', error: cleanSiteErrorMessage(msg.replace(/^SERVER_TEMP_STEP3:\s*/i, '')) }
    else if (isNetBlockError(e)) midFail = { kind: 'block', error: `اتصال در گام «${lastStep}» قطع شد (احتمال بلاک IP): ${msg}` }
    else if (isRateLimitError(e)) midFail = { kind: 'rate_limited', error: cleanSiteErrorMessage(msg) }
    else if (isAccountRestrictedError(e)) midFail = { kind: 'account_restricted', error: cleanSiteErrorMessage(msg) }
    else                         midFail = { kind: 'error', error: `خطا در گام «${lastStep}»: ${msg}` }
    console.log(`   ✖ ${midFail.error}`)
  }

  /* اگر گامی بدون پرتاب خطا شکست خورد، ببین علتش سلامت صفحه بوده یا داده */
  if (!midFail && !(opts.captureMapLocations ? ok6 : ok9) && ipBlocked) {
    midFail = { kind: 'block', error: `پایش مداوم: اتصال به سایت وسط عملیات قطع شد — احتمال بلاک IP (گام «${lastStep}»)` }
    console.log(`   ✖ ${midFail.error}`)
  }
  if (!midFail && !(opts.captureMapLocations ? ok6 : ok9) && serverPopupMsg) {
    midFail = { kind: 'server_popup', error: `پاپ‌آپ خطای سرور: ${serverPopupMsg} (گام «${lastStep}»)` }
    console.log(`   ✖ ${midFail.error}`)
  }
  if (!midFail && !(opts.captureMapLocations ? ok6 : ok9)) {
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

  const steps = opts.captureMapLocations
    ? [ok1, ok2, ok3, ok4, ok5, ok6]
    : [ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9]
  console.log('\n' + '─'.repeat(46))
  if (opts.captureMapLocations) {
    console.log('  خلاصه انتخاب نقشه: ' + steps.map((m, i) => `${i + 1}${m ? '✔' : '✖'}`).join('  '))
    console.log('  توجه: گام‌های ۷ تا ۹ عمداً اجرا نمی‌شوند؛ این عملیات فقط برای ذخیره مبدا و مقصد است.')
  } else {
    console.log('  خلاصه: ' + steps.map((m, i) => `${i + 1}${m ? '✔' : '✖'}`).join('  '))
  }
  console.log('─'.repeat(46))

  stopIpWatchdog()

  const swalNow = await readSwalError(page)

  if (keepOpenMs > 0) {
    console.log(`\nمرورگر ${Math.round(keepOpenMs / 1000)} ثانیه باز می‌ماند...`)
    await page.waitForTimeout(keepOpenMs).catch(() => {})
  }

  const success = opts.captureMapLocations ? !!(ok5 && ok6 && capturedMapLocations) : !!ok9
  /* اگر پیام روی صفحه «محدودیت زمانی ثبت بارنامه شهری» بود، نوع را درست علامت بزن
     تا ورکر به‌جای تلاش فوری، ۳۰ دقیقه صبر کند */
  const failMsg = midFail ? midFail.error : (swalNow || `گام «${lastStep}» ناموفق بود`)
  let failKind = midFail ? midFail.kind : 'error'
  if (!success && RATE_LIMIT_RE.test(String(failMsg || ''))) failKind = 'rate_limited'
  else if (!success && failKind === 'error' && SERVER_POPUP_RE.test(String(failMsg || ''))) failKind = 'server_popup'
  const result = {
    success,
    trackingCode,
    mapLocations: capturedMapLocations,
    steps,
    lastStep,
    kind: success ? 'ok' : failKind,
    error: success ? null : failMsg,
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
  const RETRY_LONG  = ['block', 'busy', 'waf', 'timeout', 'server_popup']
  const RETRY_SHORT = ['dead', 'login', 'driver_plate_not_found', 'otp_failed']

  /* سقف تلاش برای هر نوع — عینا مطابق test-step1.js
       بلاک IP   : gotoR(max = 20)              → ۲۰ بار، هر بار ۳–۵ دقیقه
       سرور مشغول: for (busyTry <= 5)          → ۵ بار، هر بار ۲–۵ دقیقه
       تایم‌اوت  : tmo >= 2 → یک راه‌اندازی مجدد با صبر ۲–۵ دقیقه */
  const LIMITS = {
    block:   maxRestarts,   // پیش‌فرض ۲۰
    waf:     maxRestarts,
    busy:    Number.POSITIVE_INFINITY,
    timeout: 5,
    dead:    maxRestarts,
    login:   maxRestarts,
    driver_plate_not_found: 10,
    otp_failed: 2,
    // پاپ‌آپ «خطا در پردازش درخواست» / 503 — مثل busy تا وقتی سایت سالم شود
    server_popup: Number.POSITIVE_INFINITY,
  }

  let last = null

  for (let attempt = 1; attempt <= maxRestarts || (last && (last.kind === 'busy' || last.kind === 'server_popup')); attempt++) {
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

    /* مشخصات حساب اشتباه یا حساب مسدود ⇒ هرگز تکرار نکن.
       تا کاربر رمز را اصلاح نکند، هزار بار هم تلاش کنیم همان نتیجه است،
       و تلاش‌های پیاپی ممکن است باعث قفل شدن حساب در سامانه شود. */
    if (kind === 'bad_credentials' || kind === 'account_locked') {
      console.log(`   🛑 ${last.error}`)
      console.log('      تلاش مجدد انجام نمی‌شود — اول مشخصات حساب را درست کنید')
      return last
    }
    if (kind === 'account_restricted') {
      console.log(`   🛑 ${last.error}`)
      console.log('      حساب در صدور بارنامه شهری محدود شده — همه عملیات‌های این اکانت متوقف می‌شود')
      return last
    }

    /* محدودیت زمانی ثبت بارنامه شهری ⇒ داخل موتور تکرار نمی‌کنیم؛
       ورکر خودش وظیفه را ۳۰ دقیقه بعد دوباره در صف می‌گذارد. */
    if (kind === 'rate_limited') {
      console.log(`   ⏸ ${last.error}`)
      console.log('      محدودیت زمانی سایت — عملیات این اکانت/پلاک ۳۰ دقیقه بعد دوباره اجرا می‌شود')
      return last
    }

    // کد پیامکی فقط ۲ بار کل عملیات را از صفر تکرار می‌کند؛ بعد به ورکر برمی‌گردد تا اکانت متوقف شود.
    if (kind === 'otp_failed' && attempt >= (LIMITS.otp_failed || 2)) {
      console.log(`   🛑 ${last.error}`)
      console.log('      بعد از ۲ تلاش، کد یکبارمصرف ثبت نشد — عملیات‌های این اکانت متوقف می‌شود')
      return last
    }

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
      server_popup: 'پاپ‌آپ خطای سرور (خطا در پردازش درخواست / 503)',
    }[kind] || kind

    // سقف تلاش برای هر نوع — مطابق فایل اصلی
    const limit = LIMITS[kind] ?? maxRestarts
    if (attempt >= limit) {
      console.log(`   ✖ بعد از ${limit} تلاش همچنان ناموفق (${label}): ${last.error}`)
      return last
    }

    if (RETRY_SHORT.includes(kind)) {
      const waitShort = (kind === 'driver_plate_not_found' || kind === 'otp_failed') ? 0 : 15000
      console.log(`\n   ↻ ${label} (تلاش ${attempt}/${limit}) — شروع کامل از صفر${waitShort ? ' بعد از ۱۵ ثانیه' : ' بلافاصله'}`)
      if (waitShort) await sleepWithLog(waitShort)
      continue
    }

    /* مدت صبر — دقیقا همان اعداد test-step1.js:
         بلاک IP  : مرورگر بسته می‌شود، ۳ تا ۵ دقیقه صبر
         سرور مشغول: rand(2*60*1000, 5*60*1000)       →  ۲ تا ۵ دقیقه
         تایم‌اوت  : rand(2*60*1000, 5*60*1000)      →  ۲ تا ۵ دقیقه  */
    const waitMs =
        kind === 'block'   ? 180000 + Math.random() * 120000
      // خطاهای Service Unavailable / خطا در برقراری ارتباط با سرور: ۱ دقیقه وقفه، سپس شروع کامل از صفر
      : kind === 'busy'    ? 60 * 1000
      // پاپ‌آپ «خطا در پردازش درخواست» / 503: بستن مرورگر، ۱ تا ۲ دقیقه صبر، شروع از اول
      : kind === 'server_popup' ? rand(1 * 60 * 1000, 2 * 60 * 1000)
      : kind === 'timeout' ? rand(2 * 60 * 1000, 5 * 60 * 1000)
      :                      rand(2 * 60 * 1000, 5 * 60 * 1000)

    console.log(`\n   ⚠ ${label} (تلاش ${attempt}/${limit})`)
    console.log(`      ${last.error || ''}`)
    console.log(`   ↻ مرورگر بسته شد — صبر ${fmtT(Math.round(waitMs / 1000))}، بعد شروع کامل از صفر`)

    /* بلاک یا مشغولی ⇒ فعالانه بپاییم (هر ۱۵ ثانیه، بدون مرورگر).
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

/* ═══════════════════════════════════════════════════════════════════
   واردات خودکار مشخصات از آخرین بارنامه‌ی ثبت‌شده

   مسیر:
     ورود  →  /barname/History/History
           →  کلیک روی «جزئیات» (#btnDetailfirst)
           →  /Barname/History/RealBarnameDetail
           →  خواندن همه‌ی فیلدها

   هدف: کاربر نیازی به وارد کردن دستی اطلاعات نداشته باشد.
   ═══════════════════════════════════════════════════════════════════ */

/** یکسان‌سازی حروف عربی/فارسی برای مقایسه */
function fold_(t) {
  return String(t || '')
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/[\u064B-\u0652\u0640\u200c]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * نام کاربر واردشده را از نوار بالای سایت می‌خواند.
 *
 *   <span class="user-name mbzero">علي پرون</span>
 *   <small class="user-status mfo">خوش آمدید</small>
 *
 * این منبع از فیلد #driverName صفحه‌ی جزئیات مطمئن‌تر است، چون
 * در هر صفحه‌ای بعد از ورود در دسترس است — حتی اگر تاریخچه خالی باشد.
 */
async function readLoggedInUserName(page) {
  return page.evaluate(() => {
    const clean = (t) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()

    // ۱) دقیق‌ترین: span.user-name داخل منوی کاربر
    for (const el of document.querySelectorAll('span.user-name, small.user-name')) {
      const t = clean(el.textContent)
      // متن‌های تزئینی را رد کن
      if (!t || t.length < 3) continue
      if (/خوش آمدید|نام کاربر|خروج|ورود/.test(t)) continue
      return t
    }

    // ۲) نسخه‌ی جایگزین: هر عنصری کنار «خوش آمدید»
    for (const el of document.querySelectorAll('.user-status')) {
      if (!/خوش آمدید/.test(el.textContent || '')) continue
      const sib = el.parentElement?.querySelector('.user-name')
      const t = clean(sib?.textContent)
      if (t && t.length >= 3) return t
    }
    return ''
  }).catch(() => '')
}

/* ═══════════════════════════════════════════════════════════════════
   رفتار انسانی — جلوگیری از بلاک شدن IP

   سایت به سرعت حساس است. اگر صفحات را تند تند باز کنیم، فیلدها را
   آنی پر کنیم و بلافاصله کلیک کنیم، الگوی رباتی می‌سازد و IP بلاک
   می‌شود. این توابع مکث‌های تصادفی و شبه‌انسانی اضافه می‌کنند.
   ═══════════════════════════════════════════════════════════════════ */

/** مکث تصادفی بین min و max میلی‌ثانیه */
function humanPause(min, max) {
  return new Promise((r) => setTimeout(r, Math.floor(min + Math.random() * (max - min))))
}

/** مکث کوتاه — بین دو فیلد یا دو کلیک کوچک */
const shortPause = () => humanPause(600, 1400)
/** مکث متوسط — قبل از کلیک روی دکمه‌ی مهم */
const mediumPause = () => humanPause(1500, 3000)
/** مکث بلند — بعد از باز شدن صفحه، تا کاربر «نگاه کند» */
const longPause = () => humanPause(3000, 6000)

/**
 * صبر می‌کند تا صفحه واقعا کامل لود شود:
 *   ۱) شبکه آرام بگیرد (networkidle)
 *   ۲) لایه‌ی loading برداشته شود
 *   ۳) یک مکث انسانی
 */
async function settlePage(page, label = '') {
  // شبکه آرام شود — ولی بی‌نهایت منتظر نمان
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

  // لایه‌ی loading سایت
  for (let i = 0; i < 30; i++) {
    const busy = await page.evaluate(() => {
      const l = document.getElementById('loading')
      if (l && l.offsetParent !== null) return true
      return !!document.querySelector('.blockUI, .loading-overlay, .page-loader')
    }).catch(() => false)
    if (!busy) break
    await page.waitForTimeout(400)
  }
  await page.evaluate(() => {
    document.getElementById('loading')?.remove()
    document.querySelectorAll('.blockUI, .loading-overlay, .page-loader').forEach((e) => e.remove())
  }).catch(() => {})

  await longPause()
  if (label) console.log(`   ⏸ ${label} کامل لود شد`)
}

/**
 * تایپ انسانی داخل یک فیلد:
 *   کلیک → مکث → تایپ کاراکتر به کاراکتر با سرعت متغیر
 */
async function humanType(page, selector, text) {
  const el = await page.$(selector)
  if (!el || !text) return false

  await el.click().catch(() => {})
  await humanPause(250, 600)
  await el.fill('').catch(() => {})
  await humanPause(150, 400)

  // سرعت تایپ متغیر — انسان یکنواخت تایپ نمی‌کند
  for (const ch of String(text)) {
    await page.keyboard.type(ch, { delay: 0 }).catch(() => {})
    await humanPause(60, 190)
  }

  await humanPause(200, 500)
  await page.evaluate((s) => {
    const i = document.querySelector(s)
    if (!i) return
    i.dispatchEvent(new Event('input', { bubbles: true }))
    i.dispatchEvent(new Event('change', { bubbles: true }))
    i.dispatchEvent(new Event('blur', { bubbles: true }))
    if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur') } catch (e) {} }
  }, selector).catch(() => {})
  return true
}

/** کلیک انسانی: مکث قبل، کلیک، مکث بعد */
async function humanClick(page, selector) {
  const el = await page.$(selector)
  if (!el) return false
  await mediumPause()
  await el.click().catch(async () => {
    await page.evaluate((s) => document.querySelector(s)?.click(), selector).catch(() => {})
  })
  await shortPause()
  return true
}

const HISTORY_URL = `${SITE}/barname/History/History`

/** حروف پلاک: مقدار عددی select → حرف فارسی */
const PLATE_LETTER_BY_VALUE = Object.fromEntries(
  Object.entries(PLATE_LETTERS).map(([k, v]) => [v, k]),
)

/**
 * رشته‌ی مبدا/مقصد سایت را به استان و شهر و آدرس تجزیه می‌کند.
 * نمونه: «کرمان - سیرجان - خیابان ابن سینا، خیابان بدر جنوبی»
 */
function splitLocation(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return { province: '', city: '', address: '' }

  const parts = t.split(/\s*[-–—/|،,]\s*/).filter(Boolean)
  if (parts.length >= 3) {
    return { province: parts[0], city: parts[1], address: parts.slice(2).join('، ') }
  }
  if (parts.length === 2) return { province: parts[0], city: parts[1], address: '' }
  return { province: t, city: t, address: '' }
}

/** «علي پرون» → { firstName:'علي', lastName:'پرون' } */
function splitPersonName(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return { firstName: '', lastName: '', full: '' }
  const p = t.split(' ')
  return { firstName: p[0] || '', lastName: p.slice(1).join(' ') || '', full: t }
}

/** فقط ارقام لاتین (کاما و «ریال» و … حذف) */
function onlyDigits(raw) {
  return toLatin(raw).replace(/\D/g, '')
}

/* ═══════════ خواندن جدول تاریخچه ═══════════
   ستون‌ها:
     0 ردیف | 1 تاریخ | 2 زمان | 3 فرستنده | 4 گیرنده | 5 راننده
     6 خودرو | 7 ارزش بار | 8 بیمه | 9 مبدا | 10 مقصد
     11 کد رهگیری | 12 عملیات

   آدرس کامل در ویژگی title سلول مبدا/مقصد است:
     «کرمان، سیرجان، خیابان ابن سینا، خیابان بدر جنوبی-سیرجان-کرمان»
      └─────────── آدرس ───────────┘ └─شهر─┘ └استان┘
   ═══════════════════════════════════════════ */

/** «45|923-ع-17» → { twoDigit:'45', threeDigit:'923', letter:'ع', iran:'17' } */
function parsePlateFromHistory(raw) {
  // فاصله‌ها را فقط برای قالب اصلی حذف می‌کنیم؛ قالب جایگزین به فاصله نیاز دارد
  const spaced = toLatin(raw).replace(/\s+/g, ' ').trim()
  const t = spaced.replace(/\s+/g, '')
  const m = t.match(/(\d+)\s*\|\s*(\d+)\s*-\s*([\u0600-\u06FF]+)\s*-\s*(\d+)/)
  if (m) return { twoDigit: m[1], threeDigit: m[2], letter: m[3], iran: m[4], text: `${m[1]} ${m[3]} ${m[2]} ${m[4]}` }

  // قالب جایگزین: «45 ع 923 17»  (از نسخه‌ی فاصله‌دار می‌خوانیم)
  const letter = (spaced.match(/[\u0600-\u06FF]+/) || [''])[0]
  const nums = spaced.match(/\d+/g) || []
  if (nums.length >= 3) {
    return {
      twoDigit: nums[0], threeDigit: nums[1], letter, iran: nums[2],
      text: [nums[0], letter, nums[1], nums[2]].filter(Boolean).join(' '),
    }
  }
  return { twoDigit: '', threeDigit: '', letter: '', iran: '', text: String(raw || '').trim() }
}

/** «آدرس-شهر-استان» → { province, city, address } */
function parseHistoryLocation(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim()
  if (!t) return { province: '', city: '', address: '' }

  const parts = t.split('-').map((x) => x.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const province = parts[parts.length - 1]
    const city = parts[parts.length - 2]
    let address = parts.slice(0, parts.length - 2).join('-').trim()

    // پیشوند «استان، شهر، » را از ابتدای آدرس بردار
    const lead = address.split('،').map((x) => x.trim())
    while (lead.length > 1 && (lead[0] === province || lead[0] === city)) lead.shift()
    address = lead.join('، ')

    return {
      province: province === 'نامشخص' ? '' : province,
      city: city === 'نامشخص' ? '' : city,
      address,
    }
  }
  return splitLocation(t)
}

/**
 * همه‌ی سطرهای جدول تاریخچه را می‌خواند.
 * خروجی: آرایه‌ای از بارنامه‌ها، جدیدترین اول.
 */
async function scrapeHistoryTable(page) {
  return page.evaluate(() => {
    const clean = (t) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()
    const rows = []

    const tbl = document.querySelector('#myTable tbody') || document.querySelector('table.dataTable tbody')
    if (!tbl) return rows

    for (const tr of tbl.querySelectorAll('tr')) {
      const td = Array.from(tr.querySelectorAll('td'))
      if (td.length < 12) continue

      // آدرس کامل در title است، متن سلول کوتاه‌شده («کرمان، سیرج...»)
      const titleOf = (cell) => {
        const el = cell.querySelector('[title]')
        return el ? String(el.getAttribute('title') || '').trim() : clean(cell.textContent)
      }

      rows.push({
        index: clean(td[0].textContent),
        date: clean(td[1].textContent),
        time: clean(td[2].textContent),
        sender: clean(td[3].textContent),
        receiver: clean(td[4].textContent),
        driver: clean(td[5].textContent),
        plateRaw: clean(td[6].textContent),
        cargoValue: clean(td[7].textContent),
        insurance: clean(td[8].textContent),
        originTitle: titleOf(td[9]),
        destTitle: titleOf(td[10]),
        trackingCode: clean(td[11].textContent),
      })
    }
    return rows
  }).catch(() => [])
}

/**
 * صفحه‌ی جزئیات را می‌خواند و همه‌ی فیلدها را برمی‌گرداند.
 */
async function scrapeBarnameDetail(page) {
  return page.evaluate(() => {
    const val = (id) => {
      const el = document.getElementById(id)
      return el ? String(el.value ?? el.textContent ?? '').trim() : ''
    }
    const sel = (id) => {
      const el = document.getElementById(id)
      if (!el) return { value: '', text: '' }
      const o = el.options ? el.options[el.selectedIndex] : null
      return { value: String(el.value || ''), text: o ? (o.label || o.textContent || '').trim() : '' }
    }

    // ── کالاها ──
    const cargo = []
    document.querySelectorAll('tr.proTr').forEach((tr) => {
      const c = Array.from(tr.querySelectorAll('td, th')).map((x) => (x.textContent || '').trim())
      if (c.length >= 4 && c[0]) {
        cargo.push({ name: c[0], packaging: c[1], count: c[2], weightTon: c[3] })
      }
    })

    // ── پلاک ──
    const isFreeZone = String(val('HasFreeZoneCarTag')).toLowerCase() === 'true'
    const letter = sel('Part3')

    return {
      trackingCode: val('trackingCode'),
      sender: val('sender'),
      receiver: val('receiver'),
      driverName: val('driverName'),
      // نام کاربر از نوار بالا — منبع دوم و مطمئن‌تر
      headerUserName: (() => {
        const clean = (t) => String(t || '').replace(/[\u200c\s]+/g, ' ').trim()
        for (const el of document.querySelectorAll('span.user-name, small.user-name')) {
          const t = clean(el.textContent)
          if (!t || t.length < 3) continue
          if (/خوش آمدید|نام کاربر|خروج|ورود/.test(t)) continue
          return t
        }
        return ''
      })(),
      driverNationalCode: val('nationalCode'),
      date: val('dates'),

      plate: {
        freeZone: isFreeZone,
        // پلاک عادی
        twoDigit: val('Part1'),
        threeDigit: val('Part4'),
        letterValue: letter.value,
        letterText: letter.text,
        iran: val('Part2'),
        // پلاک منطقه آزاد
        fzTwoDigit: val('twodight'),
        fzNumber: val('FreeCartag'),
        fzZone: sel('FreeZoneId').text,
      },

      announceCost: val('announceCost'),
      insuranceCost: val('insuranceCost'),
      origin: val('origin'),
      destination: val('destination'),

      selfDeclaredStart: val('SelfDeclaredTimeOfStartShipment'),
      estimatedEnd: val('EstimatedTimeOfEndShipment'),
      shippingStart: val('ShippingStartDate'),
      shippingFinish: val('ShippingFinishDate'),

      cargo,
    }
  }).catch(() => null)
}

/**
 * ورود → تاریخچه → جزئیات → استخراج.
 *
 * opts = { credentials:{username,password}, headless, onLog }
 * خروجی: { success, data, error, raw }
 */
async function importLastBarname(opts) {
  const { credentials, headless = false, onLog = null, onBrowser = null, shouldStop = null } = opts
  // سرعت دریافت اطلاعات از آخرین بارنامه: پیش‌فرض جدید مثل تب اتوماسیون سریع است.
  // اگر روزی خواستی حالت خیلی آرام قبلی را برگردانی، fast:false پاس بده.
  const fast = opts.fast !== false
  if (onLog) setLogSink(onLog)
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const { chromium } = require('playwright')
  const LAUNCH = {
    headless,
    channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  }
  const browser = await chromium.launch(LAUNCH)
  if (onBrowser) { try { onBrowser(browser) } catch (e) {} }
  const ctx = await browser.newContext({ viewport: null, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  const page = await ctx.newPage()

  const iPause = (min, max) => fast ? page.waitForTimeout(Math.max(80, Math.min(350, Math.floor((min + max) / 14)))) : humanPause(min, max)
  const iShort = () => fast ? page.waitForTimeout(120) : shortPause()
  const iMedium = () => fast ? page.waitForTimeout(250) : mediumPause()
  const iLong = () => fast ? page.waitForTimeout(100) : longPause()
  const iSettle = async (label = '') => {
    if (!fast) return settlePage(page, label)
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
    for (let i = 0; i < 6; i++) {
      const busy = await page.evaluate(() => {
        const l = document.getElementById('loading')
        if (l && l.offsetParent !== null) return true
        return !!document.querySelector('.blockUI, .loading-overlay, .page-loader')
      }).catch(() => false)
      if (!busy) break
      await page.waitForTimeout(150)
    }
    await page.evaluate(() => {
      document.getElementById('loading')?.remove()
      document.querySelectorAll('.blockUI, .loading-overlay, .page-loader').forEach((e) => e.remove())
    }).catch(() => {})
    if (label) console.log(`   ⏩ ${label} آماده شد`)
  }
  const iType = async (sel, txt) => {
    if (!fast) return humanType(page, sel, txt)
    const el = await page.$(sel)
    if (!el) return false
    await el.click({ clickCount: 3 }).catch(() => {})
    await el.fill(String(txt || '')).catch(async () => { await el.type(String(txt || ''), { delay: 5 }).catch(() => {}) })
    return true
  }
  const iClick = async (sel) => fast
    ? !!(await page.$(sel).then(async (el) => { if (!el) return false; await el.click().catch(() => {}); return true }).catch(() => false))
    : humanClick(page, sel)

  const done = async (r) => { await browser.close().catch(() => {}); return r }
  const stopRequested = async () => {
    if (!shouldStop) return false
    try { return await shouldStop() } catch (e) { return false }
  }
  if (await stopRequested()) return done({ success: false, error: 'توسط کاربر متوقف شد', kind: 'stopped' })

  try { await assertGeneralInternet('دریافت اطلاعات آخرین بارنامه') }
  catch (e) { return done({ success: false, error: String((e && e.message) || e), kind: 'block' }) }

  try {
    console.log(`حساب: ${credentials.username}`)
    console.log('\n→ ورود به سامانه...')

    if (await stopRequested()) return done({ success: false, error: 'توسط کاربر متوقف شد', kind: 'stopped' })
    const nav = await gotoR(page, LOGIN_URL, 'صفحه ورود')
    if (nav === 'BLOCKED') {
      return done({ success: false, error: 'IP بلاک شد — چند دقیقه بعد دوباره تلاش کنید', kind: 'block' })
    }
    if (nav === 'TIMEOUT' || !nav) {
      return done({ success: false, error: 'اتصال به سایت برقرار نشد', kind: 'block' })
    }
    await iSettle( 'صفحه‌ی ورود')

    if (await isServerBusy(page)) {
      const m = await readBusyMessage(page)
      return done({ success: false, error: 'سرور مشغول است: ' + m, kind: 'busy' })
    }

    await iType( '#NationalCode', credentials.username)
    await iShort()
    await iType( '#user-password', credentials.password)
    await iShort()

    // ── حل کپچا و ورود ──
    let logged = false
    let lastErr = 'ورود ناموفق'
    let credKind = null

    for (let att = 1; att <= 6; att++) {
      const t = await classifyTemplate(page)
      if (t.error) {
        console.log(`   ✖ کپچا: ${t.error} → رفرش`)
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
        await iSettle()
        await iType( '#NationalCode', credentials.username)
        await iShort()
        await iType( '#user-password', credentials.password)
        continue
      }
      const ans = solveMath(t.expr)
      const minS = Math.min(...t.symbols.map((x) => x.score))
      console.log(`   ◈ کپچا: ${t.expr} ⇒ ${ans} (${(minS * 100).toFixed(0)}%)`)
      if (ans === null || minS < 0.42) {
        await iClick( '#dntCaptchaRefreshButton')
        await iPause(1800, 3200)
        continue
      }
      await iType( '#DNTCaptchaInputText', ans)
      await iMedium()
      await iClick( '#inter')

      const res = await waitLoginResult(page, 45000)
      if (res.ok) { logged = true; console.log(`   ✅ ورود موفق (${res.waited}s)`); break }
      lastErr = res.error || lastErr
      if (res.credentialKind) { credKind = res.credentialKind; console.log(`   🛑 ${res.error}`); break }
      console.log(`   ✖ ورود نشد — ${String(res.error || '').slice(0, 80)}`)
      await iPause(2000, 4000)
      await iClick( '#dntCaptchaRefreshButton')
      await iType( '#NationalCode', credentials.username)
      await iShort()
      await iType( '#user-password', credentials.password)
    }

    if (!logged) return done({ success: false, error: lastErr, kind: credKind || 'error' })

    /* نام دارنده‌ی حساب را همین‌جا از نوار بالا بردار —
       قبل از رفتن به تاریخچه، تا حتی اگر تاریخچه خالی بود هم داشته باشیمش. */
    await iSettle( 'صفحه‌ی اصلی')
    const headerName = await readLoggedInUserName(page)
    if (headerName) console.log(`   نام دارنده‌ی حساب: ${headerName}`)
    await iMedium()

    // ── صفحه‌ی تاریخچه ──
    if (await stopRequested()) return done({ success: false, error: 'توسط کاربر متوقف شد', kind: 'stopped' })
    console.log('\n→ باز کردن تاریخچه‌ی بارنامه‌ها...')
    await iLong()   // انسان بلافاصله صفحه عوض نمی‌کند
    const navHist = await gotoR(page, HISTORY_URL, 'تاریخچه')
    if (navHist === 'BLOCKED') {
      return done({ success: false, error: 'IP بلاک شد هنگام باز کردن تاریخچه', kind: 'block' })
    }
    if (!navHist) {
      return done({ success: false, error: 'صفحه‌ی تاریخچه باز نشد', kind: 'block' })
    }
    await iSettle( 'صفحه‌ی تاریخچه')

    // دکمه‌ی «جزئیات» — ممکن است با AJAX دیر بیاید
    let hasBtn = false
    for (let i = 0; i < 30; i++) {
      hasBtn = await page.evaluate(() =>
        !!document.querySelector('#btnDetailfirst, button[name="btnDetailfirst"]')).catch(() => false)
      if (hasBtn) break
      await page.waitForTimeout(500)
    }

    if (!hasBtn) {
      const sw = await readSwalError(page)
      await page.screenshot({ path: path.join(OUT, 'import-nohistory.png'), fullPage: true }).catch(() => {})
      return done({
        success: false,
        error: sw || 'هیچ بارنامه‌ای در تاریخچه‌ی این حساب پیدا نشد — ابتدا یک بارنامه دستی ثبت کنید',
        kind: 'no_history',
        // حتی بدون بارنامه، لااقل نام دارنده‌ی حساب را می‌دانیم
        accountHolderName: headerName || '',
      })
    }

    /* ── اول خود جدول تاریخچه را بخوان ──
       جدول تقریبا همه‌چیز را دارد و مهم‌تر از همه، آدرس کامل مبدا و
       مقصد در ویژگی title سلول‌هاست — جایی که استان و شهر هم جدا آمده‌اند:
           «کرمان، سیرجان، خیابان ابن سینا-سیرجان-کرمان»
       صفحه‌ی جزئیات فقط متن فشرده دارد، پس جدول دقیق‌تر است. */
    await iMedium()   // فرصت به DataTables برای رندر کامل
    const historyRows = await scrapeHistoryTable(page)
    if (historyRows.length) {
      console.log(`   ✔ ${historyRows.length} بارنامه در جدول تاریخچه`)
      const h0 = historyRows[0]
      console.log(`      جدیدترین: ${h0.date} ${h0.time} | کد ${h0.trackingCode} | پلاک ${h0.plateRaw}`)
    } else {
      console.log('   ⚠ جدول تاریخچه خوانده نشد — از صفحه‌ی جزئیات استفاده می‌شود')
    }

    console.log('   ✔ دکمه «جزئیات» پیدا شد')
    await iMedium()
    console.log('   → کلیک روی جزئیات...')
    if (!await iClick( '#btnDetailfirst')) {
      await page.evaluate(() => {
        const b = document.querySelector('#btnDetailfirst, button[name="btnDetailfirst"]')
        if (b) b.click()
      }).catch(() => {})
    }

    // منتظر صفحه‌ی جزئیات
    let onDetail = false
    for (let i = 0; i < 40; i++) {
      onDetail = await page.evaluate(() =>
        /RealBarnameDetail/i.test(location.href) || !!document.getElementById('trackingCode'),
      ).catch(() => false)
      if (onDetail) break
      await page.waitForTimeout(500)
    }

    if (!onDetail) {
      await page.screenshot({ path: path.join(OUT, 'import-nodetail.png'), fullPage: true }).catch(() => {})
      return done({ success: false, error: 'صفحه‌ی جزئیات بارنامه باز نشد', kind: 'error' })
    }

    await iSettle( 'صفحه‌ی جزئیات')
    console.log(`   ✔ صفحه‌ی جزئیات باز شد: ${page.url()}`)

    await iMedium()
    const raw = await scrapeBarnameDetail(page)
    if (!raw) return done({ success: false, error: 'خواندن اطلاعات بارنامه ناموفق بود', kind: 'error' })

    await page.screenshot({ path: path.join(OUT, 'import-detail.png'), fullPage: true }).catch(() => {})
    try {
      fs.writeFileSync(path.join(OUT, 'import-detail.json'), JSON.stringify(raw, null, 2), 'utf-8')
    } catch (e) { /* اختیاری */ }

    // ── تبدیل به قالب پروفایل ──
    /* جدول تاریخچه اولویت دارد چون آدرس کامل و تفکیک‌شدهی
       استان/شهر را دارد؛ صفحه‌ی جزئیات فقط متن فشرده دارد. */
    const hist = historyRows[0] || null
    const o = hist && hist.originTitle ? parseHistoryLocation(hist.originTitle) : splitLocation(raw.origin)
    const d = hist && hist.destTitle ? parseHistoryLocation(hist.destTitle) : splitLocation(raw.destination)
    /* نام راننده: اول از نوار بالای سایت، بعد از فیلد #driverName.
       نوار بالا مطمئن‌تر است چون همیشه و در هر صفحه‌ای حضور دارد. */
    const driverSource = headerName || raw.headerUserName || raw.driverName
    const drv = splitPersonName(driverSource || hist?.driver || '')
    if (headerName && raw.driverName && fold_(headerName) !== fold_(raw.driverName)) {
      console.log(`   ⚠ نام نوار بالا («${headerName}») با نام بارنامه («${raw.driverName}») یکی نیست`)
      console.log('      از نام نوار بالا استفاده شد — در صورت نیاز در پروفایل اصلاحش کن')
    }
    const snd = splitPersonName(raw.sender || hist?.sender || '')
    const rcv = splitPersonName(raw.receiver || hist?.receiver || '')
    const c0 = raw.cargo[0] || {}

    const letter = raw.plate.letterText || PLATE_LETTER_BY_VALUE[raw.plate.letterValue] || ''
    const detailPlate = raw.plate.freeZone
      ? `${toLatin(raw.plate.fzTwoDigit)} ${toLatin(raw.plate.fzNumber)} (${raw.plate.fzZone})`.trim()
      : [toLatin(raw.plate.twoDigit), letter, toLatin(raw.plate.threeDigit), toLatin(raw.plate.iran)]
          .filter(Boolean).join(' ')

    // پلاک جدول به قالب «45|923-ع-17» است
    const histPlate = hist ? parsePlateFromHistory(hist.plateRaw) : null
    const plateText = (histPlate && histPlate.text) || detailPlate

    const profile = {
      name: `وارد‌شده از بارنامه ${raw.trackingCode || ''}`.trim(),

      senderFirstName: snd.firstName,
      senderLastName: snd.lastName,
      receiverFirstName: rcv.firstName,
      receiverLastName: rcv.lastName,

      driverName: drv.full,
      driverNationalId: onlyDigits(raw.driverNationalCode),

      plateNumber: plateText,

      cargoName: c0.name || '',
      cargoPackaging: c0.packaging || '',
      cargoQuantity: onlyDigits(c0.count),
      cargoWeight: toLatin(c0.weightTon || '').replace(/[^\d.]/g, ''),
      cargoValue: onlyDigits(hist?.cargoValue || raw.announceCost),
      insuranceAmount: onlyDigits(hist?.insurance || raw.insuranceCost),

      originProvince: o.province,
      originCity: o.city,
      originAddress: o.address,
      destProvince: d.province,
      destCity: d.city,
      destAddress: d.address,

      trackingCode: raw.trackingCode || hist?.trackingCode || '',
      // همه‌ی بارنامه‌های تاریخچه — برای گزارش و انتخاب کاربر
      historyCount: historyRows.length,
      shippingStart: raw.shippingStart || raw.selfDeclaredStart || '',
      shippingFinish: raw.shippingFinish || raw.estimatedEnd || '',
    }

    console.log('\n── اطلاعات استخراج‌شده ──')
    console.log(`   کد رهگیری : ${raw.trackingCode || '—'}`)
    console.log(`   فرستنده   : ${raw.sender || '—'}`)
    console.log(`   گیرنده    : ${raw.receiver || '—'}`)
    console.log(`   راننده    : ${drv.full || '—'} | ${profile.driverNationalId || '—'}`)
    console.log(`   پلاک      : ${plateText || '—'}`)
    console.log(`   کالا      : ${profile.cargoName || '—'} | ${profile.cargoPackaging || '—'} | ` +
                `${profile.cargoQuantity || '—'} بسته | ${profile.cargoWeight || '—'} تن`)
    console.log(`   ارزش      : ${profile.cargoValue || '—'}`)
    console.log(`   مبدا      : ${raw.origin || '—'}`)
    console.log(`   مقصد      : ${raw.destination || '—'}`)
    console.log(`   کالاها    : ${raw.cargo.length} ردیف`)

    return done({ success: true, data: profile, raw, history: historyRows })
  } catch (e) {
    if (await stopRequested()) {
      console.log('   ⏹ عملیات توسط کاربر متوقف شد')
      return done({ success: false, error: 'توسط کاربر متوقف شد', kind: 'stopped' })
    }
    const msg = String((e && e.message) || e).split('\n')[0].slice(0, 200)
    console.log(`   ✖ خطای غیرمنتظره: ${msg}`)
    return done({
      success: false, error: msg,
      kind: isNetBlockError(e) ? 'block' : (isPageDeadError(e) ? 'dead' : 'error'),
    })
  }
}

/* ═══════ تبدیل رکورد RegistrationProfile به داده‌ی موتور ═══════ */
/** رشته‌ی پلاک را به چهار بخش تجزیه می‌کند.
 *  «۴۵ ع ۹۲۳ ۱۷»  →  twoDigit=45, letter=ع, threeDigit=923, iran=17
 *  «۴۵ ع ۹۲۳ ایران ۱۷»  →  همین
 *  «ایران ۴۸»    →  iran=48 (بقیه خالی) — برای تشخیص استان کافی است
 */
function parsePlateText(txt) {
  const raw = toLatin(txt || '').trim()
  const beforeIran = raw.match(/(?:^|\D)(\d{1,2})\s*(?:ایران|ايران)(?:\D|$)/i)?.[1] || ''
  const afterIran = raw.match(/(?:ایران|ايران)\s*(\d{1,2})(?:\D|$)/i)?.[1] || ''
  const explicitIran = beforeIran || afterIran

  const s = raw.replace(/(?:ایران|ايران)/g, ' ').replace(/[-_|]/g, ' ').trim()
  const letter = (s.match(/[\u0600-\u06FF]+/) || [''])[0]
  let nums = s.match(/\d+/g) || []

  if (explicitIran) {
    const idx = nums.findIndex((n) => n === explicitIran)
    if (idx >= 0) nums = nums.filter((_, i) => i !== idx)
  }

  let twoDigit = ''
  let threeDigit = ''
  let iran = explicitIran
  const threeIdx = nums.findIndex((n) => n.length === 3)

  if (threeIdx >= 0) {
    threeDigit = nums[threeIdx]
    const others = nums.filter((_, i) => i !== threeIdx)
    twoDigit = others.find((n) => n.length <= 2) || others[0] || ''
    if (!iran) iran = others.find((n) => n !== twoDigit && n.length <= 2) || ''
  } else {
    twoDigit = nums.find((n) => n.length <= 2) || nums[0] || ''
    if (!iran) iran = nums.find((n) => n !== twoDigit && n.length <= 2) || ''
  }

  if (!iran && nums.length >= 2) iran = nums[1]

  return {
    twoDigit,
    letter: letter || '',
    threeDigit,
    iran,
  }
}

/* نشانه‌ی «تشخیص خودکار استان» که پنل در notes پروفایل می‌گذارد.
   این‌طور نیاز به تغییر دیتابیس (migration) نیست. */
const AUTO_PROV_TAG = /\[auto-province\]/

function profileToData(p) {
  const name = String(p.driverName || '').trim()
  const parts = name.split(/\s+/)
  const notes = String(p.notes || '')
  const mapLocations = parseProfileMapLocations(notes)
  const manualLocation = MANUAL_LOCATION_TAG.test(notes)
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
      locality: p.originLocality || p.originCity || '',
      address: p.originAddress || '',
      postalCode: p.originPostalCode || '',
      // اگر کاربر تیک «تشخیص خودکار استان از پلاک» را زده باشد
      autoProvince: AUTO_PROV_TAG.test(notes),
      // اگر پروفایل با دکمه نقشه ذخیره شده و حالت دستی خاموش باشد، گام ۵ با مختصات انجام می‌شود
      mapLocation: !manualLocation && mapLocations ? mapLocations.origin : null,
    },
    destination: {
      province: p.destProvince || '',
      city: p.destCity || '',
      locality: p.destLocality || p.destCity || '',
      address: p.destAddress || '',
      postalCode: p.destPostalCode || '',
      /* تشخیص خودکار استان از پلاک — مثل مبدا از تگ notes می‌آید.
         (قبلا از فیلد p.autoProvinceFromPlate می‌خواند که در دیتابیس
         وجود ندارد و همیشه false بود ⇒ استان مقصد هیچ‌وقت از پلاک
         تشخیص داده نمی‌شد — باگ. حالا هر دو از notes خوانده می‌شوند.) */
      autoProvince: AUTO_PROV_TAG.test(notes) || p.autoProvinceFromPlate === true,
      // اگر پروفایل با دکمه نقشه ذخیره شده و حالت دستی خاموش باشد، گام ۶ با مختصات انجام می‌شود
      mapLocation: !manualLocation && mapLocations ? mapLocations.destination : null,
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
    [d.fare.amount, 'مبلغ کرایه'],
  ]
  /* اگر مختصات نقشه ذخیره شده باشد، شهر/استان برای گام ۵ و ۶ لازم نیست؛
     در غیر این صورت روش دستی/Select2 همچنان شهر و استان را می‌خواهد. */
  if (!d.origin.mapLocation) req.push([d.origin.city, 'شهر مبدا'])
  if (!d.destination.mapLocation) req.push([d.destination.city, 'شهر مقصد'])
  /* در حالت «تشخیص خودکار استان از پلاک»، استان لازم نیست کاربر پر کند
     — ربات از کد ایران پلاک تشخیصش می‌دهد. */
  if (!d.origin.mapLocation && !d.origin.autoProvince) req.push([d.origin.province, 'استان مبدا'])
  if (!d.destination.mapLocation && !d.destination.autoProvince) req.push([d.destination.province, 'استان مقصد'])
  /* «آدرس مبدا/مقصد» دیگر اجباری نیست — نقشه‌ی سایت بعد از انتخاب
     شهرستان و محله، خودش آدرس متنی را پر می‌کند. */
  for (const [v, label] of req) if (!String(v || '').trim()) miss.push(label)
  return miss
}

/** اعتبارسنجی مخصوص دکمه «ثبت مبدا و مقصد از نقشه».
 * برای این عملیات فقط باید بتوانیم تا گام ۵ برسیم، پس شهر/استان/کرایه لازم نیست.
 */
function validateMapCaptureData(d) {
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
  ]
  for (const [v, label] of req) if (!String(v || '').trim()) miss.push(label)
  return miss
}

async function runProfileMapCapture(opts) {
  return runWaybill({
    ...opts,
    submit: false,
    closeBrowser: true,
    captureMapLocations: true,
  })
}

module.exports = {
  runWaybill, runWaybillOnce, importLastBarname, scrapeBarnameDetail,
  readLoggedInUserName, isLoggedInByUserMenu, scrapeHistoryTable,
  humanPause, humanType, humanClick, settlePage,
  parsePlateFromHistory, parseHistoryLocation,
  provinceFromPlate, select2Pick, IRAN_CODE_TO_PROVINCE,
  splitLocation, splitPersonName, profileToData, validateData, validateMapCaptureData, parsePlateText, setLogSink,
  parseProfileMapLocations, runProfileMapCapture,
  // برای استفاده‌ی مستقیم در ابزارهای تست
  gotoR, classifyTemplate, solveMath, waitLoginResult,
  fillPersonStep, fillDriverVehicleStep, fillDriverVehicleStepWithRetries, fillCargoStep, fillLocationStep,
  captureLocationFromMapStep, applySavedMapLocationStep,
  passReviewStep, fillFareStep, finalConfirmStep,
  pageHealth, isWafChallenge, waitUntilSiteBack,
  isNetBlockError, isPageDeadError, isAccountRestrictedError, isServerTempError, isPermanentError,
  classifyCredentialError,
  isServerBusy, readBusyMessage, readSwalError, waitForSwalError, sleepWithLog,
  STEP_SENDER, STEP_RECEIVER, STEP_ORIGIN, STEP_DEST,
  SITE, LOGIN_URL, TARGET_URL, OUT,
}
