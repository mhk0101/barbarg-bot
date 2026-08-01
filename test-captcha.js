/**
 * test-captcha.js — تست مکانیزم جدید حل کپچا
 *
 *   node test-captcha.js              (حساب از دیتابیس)
 *   node test-captcha.js <کدملی> <رمز>
 *
 * همان منطق CaptchaSolver جدید را پیاده می‌کند تا بدون build
 * بشود سریع تست کرد.
 */

const path = require('path')
const fs = require('fs')

const SITE = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE}/Barname/Account/Login`
const TARGET_URL = `${SITE}/barname/Document/HagigiHogugi`
const IMG_SEL = '#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i]'
const INP_SEL = '#DNTCaptchaInputText, input[name="DNTCaptchaInputText"]'
const OUT = path.join(process.cwd(), 'diagnostics', 'captcha')

function ensure(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

function normalizeDigits(s) {
  return String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

function fixConfusions(s) {
  return String(s)
    .replace(/[oO\u00b0\u00baOo.,'"`)(]/g, '0').replace(/[iIl|!\]\[}{]/g, '1')
    .replace(/[YyVv]/g, '7').replace(/[SsAa]/g, '5').replace(/[Zz]/g, '2')
    .replace(/[Bb]/g, '8').replace(/[Gg]/g, '6').replace(/[Tt]/g, '1')
    .replace(/[Ff]/g, '4').replace(/[qQ]/g, '9')
    .replace(/[\u2014\u2013_~]/g, '-').replace(/[xX]/g, '*')
}

const DIGIT_MAP = {
  o:'0',O:'0','\u00b0':'0','.':'0',',':'0',')':'0','(':'0',"'":'0','"':'0','*':'0','e':'0','c':'0','C':'0',
  i:'1',I:'1',l:'1','|':'1','!':'1',']':'1','[':'1',j:'1',r:'1',T:'1',t:'1',
  Y:'7',y:'7',V:'7',v:'7',u:'7',
  S:'5',s:'5',A:'5',a:'5',
  Z:'2',z:'2', B:'8',b:'8', G:'6',g:'6',d:'6',D:'6',
  F:'4',f:'4',L:'4',h:'4',H:'4',k:'4',K:'4',
  q:'9',Q:'9',p:'9',P:'9',
  m:'3',w:'3',W:'3',M:'3',n:'3',x:'3',X:'3',
}
function charToDigit(ch) {
  const c = normalizeDigits(String(ch)).trim()
  if (/^\d$/.test(c)) return c
  return DIGIT_MAP[c] ?? null
}
const OP_MAP = { t:'+',T:'+','4':'+','#':'+','\u00d7':'*',x:'*',X:'*','\u00f7':'/','\\':'/','\u2014':'-','\u2013':'-',_:'-','~':'-','=':'-' }
function charToOperator(ch) {
  const c = String(ch).trim()
  if (/^[+\-*/]$/.test(c)) return c
  return OP_MAP[c] ?? null
}

function solveMath(text) {
  const s = normalizeDigits(text).replace(/\s+/g, '')
  if (!s) return null
  const m = s.match(/(\d{1,3})\s*([+\-*/×÷xX])\s*(\d{1,3})/)
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[3], 10)
    switch (m[2]) {
      case '+': return String(a + b)
      case '-': return String(a - b)
      case '*': case '×': case 'x': case 'X': return String(a * b)
      case '/': case '÷': return b !== 0 ? String(Math.round(a / b)) : null
    }
  }
  if (/[+\-*/\u00d7\u00f7]/.test(s)) {
    const d = s.match(/\d/g)
    if (!d || d.length < 2) return null
  }
  const only = s.match(/^\D*(\d{1,6})\D*$/)
  return only ? only[1] : null
}

async function waitImage(page, ms = 12000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate((sel) => {
      const im = document.querySelector(sel)
      return !!(im && im.complete && im.naturalWidth > 8)
    }, IMG_SEL).catch(() => false)
    if (ok) { await page.waitForTimeout(250); return true }
    await page.waitForTimeout(300)
  }
  return false
}

