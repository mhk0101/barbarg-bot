/**
 * test-step1.js — تست گام اول فرم (مشخصات فرستنده)
 *
 * ورود خودکار (با حل کپچا) → باز کردن فرم → پر کردن گام ۱ → مرحله بعد
 *
 *   node test-step1.js
 *
 * داده‌ی فرستنده از اولین پروفایل فعال دیتابیس خوانده می‌شود.
 * اگر پروفایلی نبود، داده‌ی نمونه استفاده می‌شود.
 */

const path = require('path')
const fs = require('fs')

const SITE = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE}/Barname/Account/Login`
const TARGET_URL = `${SITE}/barname/Document/HagigiHogugi`
const IMG_SEL = '#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]'
const OUT = path.join(process.cwd(), 'diagnostics')

/* ═══════════════════════════════════════════════════════════════════
   حالت رندوم — موقت، فقط برای تست
   ───────────────────────────────────────────────────────────────────
   روشن/خاموش کردن:
       node test-step1.js            → رندوم روشن (پیش‌فرض)
       node test-step1.js --profile  → از پروفایل دیتابیس بخوان
       node test-step1.js --random   → رندوم روشن (صریح)

   برای حذف کامل: این بلوک + تابع randomSender() + شرط RANDOM_MODE
   در main() را پاک کن. جای همه با «موقت» علامت خورده است.
   ═══════════════════════════════════════════════════════════════════ */
const RANDOM_MODE = !process.argv.includes('--profile')

const FA_FIRST = ['علی','محمد','رضا','حسین','مهدی','امیر','سعید','مجید','حسن','ابوالفضل',
                  'فاطمه','زهرا','مریم','سمیه','نرگس','الهام','زینب','سارا']
const FA_LAST  = ['محمدی','احمدی','رضایی','حسینی','کریمی','موسوی','جعفری','نوری','قاسمی',
                  'صادقی','مرادی','عباسی','یوسفی','شریفی','اکبری','زارع','کاظمی']
const CO_PRE   = ['حمل و نقل','بازرگانی','ترابری','تجارت','پخش','صنایع','گروه']
const CO_POST  = ['پارس','آریا','ایرانیان','سپهر','البرز','کویر','زاگرس','خلیج فارس','نگین']

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')

/** کد پستی معتبر طبق قاعده‌ی سایت */
function randomPostal() {
  const A = '13456789', B = '1346789', C = '013456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]
  s += B[Math.floor(Math.random() * B.length)]
  for (let i = 0; i < 5; i++) s += C[Math.floor(Math.random() * C.length)]
  return s
}

/** کد ملی ایرانی با رقم کنترلی معتبر (وگرنه سایت رد می‌کند) */
function randomNationalCode() {
  for (let tries = 0; tries < 50; tries++) {
    const base = digits(9)
    if (/^(\d)\1{8}$/.test(base)) continue        // همه‌ی ارقام یکسان مجاز نیست
    let sum = 0
    for (let i = 0; i < 9; i++) sum += parseInt(base[i], 10) * (10 - i)
    const r = sum % 11
    const check = r < 2 ? r : 11 - r
    return base + String(check)
  }
  return '0084575948'
}

/** شناسه‌ی ملی شرکت (۱۱ رقمی) */
function randomCompanyId() {
  return '10' + digits(9)
}

function randomMobile() {
  return '09' + pick(['12','13','19','35','36','38','39','01','02','03','05','90','91','33']) + digits(7)
}

function randomTell() {
  return '0' + pick(['21','26','31','35','41','51','61','71','76','81','86']) + digits(8)
}

/** موقت — تولید یک فرستنده‌ی تصادفی */
function randomPerson() {
  // همیشه «حقیقی» — طبق نیاز پروژه
  return {
    type:       'حقیقی',
    firstName:  pick(FA_FIRST),
    lastName:   pick(FA_LAST),
    mobile:     randomMobile(),
    nationalId: randomNationalCode(),
    phone:      Math.random() < 0.7 ? randomTell() : '',
    postalCode: TEST_POSTAL !== null ? TEST_POSTAL : randomPostal(),
  }
}
const randomSender   = randomPerson
const randomReceiver = randomPerson
/* ═══════════════ پایان بلوک رندوم (موقت) ═══════════════ */

/* ═══════════ اعتبارسنجی محلی (مثل خود سایت) ═══════════ */

// کد پستی ثابت برای تست — برای برگشت به حالت رندوم: TEST_POSTAL = null
const TEST_POSTAL = '7518765532'

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
  for (let a = 1; a <= max; a++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return true }
    catch (e) {
      if (isBlock(e)) {
        console.log(`   ⚠ IP بلاک (${a}/${max}) — ${label}`)
        if (a === max) return false
        await waitBack(page, url, 180000 + Math.random() * 120000)
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

async function waitLoginResult(page, maxMs = 30000) {
  const t0 = Date.now()
  let lastLog = 0

  while (Date.now() - t0 < maxMs) {
    // ۱) از صفحه‌ی ورود خارج شدیم؟
    let url = ''
    try { url = page.url() } catch { /* navigating */ }
    if (url && !url.includes('Login')) {
      // صبر کوتاه تا صفحه‌ی مقصد پایدار شود
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      return { ok: true, waited: Math.round((Date.now() - t0) / 1000) }
    }

    // ۲) پیام خطای سایت
    const err = await page.evaluate(() => {
      const sels = ['.alert-danger', '.text-danger', '.validation-summary-errors', '[role="alert"]',
                    '.toast-error', '.swal2-html-container']
      for (const s of sels) {
        for (const el of document.querySelectorAll(s)) {
          const he = el
          if (he.offsetParent === null) continue
          const t = (he.innerText || '').trim()
          if (t && t.length > 2) return t.replace(/\s+/g, ' ').slice(0, 160)
        }
      }
      return ''
    }).catch(() => '')

    if (err) return { ok: false, error: err, waited: Math.round((Date.now() - t0) / 1000) }

    const el = Math.round((Date.now() - t0) / 1000)
    if (el >= 5 && el - lastLog >= 5) {
      lastLog = el
      console.log(`      ⏱ هنوز در حال ورود... (${el}s)`)
    }

    await page.waitForTimeout(500).catch(() => {})
  }

  return { ok: false, error: 'زمان انتظار ورود تمام شد', waited: Math.round((Date.now() - t0) / 1000) }
}

async function getData() {
  try {
    require('dotenv').config()
    const { PrismaClient } = require('@prisma/client')
    const { PrismaPg } = require('@prisma/adapter-pg')
    const crypto = require('crypto')
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
    const acc = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
    const prof = await prisma.registrationProfile.findFirst({ where: { status: 'active' } })
    await prisma.$disconnect()
    if (!acc) return null
    const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
    const key = crypto.createHash('sha256').update(SECRET).digest()
    const [iv, dt] = acc.passwordEncrypted.split(':')
    const dec = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'))
    let pw = dec.update(dt, 'hex', 'utf8'); pw += dec.final('utf8')
    return { username: acc.username, password: pw, accName: acc.accountName, profile: prof }
  } catch (e) { console.log('   (دیتابیس: ' + e.message + ')'); return null }
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const d = await getData()
  if (!d) { console.error('❌ حساب فعالی یافت نشد'); process.exit(1) }
  console.log(`حساب: ${d.accName} (${d.username})`)

  const p = d.profile

  // ═══════════ حالت رندوم (موقت — فقط برای تست) ═══════════
  const sender = RANDOM_MODE ? randomSender() : {
    type:        p?.senderType || 'حقیقی',
    officeName:  p ? [p.senderFirstName, p.senderLastName].filter(Boolean).join(' ') : 'شرکت نمونه',
    firstName:   p?.senderFirstName   || 'علی',
    lastName:    p?.senderLastName    || 'محمدی',
    mobile:      p?.senderMobile      || '09121234567',
    nationalId:  p?.senderNationalId  || '0012345678',
    phone:       p?.senderPhone       || '',
    postalCode:  p?.senderPostalCode  || '',
  }

  if (TEST_POSTAL) {
    const pc = checkPostal(TEST_POSTAL)
    if (!pc.ok) {
      console.log(`\n⚠️  کد پستی تست «${TEST_POSTAL}» طبق قاعده‌ی سایت نامعتبر است: ${pc.why}`)
      console.log('   سایت احتمالاً ردش می‌کند. نمونه‌ی معتبر: ' + randomPostal())
      console.log('   برای رندومِ معتبر، در بالای فایل بگذار:  const TEST_POSTAL = null')
    }
  }

  if (RANDOM_MODE) {
    console.log('\n🎲 حالت رندوم فعال است (داده‌ی ساختگی، نه از پروفایل)')
    console.log('   نوع فرستنده : ' + sender.type)
    console.log('   نام         : ' + sender.firstName + ' ' + sender.lastName)
    if (/حقوقی/.test(sender.type)) console.log('   نام شرکت    : ' + sender.officeName)
    console.log('   موبایل      : ' + sender.mobile)
    console.log('   کد ملی      : ' + sender.nationalId + '  (چک‌رقم معتبر)')
    console.log('   تلفن        : ' + sender.phone)
    console.log('   کدپستی      : ' + sender.postalCode)
  } else {
    console.log(`پروفایل: ${p ? p.name : '(نمونه)'} | نوع فرستنده: ${sender.type}`)
  }

  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: false, channel: 'chrome',
    args: ['--start-maximized','--no-sandbox','--disable-blink-features=AutomationControlled'] })
  const ctx = await browser.newContext({ viewport: null, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  const page = await ctx.newPage()

  console.log('\n→ ورود به سامانه...')
  if (!await gotoR(page, LOGIN_URL, 'صفحه ورود')) { console.log('❌ اتصال نشد'); await browser.close(); return }
  await page.waitForTimeout(2500)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(()=>{})

  await (await page.$('#NationalCode'))?.fill(d.username)
  await (await page.$('#user-password'))?.fill(d.password)

  let logged = false
  for (let att = 1; att <= 6; att++) {
    const t = await classifyTemplate(page)
    if (t.error) {
      console.log(`   ✖ کپچا: ${t.error} → رفرش`)
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(()=>{})
      await page.waitForTimeout(2500)
      await page.evaluate(() => document.getElementById('loading')?.remove()).catch(()=>{})
      await (await page.$('#NationalCode'))?.fill(d.username)
      await (await page.$('#user-password'))?.fill(d.password)
      continue
    }
    const ans = solveMath(t.expr)
    const minS = Math.min(...t.symbols.map(s => s.score))
    console.log(`   ◈ کپچا: ${t.expr} ⇒ ${ans} (اطمینان ${(minS*100).toFixed(0)}%)`)
    if (ans === null || minS < 0.42) {
      await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(()=>{})
      await page.waitForTimeout(1500); continue
    }
    const ci = await page.$('#DNTCaptchaInputText')
    await ci?.fill(''); await ci?.type(ans, { delay: 35 })
    await page.waitForTimeout(300)
    await (await page.$('#inter'))?.click()

    // صبر فعال تا نتیجه‌ی ورود مشخص شود (تا ۳۰ ثانیه)
    const res = await waitLoginResult(page, 30000)
    if (res.ok) { logged = true; console.log(`   ✅ ورود موفق (${res.waited}s)`); break }
    console.log(`   ✖ ورود نشد (${res.waited}s)${res.error ? ' — ' + res.error : ''}`)

    await (await page.$('#dntCaptchaRefreshButton'))?.click().catch(()=>{})
    await page.waitForTimeout(1200)
    await (await page.$('#NationalCode'))?.fill(d.username)
    await (await page.$('#user-password'))?.fill(d.password)
  }
  if (!logged) { console.log('❌ ورود ناموفق'); await page.waitForTimeout(60000); await browser.close(); return }

  console.log('\n→ باز کردن فرم بارنامه...')
  if (!await gotoR(page, TARGET_URL, 'فرم بارنامه')) { console.log('❌ فرم باز نشد'); await browser.close(); return }
  await page.waitForTimeout(2500)
  await page.evaluate(() => document.getElementById('loading')?.remove()).catch(()=>{})

  const hasForm = await page.$('#senderSelectType')
  if (!hasForm) { console.log('❌ #senderSelectType پیدا نشد — ساختار عوض شده؟'); }
  else console.log('   ✅ فرم باز شد')

  // --- تشخیص وضعیت صفحه ---
  const diag = await page.evaluate(() => {
    const ids = ['senderSelectType','txtSenderOfficeName','txtSenderFirstName','txtSenderLastName',
                 'txtSenderMobile','txtSenderNationalCode','txtSenderTell','txtSenderPostalCode','btnGoLVL2']
    const st = {}
    for (const id of ids) {
      const el = document.getElementById(id)
      if (!el) { st[id] = 'نیست'; continue }
      let n = el, hidden = false
      while (n) {
        const s = getComputedStyle(n)
        if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break }
        if (n.classList && (n.classList.contains('hidden') || n.classList.contains('d-none'))) { hidden = true; break }
        n = n.parentElement
      }
      st[id] = hidden ? 'مخفی' : 'قابل‌مشاهده'
    }
    return {
      url: location.href,
      title: document.title,
      hasJQuery: typeof window.jQuery !== 'undefined',
      activeTab: document.querySelector('.tab-pane.active')?.id || '-',
      fields: st,
    }
  }).catch(() => null)

  if (diag) {
    console.log(`   URL   : ${diag.url}`)
    console.log(`   عنوان : ${diag.title}`)
    console.log(`   تب فعال: ${diag.activeTab} | jQuery: ${diag.hasJQuery ? 'هست' : 'نیست'}`)
    console.log('   وضعیت فیلدها (قبل از انتخاب نوع):')
    for (const [k, v] of Object.entries(diag.fields)) console.log(`      ${k.padEnd(24)} ${v}`)
  }

  // ---------- گام ۱ ----------
  // ══════════ گام ۱ و ۲ ══════════
  const receiver = RANDOM_MODE ? randomReceiver() : {
    type:       p?.receiverType || 'حقیقی',
    firstName:  p?.receiverFirstName  || 'حسن',
    lastName:   p?.receiverLastName   || 'کریمی',
    mobile:     p?.receiverMobile     || '09129876543',
    nationalId: p?.receiverNationalId || '0084575948',
    phone:      p?.receiverPhone      || '',
    postalCode: p?.receiverPostalCode || '',
  }

  if (RANDOM_MODE) {
    console.log('   گیرنده     : ' + receiver.firstName + ' ' + receiver.lastName +
                ' | ' + receiver.mobile + ' | ' + receiver.nationalId)
  }

  console.log('\n═══ ' + STEP_SENDER.label + ' ═══')
  console.log('   نوع: حقیقی (value=1)')
  const ok1 = await fillPersonStep(page, STEP_SENDER, sender, OUT, 'step1')

  let ok2 = false
  if (ok1) {
    console.log('   ✅ گام ۲ باز شد')
    console.log('\n═══ ' + STEP_RECEIVER.label + ' ═══')
    console.log('   نوع: حقیقی (value=1)')
    ok2 = await fillPersonStep(page, STEP_RECEIVER, receiver, OUT, 'step2')
    if (ok2) console.log('   ✅ گام ۳ باز شد — گام ۱ و ۲ کامل درست کار کردند!')
  } else {
    console.log('   ✖ گام ۱ ناموفق — گام ۲ اجرا نشد')
  }

  // ذخیره‌ی HTML گام بعدی برای ساخت مراحل بعد
  try {
    fs.writeFileSync(path.join(OUT, 'step3.html'), await page.content(), 'utf-8')
    console.log('\n   📁 diagnostics/step3.html  ← این را بفرست تا گام ۳ را بسازم')
  } catch (e) {}

  // ═══════ تکرار با داده‌ی رندوم جدید (موقت) ═══════
  const repeatArg = process.argv.find(a => a.startsWith('--repeat='))
  const repeatN = repeatArg ? parseInt(repeatArg.split('=')[1], 10) || 1 : 1
  if (RANDOM_MODE && repeatN > 1) {
    for (let round = 2; round <= repeatN; round++) {
      console.log(`\n\n╔══════ دور ${round}/${repeatN} — داده‌ی رندوم جدید ══════╗`)
      if (!await gotoR(page, TARGET_URL, 'فرم بارنامه')) { console.log('   ✖ فرم باز نشد'); break }
      await page.waitForTimeout(1500)
      await page.evaluate(() => document.getElementById('loading')?.remove()).catch(() => {})

      const s2 = randomSender(), r2 = randomReceiver()
      console.log(`   فرستنده: ${s2.firstName} ${s2.lastName} | ${s2.mobile} | ${s2.nationalId}`)
      const a1 = await fillPersonStep(page, STEP_SENDER, s2, OUT, `r${round}-step1`, false)
      if (!a1) { console.log(`   ✖ دور ${round}: گام ۱ ناموفق`); continue }
      console.log(`   گیرنده : ${r2.firstName} ${r2.lastName} | ${r2.mobile} | ${r2.nationalId}`)
      const a2 = await fillPersonStep(page, STEP_RECEIVER, r2, OUT, `r${round}-step2`, false)
      console.log(a2 ? `   ✅ دور ${round}: گام ۱ و ۲ موفق` : `   ✖ دور ${round}: گام ۲ ناموفق`)
    }
  }

  console.log('\nمرورگر ۳ دقیقه باز می‌ماند...')
  await page.waitForTimeout(180000).catch(()=>{})
  await browser.close().catch(()=>{})
}

main().catch(e => { console.error('خطا:', e.message); process.exit(1) })