async function preprocess(page, scale, threshold) {
  return page.evaluate(({ sel, scale, threshold }) => {
    const img = document.querySelector(sel)
    if (!img) return null
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
    if (!w || !h) return null
    const c = document.createElement('canvas')
    c.width = w * scale; c.height = h * scale
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data
      for (let i = 0; i < px.length; i += 4) {
        const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        const v = g < threshold ? 0 : 255
        px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255
      }
      ctx.putImageData(d, 0, 0)
    } catch {}
    return c.toDataURL('image/png')
  }, { sel: IMG_SEL, scale, threshold }).catch(() => null)
}

async function readFromDom(page) {
  return page.evaluate((sel) => {
    const out = []
    const push = (v) => { if (v && String(v).trim()) out.push(String(v).trim()) }
    const img = document.querySelector(sel)
    if (img) {
      push(img.getAttribute('alt')); push(img.getAttribute('title'))
      push(img.getAttribute('aria-label')); push(img.getAttribute('data-text'))
      let p = img.parentElement
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const t = (p.innerText || '').trim()
        if (t && t.length < 40) push(t)
      }
    }
    document.querySelectorAll('label,span,div,p,td').forEach((el) => {
      const t = (el.innerText || '').trim()
      if (t && t.length <= 20 && /[\d\u06F0-\u06F9\u0660-\u0669]\s*[+\-*/×÷]\s*[\d\u06F0-\u06F9\u0660-\u0669]/.test(t)) out.push(t)
    })
    return out
  }, IMG_SEL).catch(() => [])
}


async function segmentChars(page, scale = 8) {
  return page.evaluate(({ sel, scale }) => {
    const img = document.querySelector(sel)
    if (!img) return null
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
    if (!w || !h) return null
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d'); if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    let px
    try { px = ctx.getImageData(0, 0, w, h).data } catch { return null }
    const dark = []
    for (let x = 0; x < w; x++) {
      let has = false
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4
        const g = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]
        if (g < 160 && px[i+3] > 40) { has = true; break }
      }
      dark.push(has)
    }
    const groups = []; let st = -1
    for (let x = 0; x < w; x++) {
      if (dark[x] && st === -1) st = x
      else if (!dark[x] && st !== -1) { if (x - st >= 2) groups.push({x0:st,x1:x}); st = -1 }
    }
    if (st !== -1 && w - st >= 2) groups.push({x0:st,x1:w})
    if (groups.length < 2 || groups.length > 6) return null
    const out = []
    for (const g of groups) {
      let y0 = h, y1 = 0
      for (let y = 0; y < h; y++) {
        for (let x = g.x0; x < g.x1; x++) {
          const i = (y*w+x)*4
          const gr = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]
          if (gr < 160 && px[i+3] > 40) { if (y<y0) y0=y; if (y>y1) y1=y; break }
        }
      }
      if (y1 <= y0) continue
      const cw = g.x1-g.x0, ch = y1-y0+1, pad = 8
      const oc = document.createElement('canvas')
      oc.width = cw*scale + pad*2; oc.height = ch*scale + pad*2
      const o = oc.getContext('2d'); if (!o) continue
      o.imageSmoothingEnabled = false
      o.fillStyle = '#fff'; o.fillRect(0,0,oc.width,oc.height)
      o.drawImage(img, g.x0, y0, cw, ch, pad, pad, cw*scale, ch*scale)
      try {
        const d = o.getImageData(0,0,oc.width,oc.height), p2 = d.data
        for (let i = 0; i < p2.length; i += 4) {
          const gr = 0.299*p2[i] + 0.587*p2[i+1] + 0.114*p2[i+2]
          const v = gr < 160 ? 0 : 255
          p2[i]=p2[i+1]=p2[i+2]=v; p2[i+3]=255
        }
        o.putImageData(d,0,0)
      } catch {}
      out.push(oc.toDataURL('image/png'))
    }
    return out.length >= 2 ? out : null
  }, { sel: IMG_SEL, scale }).catch(() => null)
}

async function ocrPerChar(page, T, att) {
  const parts = await segmentChars(page)
  if (!parts || parts.length < 2) return null
  console.log(`   \u2702 ${parts.length} \u0646\u0645\u0627\u062f \u062c\u062f\u0627 \u0634\u062f`)
  parts.forEach((p, i) => {
    try { fs.writeFileSync(path.join(OUT, `seg-${att}-${i}.png`), Buffer.from(p.split(',')[1], 'base64')) } catch {}
  })
  const readOne = async (img, wl, psm) => {
    try {
      const o = { logger: () => {}, tessedit_pageseg_mode: psm }
      if (wl) o.tessedit_char_whitelist = wl
      const r = await T.recognize(img, 'eng', o)
      return String(r?.data?.text || '').replace(/\s+/g, '')
    } catch { return '' }
  }
  const syms = []
  for (let i = 0; i < parts.length; i++) {
    const isOp = parts.length === 3 && i === 1
    if (isOp) {
      const t = (await readOne(parts[i], '+-*/x', '10')) || (await readOne(parts[i], '', '10'))
      const op = charToOperator(t.charAt(0)) ?? '+'
      console.log(`      [${i}] \u0639\u0645\u0644\u06af\u0631: "${t}" \u21d2 ${op}`)
      syms.push(op)
    } else {
      let t = await readOne(parts[i], '0123456789', '10')
      let d = charToDigit(t.charAt(0))
      if (d === null) { t = await readOne(parts[i], '', '10'); d = charToDigit(t.charAt(0)) }
      if (d === null) { t = await readOne(parts[i], '0123456789', '8'); d = charToDigit(t.charAt(0)) }
      console.log(`      [${i}] \u0631\u0642\u0645: "${t}" \u21d2 ${d ?? '\u2014'}`)
      if (d === null) return null
      syms.push(d)
    }
  }
  const expr = syms.length === 2 ? `${syms[0]}+${syms[1]}` : syms.join('')
  const ans = solveMath(expr)
  if (ans === null) return null
  return { answer: ans, raw: expr, method: `perchar(${parts.length})` }
}


// ---------- template matching (Persian digits) ----------
async function classifyTemplate(page) {
  return page.evaluate((sel) => {
    const img = document.querySelector(sel)
    if (!img) return { error: 'no-image' }
    if (!img.complete || (img.naturalWidth||0) < 8) return { error: 'not-loaded' }
    const w = img.naturalWidth, h = img.naturalHeight
    const c = document.createElement('canvas'); c.width=w; c.height=h
    const ctx = c.getContext('2d'); if (!ctx) return { error:'no-ctx' }
    ctx.drawImage(img, 0, 0)
    let data
    try { data = ctx.getImageData(0,0,w,h).data } catch { return { error:'tainted' } }
    const ink=[]; let cnt=0
    for (let y=0;y<h;y++){ const r=[]
      for (let x=0;x<w;x++){ const i=(y*w+x)*4
        const a=data[i+3], g=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]
        const v=(a>40&&g<160)?1:0; r.push(v); cnt+=v }
      ink.push(r) }
    if (cnt < 15) return { error:'empty' }
    const colHas=[]
    for (let x=0;x<w;x++){ let hs=false; for(let y=0;y<h;y++){if(ink[y][x]){hs=true;break}} colHas.push(hs) }
    const boxes=[]; let st=-1
    for (let x=0;x<=w;x++){ const on = x<w?colHas[x]:false
      if(on&&st===-1) st=x
      else if(!on&&st!==-1){ if(x-st>=2){ let y0=h,y1=-1
          for(let y=0;y<h;y++){ for(let xx=st;xx<x;xx++){ if(ink[y][xx]){ if(y<y0)y0=y; if(y>y1)y1=y; break } } }
          if(y1>=y0) boxes.push({x0:st,x1:x,y0,y1}) } st=-1 } }
    if (boxes.length<2||boxes.length>5) return { error:'boxes='+boxes.length }
    const N=24
    const gridOf=(m,x0,x1,y0,y1)=>{ const bw=x1-x0,bh=y1-y0+1,out=new Array(N*N).fill(0)
      for(let gy=0;gy<N;gy++){ for(let gx=0;gx<N;gx++){
        const sx0=x0+Math.floor(gx*bw/N), sx1=x0+Math.max(Math.floor((gx+1)*bw/N),Math.floor(gx*bw/N)+1)
        const sy0=y0+Math.floor(gy*bh/N), sy1=y0+Math.max(Math.floor((gy+1)*bh/N),Math.floor(gy*bh/N)+1)
        let on=0,tot=0
        for(let y=sy0;y<sy1&&y<=y1;y++){ for(let x=sx0;x<sx1&&x<x1;x++){ on+=m[y][x]; tot++ } }
        out[gy*N+gx]= tot>0 && on/tot>0.35 ? 1:0 } }
      return out }
    const FONTS=['Tahoma','Arial','Segoe UI','Times New Roman','Courier New','Vazirmatn','IRANSans','B Nazanin','Nazanin','sans-serif','serif']
    const D=['\u06F0','\u06F1','\u06F2','\u06F3','\u06F4','\u06F5','\u06F6','\u06F7','\u06F8','\u06F9']
    const OPS=[['+','+'],['-','-'],['\u00D7','*'],['\u00F7','/']]
    const render=(ch,font)=>{ const S=96
      const rc=document.createElement('canvas'); rc.width=S; rc.height=S
      const rx=rc.getContext('2d'); if(!rx) return null
      rx.fillStyle='#fff'; rx.fillRect(0,0,S,S); rx.fillStyle='#000'
      rx.font=Math.floor(S*0.66)+'px "'+font+'"'; rx.textAlign='center'; rx.textBaseline='middle'
      rx.fillText(ch,S/2,S/2)
      let d; try{ d=rx.getImageData(0,0,S,S).data }catch{ return null }
      const m=[]; let x0=S,x1=-1,y0=S,y1=-1,n=0
      for(let y=0;y<S;y++){ const r=[]
        for(let x=0;x<S;x++){ const i=(y*S+x)*4; const v=d[i]<140?1:0; r.push(v)
          if(v){n++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y} }
        m.push(r) }
      if(n<8||x1<x0) return null
      return gridOf(m,x0,x1+1,y0,y1) }
    const rd=[],ro=[]
    for(const f of FONTS){ for(let i=0;i<10;i++){ const g=render(D[i],f); if(g) rd.push({v:String(i),g}) }
      for(const [ch,v] of OPS){ const g=render(ch,f); if(g) ro.push({v,g}) } }
    if(!rd.length) return { error:'no-refs' }
    const iou=(a,b)=>{ let I=0,U=0; for(let i=0;i<a.length;i++){ if(a[i]&&b[i])I++; if(a[i]||b[i])U++ } return U?I/U:0 }
    const best=(g,refs)=>{ const sc=new Map()
      for(const r of refs){ const s=iou(g,r.g); if(s>(sc.get(r.v)??0)) sc.set(r.v,s) }
      const so=[...sc.entries()].sort((p,q)=>q[1]-p[1])
      return { value: so[0]?.[0]??'', score: so[0]?.[1]??0 } }
    const syms=[]
    for(let i=0;i<boxes.length;i++){ const b=boxes[i]
      const g=gridOf(ink,b.x0,b.x1,b.y0,b.y1)
      const isOp = boxes.length===3 && i===1
      const r = best(g, isOp?ro:rd)
      syms.push({ kind:isOp?'op':'digit', value:r.value, score:r.score }) }
    return { symbols:syms, expr:syms.map(s=>s.value).join(''), boxes:boxes.length }
  }, IMG_SEL).catch(e => ({ error: String(e).slice(0,60) }))
}


// ---------- IP block resilience ----------
const BLOCK_RE = /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_SOCKET_NOT_CONNECTED/
const isBlock = (e) => BLOCK_RE.test(String(e && e.message || e))
const fmtT = (sec) => { const m = Math.floor(sec/60), s = sec%60; return m>0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s` }

async function probe(page, url) {
  try { const r = await page.request.get(url, { timeout: 12000, maxRedirects: 3 }); return r.status() > 0 }
  catch { return false }
}

async function waitBackOnline(page, url, maxWaitMs, probeMs = 15000) {
  const t0 = Date.now()
  console.log(`   \u23f3 \u0635\u0628\u0631 \u062a\u0627 \u0628\u0631\u06af\u0634\u062a\u0646 \u0633\u0627\u06cc\u062a (\u062d\u062f\u0627\u06a9\u062b\u0631 ${fmtT(Math.round(maxWaitMs/1000))}) \u2014 \u0647\u0631 ${Math.round(probeMs/1000)}s \u0628\u0631\u0631\u0633\u06cc`)
  let lastRep = 0
  while (Date.now() - t0 < maxWaitMs) {
    await new Promise(r => setTimeout(r, probeMs))
    if (await probe(page, url)) {
      console.log(`   \u2705 \u0633\u0627\u06cc\u062a \u0628\u0631\u06af\u0634\u062a (\u067e\u0633 \u0627\u0632 ${fmtT(Math.round((Date.now()-t0)/1000))})`)
      return true
    }
    const el = Math.round((Date.now()-t0)/1000)
    if (el - lastRep >= 60) { lastRep = el; console.log(`      ... ${fmtT(el)} \u06af\u0630\u0634\u062a\u0647\u060c \u0647\u0646\u0648\u0632 \u0628\u0644\u0627\u06a9`) }
  }
  return false
}

async function gotoResilient(page, url, label, maxAttempts = 20) {
  for (let a = 1; a <= maxAttempts; a++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (a > 1) console.log(`   \u2705 ${label} \u062f\u0631 \u062a\u0644\u0627\u0634 ${a}/${maxAttempts}`)
      return true
    } catch (e) {
      if (isBlock(e)) {
        console.log(`   \u26a0 IP \u0628\u0644\u0627\u06a9 (${a}/${maxAttempts}) \u2014 ${label}`)
        if (a === maxAttempts) return false
        await waitBackOnline(page, url, 180000 + Math.random()*120000)
      } else {
        console.log('   \u2716 ' + String(e.message).split('\n')[0].slice(0,110))
        if (a === maxAttempts) return false
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  }
  return false
}

async function getCreds() {
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
}

async function main() {
  ensure(OUT)
  let username = process.argv[2], password = process.argv[3]
  if (!username || !password) {
    const c = await getCreds()
    if (!c) { console.error('❌ حسابی یافت نشد'); process.exit(1) }
    username = c.username; password = c.password
    console.log(`حساب: ${c.name} (${username})`)
  }

  const { chromium } = require('playwright')
  const browser = await chromium.launch({
    headless: false, channel: 'chrome',
    args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({ viewport: null, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  const page = await ctx.newPage()

  console.log('\n→ باز کردن صفحه ورود...')
  const navOk = await gotoResilient(page, LOGIN_URL, '\u0635\u0641\u062d\u0647 \u0648\u0631\u0648\u062f', 20)
  if (!navOk) { console.log('\n\u274c \u0627\u062a\u0635\u0627\u0644 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062f'); await browser.close(); return }
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const l = document.getElementById('loading'); if (l) l.remove() }).catch(() => {})

  await (await page.$('#NationalCode, input[name="NationalCode"]'))?.fill(username)
  await (await page.$('#user-password, input[type="password"]'))?.fill(password)
  console.log('   کد ملی و رمز وارد شد')

  const T = (() => { try { return require('tesseract.js') } catch { return null } })()
  const MAX = 6
  let ok = false

  for (let att = 1; att <= MAX; att++) {
    console.log(`\n═══ تلاش ${att}/${MAX} ═══`)
    await waitImage(page)

    let answer = null, raw = '', method = ''

    // ۱) DOM
    const domCands = await readFromDom(page)
    for (const c of domCands) {
      if (/^captcha$/i.test(c)) continue
      const a = solveMath(c)
      if (a !== null && /[\d\u06F0-\u06F9\u0660-\u0669]/.test(c)) {
        answer = a; raw = c; method = 'DOM'; break
      }
    }
    if (answer !== null) console.log(`   ✔ از DOM خوانده شد: "${raw}" ⇒ ${answer}`)

    // ۲) تطبیق الگو (بهترین روش برای ارقام فارسی)
    const tpl = await classifyTemplate(page)
    if (tpl && tpl.error) {
      console.log(`   \u2716 \u062a\u0635\u0648\u06cc\u0631: ${tpl.error}`)
      if (tpl.error === 'not-loaded' || tpl.error === 'empty' || tpl.error === 'no-image') {
        console.log('   \u21bb \u0631\u0641\u0631\u0634 \u06a9\u0627\u0645\u0644 \u0635\u0641\u062d\u0647...')
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.waitForTimeout(2500)
        await page.evaluate(() => { const l = document.getElementById('loading'); if (l) l.remove() }).catch(() => {})
        await (await page.$('#NationalCode, input[name="NationalCode"]'))?.fill(username).catch(() => {})
        await (await page.$('#user-password, input[type="password"]'))?.fill(password).catch(() => {})
        continue
      }
    }
    if (tpl && tpl.symbols) {
      const detail = tpl.symbols.map(s => `${s.value}(${s.score.toFixed(2)})`).join(' ')
      const minS = Math.min(...tpl.symbols.map(s => s.score))
      const a = solveMath(tpl.expr)
      console.log(`   \u25c8 \u0627\u0644\u06af\u0648: ${tpl.expr} [${detail}] \u21d2 ${a ?? '\u2014'}`)
      if (a !== null && minS >= 0.42) { answer = a; raw = tpl.expr; method = 'template' }
    }

    // ۳) OCR نماد به نماد
    if (answer === null && T) {
      const pc = await ocrPerChar(page, T, att)
      if (pc) { answer = pc.answer; raw = pc.raw; method = pc.method
        console.log(`   \u2714 \u0646\u0645\u0627\u062f\u0628\u0647\u0646\u0645\u0627\u062f: ${raw} \u21d2 ${answer}`) }
    }

    // ۳) OCR کل تصویر (پشتیبان)
    if (answer === null && T) {
      const srcs = []
      const p5 = await preprocess(page, 5, 150); if (p5) srcs.push([p5, 'canvas5x'])
      const p4 = await preprocess(page, 4, 190); if (p4) srcs.push([p4, 'canvas4x'])
      const el = await page.$(IMG_SEL); if (el) srcs.push([await el.screenshot(), 'raw'])

      if (srcs[0]) {
        try { fs.writeFileSync(path.join(OUT, `pre-${att}.png`), Buffer.from(String(srcs[0][0]).split(',')[1] || '', 'base64')) } catch {}
      }

      outer:
      for (const [img, tag] of srcs) {
        for (const cfg of [
          { psm: '7', wl: '0123456789+-*/=' }, { psm: '8', wl: '0123456789+-*/=' },
          { psm: '7', wl: '' }, { psm: '6', wl: '' },
        ]) {
          try {
            const o = { tessedit_pageseg_mode: cfg.psm }
            if (cfg.wl) o.tessedit_char_whitelist = cfg.wl
            const r = await T.recognize(img, 'eng', { logger: () => {}, ...o })
            const txt = String(r?.data?.text || '').trim()
            if (!txt) continue
            let a = solveMath(txt)
            if (a === null) a = solveMath(fixConfusions(txt))
            console.log(`   ${tag}/psm${cfg.psm}: "${txt.replace(/\n/g, ' ')}" ⇒ ${a ?? '—'}`)
            if (a !== null) { answer = a; raw = txt; method = `OCR:${tag}/psm${cfg.psm}`; break outer }
          } catch {}
        }
      }
    }

    if (answer === null) {
      console.log('   ✖ خوانده نشد → تصویر تازه')
      const rb = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh" i]')
      if (rb) await rb.click().catch(() => {})
      await page.waitForTimeout(1200)
      continue
    }

    // نوشتن در فیلد + تأیید
    const inp = await page.$(INP_SEL)
    if (!inp) { console.log('   ✖ فیلد کپچا پیدا نشد'); break }
    await inp.click({ clickCount: 3 }).catch(() => {})
    await inp.fill('')
    await inp.type(answer, { delay: 110 })

    const actual = await page.evaluate((s) => document.querySelector(s)?.value || '', INP_SEL)
    console.log(`   نوشته شد؟ فیلد = "${actual}" (انتظار: ${answer}) → ${normalizeDigits(actual) === answer ? '✅' : '❌'}`)

    if (normalizeDigits(actual) !== answer) {
      await page.evaluate(({ s, v }) => {
        const el = document.querySelector(s)
        if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
      }, { s: INP_SEL, v: answer })
    }

    await page.waitForTimeout(800)
    await (await page.$('#inter, button[type="submit"]'))?.click()
    await page.waitForTimeout(4500)

    if (!page.url().includes('Login')) { ok = true; console.log('\n   🎉 ورود موفق!'); break }

    let msg = ''
    try {
      const e = await page.$('.alert-danger, .text-danger, .validation-summary-errors, [role="alert"]')
      if (e) msg = ((await e.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 160)
    } catch {}
    console.log(`   ✖ ورود نشد${msg ? ' — ' + msg : ''}`)

    const rb = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh" i]')
    if (rb) await rb.click().catch(() => {})
    await page.waitForTimeout(1200)
    await (await page.$('#NationalCode, input[name="NationalCode"]'))?.fill(username).catch(() => {})
    await (await page.$('#user-password, input[type="password"]'))?.fill(password).catch(() => {})
  }

  if (ok) {
    console.log('\n→ رفتن به صفحه عملیات...')
    const tOk = await gotoResilient(page, TARGET_URL, '\u0635\u0641\u062d\u0647 \u0639\u0645\u0644\u06cc\u0627\u062a', 20)
    if (!tOk) { console.log('   \u274c \u0635\u0641\u062d\u0647 \u0639\u0645\u0644\u06cc\u0627\u062a \u0628\u0627\u0632 \u0646\u0634\u062f'); await page.waitForTimeout(60000); await browser.close(); return }
    await page.waitForTimeout(2500)
    await page.evaluate(() => { const l = document.getElementById('loading'); if (l) l.remove() }).catch(() => {})
    console.log('   URL: ' + page.url())
    ensure(path.join(process.cwd(), 'diagnostics'))
    await page.screenshot({ path: path.join(process.cwd(), 'diagnostics', 'target-page.png'), fullPage: true })
    fs.writeFileSync(path.join(process.cwd(), 'diagnostics', 'target-page.html'), await page.content(), 'utf-8')
    console.log('   📁 diagnostics/target-page.{png,html} ذخیره شد')
  } else {
    console.log('\n❌ ناموفق — عکس‌ها در diagnostics/captcha/')
  }

  console.log('\nمرورگر ۲ دقیقه باز می‌ماند...')
  await page.waitForTimeout(120000).catch(() => {})
  await browser.close().catch(() => {})
}

main().catch((e) => { console.error('خطا:', e.message); process.exit(1) })
