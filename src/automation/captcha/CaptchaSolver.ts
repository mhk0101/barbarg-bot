import type { Page } from 'playwright'
import { browserManager } from '../browser/BrowserManager'

export interface CaptchaResult {
  text: string
  confidence: number
  needsManualReview: boolean
  screenshotPath?: string
  /** عبارت خامی که خوانده شد (برای لاگ) */
  raw?: string
  /** با کدام روش حل شد: dom | ocr | ocr-fuzzy */
  method?: string
}

const IMG_SELECTOR = '#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i], img[src*="Captcha"]'
const INPUT_SELECTOR = '#DNTCaptchaInputText, input[name="DNTCaptchaInputText"]'
const REFRESH_SELECTOR = '#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh" i], [id*="efresh" i]'

/* ------------------------------------------------------------------ */
/*  ابزار ارقام                                                        */
/* ------------------------------------------------------------------ */

/** ارقام فارسی (۰-۹ / U+06F0) و عربی (٠-٩ / U+0660) را به لاتین تبدیل می‌کند */
export function normalizeDigits(input: string): string {
  return String(input)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/**
 * اشتباهات رایج OCR انگلیسی روی ارقام فارسی را اصلاح می‌کند.
 * مبنا: شکل ظاهری ارقام فارسی در فونت‌های رایج DNTCaptcha
 *   ۰ = نقطه/دایره کوچک  → o . , ° ) ( ' " *
 *   ۱ = خط عمودی         → i l | ! 1
 *   ۲ = شبیه Y برعکس     → Y y r v
 *   ۴ = شبیه f/۴         → f F
 *   ۵ = شبیه o توپر      → a e s S
 *   ۶ = شبیه 1 با دم     → G g b
 *   ۷ = شبیه V           → V v Y
 *   ۸ = شبیه A           → A ^
 *   ۹ = شبیه q/9         → q Q p
 */
function fixOcrConfusions(input: string): string {
  return String(input)
    .replace(/[oO°ºØø.,'"`)(]/g, '0')
    .replace(/[iIl|!\]\[}{]/g, '1')
    .replace(/[YyVv]/g, '7')
    .replace(/[SsAa]/g, '5')
    .replace(/[Zz]/g, '2')
    .replace(/[Bb]/g, '8')
    .replace(/[Gg]/g, '6')
    .replace(/[Tt]/g, '1')
    .replace(/[Ff]/g, '4')
    .replace(/[qQ]/g, '9')
    .replace(/[—–_~]/g, '-')
    .replace(/[xX]/g, '*')
}

/** فقط برای تک‌کاراکتر: نگاشت به یک رقم */
function charToDigit(ch: string): string | null {
  const c = normalizeDigits(ch).trim()
  if (/^\d$/.test(c)) return c
  const map: Record<string, string> = {
    o: '0', O: '0', '°': '0', 'º': '0', '.': '0', ',': '0', ')': '0', '(': '0',
    "'": '0', '"': '0', '*': '0', '·': '0', '•': '0', 'Ø': '0', 'ø': '0', 'e': '0',
    i: '1', I: '1', l: '1', '|': '1', '!': '1', ']': '1', '[': '1', 'j': '1', 'r': '1',
    Y: '7', y: '7', V: '7', v: '7', 'u': '7',
    S: '5', s: '5', A: '5', a: '5',
    Z: '2', z: '2',
    B: '8', b: '8',
    G: '6', g: '6',
    T: '1', t: '1',
    F: '4', f: '4',
    q: '9', Q: '9', p: '9', P: '9',
    L: '4', '<': '4', '>': '4',
    m: '3', w: '3', W: '3', M: '3', n: '3',
    d: '6', D: '6',
    c: '0', C: '0',
    h: '4', H: '4',
    k: '4', K: '4',
    x: '3', X: '3',
  }
  return map[c] ?? null
}

/** فقط برای تک‌کاراکتر: نگاشت به یک عملگر */
function charToOperator(ch: string): string | null {
  const c = String(ch).trim()
  if (/^[+\-*/]$/.test(c)) return c
  const map: Record<string, string> = {
    't': '+', 'T': '+', '†': '+', '‡': '+', '4': '+', '#': '+',
    '×': '*', 'x': '*', 'X': '*',
    '÷': '/', '\\': '/',
    '—': '-', '–': '-', '_': '-', '~': '-', '=': '-',
  }
  return map[c] ?? null
}

/**
 * عبارت ریاضی را از یک متن نویزی پیدا و حل می‌کند.
 * ارقام فارسی/عربی پشتیبانی می‌شوند. اگر عبارتی نبود ولی متن
 * فقط یک عدد بود، همان عدد برگردانده می‌شود (بعضی کپچاها فقط عددند).
 */
export function solveMathExpression(text: string): string | null {
  const s = normalizeDigits(text).replace(/\s+/g, '')
  if (!s) return null

  // عبارت کامل: عدد عملگر عدد
  const m = s.match(/(\d{1,3})\s*([+\-*/×÷xX])\s*(\d{1,3})/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[3], 10)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    switch (m[2]) {
      case '+': return String(a + b)
      case '-': return String(a - b)
      case '*': case '×': case 'x': case 'X': return String(a * b)
      case '/': case '÷': return b !== 0 ? String(Math.round(a / b)) : null
      default: return null
    }
  }

  // اگر عملگری هست ولی یکی از دو طرف خوانده نشده، نتیجه غیرقابل‌اعتماد است.
  // بهتر است null برگردانیم تا کپچای تازه گرفته شود، به‌جای ارسال پاسخ اشتباه.
  if (/[+\-*/×÷]/.test(s)) {
    const digits = s.match(/\d/g)
    if (!digits || digits.length < 2) return null
  }

  // فقط یک عدد و هیچ عملگری (بعضی کپچاها فقط عددند)
  const only = s.match(/^\D*(\d{1,6})\D*$/)
  if (only) return only[1]

  return null
}

/* ------------------------------------------------------------------ */
/*  حل‌کننده                                                            */
/* ------------------------------------------------------------------ */

export class CaptchaSolver {
  /**
   * ۱) تلاش بدون OCR: خواندن عبارت از خود DOM
   * بعضی پیکربندی‌های DNTCaptcha عبارت را در alt/title/aria-label
   * یا در یک عنصر متنی کنار تصویر قرار می‌دهند.
   */
  private async extractFromDom(page: Page): Promise<string | null> {
    try {
      const candidates: string[] = await page.evaluate((sel) => {
        const out: string[] = []
        const push = (v?: string | null) => { if (v && v.trim()) out.push(v.trim()) }

        const img = document.querySelector(sel) as HTMLImageElement | null
        if (img) {
          push(img.getAttribute('alt'))
          push(img.getAttribute('title'))
          push(img.getAttribute('aria-label'))
          push(img.getAttribute('data-text'))
          // متن والدها (تا ۳ سطح) — گاهی عبارت به‌صورت متن رندر می‌شود
          let p: HTMLElement | null = img.parentElement
          for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
            const t = (p.innerText || '').trim()
            if (t && t.length < 40) push(t)
          }
        }

        // هر عنصری با متن کوتاه که شبیه عبارت ریاضی است
        document.querySelectorAll('label,span,div,p,td').forEach((el) => {
          const t = ((el as HTMLElement).innerText || '').trim()
          if (t && t.length <= 20 && /[\d\u06F0-\u06F9\u0660-\u0669]\s*[+\-*/×÷]\s*[\d\u06F0-\u06F9\u0660-\u0669]/.test(t)) {
            out.push(t)
          }
        })

        return out
      }, IMG_SELECTOR)

      for (const c of candidates) {
        // «captcha» خالی را نادیده بگیر
        if (/^captcha$/i.test(c)) continue
        const ans = solveMathExpression(c)
        if (ans !== null && /[\d\u06F0-\u06F9\u0660-\u0669]/.test(c)) return c
      }
    } catch { /* ignore */ }
    return null
  }

  /**
   * تصویر کپچا را در خود مرورگر پیش‌پردازش می‌کند:
   * بزرگ‌نمایی ۵ برابر + سیاه‌وسفید + آستانه‌گذاری.
   * خروجی یک dataURL است که دقت OCR را به‌شدت بالا می‌برد.
   */
  private async preprocessImage(page: Page, scale = 5, threshold = 150): Promise<string | null> {
    try {
      return await page.evaluate(
        ({ sel, scale, threshold }) => {
          const img = document.querySelector(sel) as HTMLImageElement | null
          if (!img) return null
          const w = img.naturalWidth || img.width
          const h = img.naturalHeight || img.height
          if (!w || !h) return null

          const c = document.createElement('canvas')
          c.width = w * scale
          c.height = h * scale
          const ctx = c.getContext('2d')
          if (!ctx) return null

          ctx.imageSmoothingEnabled = false
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, c.width, c.height)
          ctx.drawImage(img, 0, 0, c.width, c.height)

          try {
            const d = ctx.getImageData(0, 0, c.width, c.height)
            const px = d.data
            for (let i = 0; i < px.length; i += 4) {
              const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
              const v = g < threshold ? 0 : 255
              px[i] = px[i + 1] = px[i + 2] = v
              px[i + 3] = 255
            }
            ctx.putImageData(d, 0, 0)
          } catch { /* tainted canvas — بدون آستانه ادامه بده */ }

          return c.toDataURL('image/png')
        },
        { sel: IMG_SELECTOR, scale, threshold },
      )
    } catch { return null }
  }

  /** صبر می‌کند تا تصویر کپچا واقعاً بارگذاری شود */
  async waitForImage(page: Page, timeoutMs = 12000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await page.evaluate((sel) => {
          const im = document.querySelector(sel) as HTMLImageElement | null
          return !!(im && im.complete && im.naturalWidth > 8)
        }, IMG_SELECTOR)
        if (ok) { await page.waitForTimeout(250); return true }
      } catch { /* ignore */ }
      await page.waitForTimeout(300)
    }
    return false
  }

  /**
   * تصویر را به «قطعه‌های متصل» (کاراکترها) می‌شکند و مختصات هرکدام را برمی‌گرداند.
   * چون کپچا معمولاً ۳ نماد دارد (رقم، عملگر، رقم)، خواندن جداگانه‌ی هر نماد
   * بسیار دقیق‌تر از خواندن کل تصویر است.
   */
  private async segmentCharacters(page: Page, scale = 8): Promise<string[] | null> {
    try {
      return await page.evaluate(
        ({ sel, scale }) => {
          const img = document.querySelector(sel) as HTMLImageElement | null
          if (!img) return null
          const w = img.naturalWidth || img.width
          const h = img.naturalHeight || img.height
          if (!w || !h) return null

          const c = document.createElement('canvas')
          c.width = w; c.height = h
          const ctx = c.getContext('2d')
          if (!ctx) return null
          ctx.drawImage(img, 0, 0)

          let px: Uint8ClampedArray
          try {
            px = ctx.getImageData(0, 0, w, h).data
          } catch { return null }

          // ستون‌هایی که پیکسل تیره دارند
          const dark: boolean[] = []
          for (let x = 0; x < w; x++) {
            let has = false
            for (let y = 0; y < h; y++) {
              const i = (y * w + x) * 4
              const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
              if (g < 160 && px[i + 3] > 40) { has = true; break }
            }
            dark.push(has)
          }

          // گروه‌بندی ستون‌های پیوسته
          const groups: Array<{ x0: number; x1: number }> = []
          let start = -1
          for (let x = 0; x < w; x++) {
            if (dark[x] && start === -1) start = x
            else if (!dark[x] && start !== -1) {
              if (x - start >= 2) groups.push({ x0: start, x1: x })
              start = -1
            }
          }
          if (start !== -1 && w - start >= 2) groups.push({ x0: start, x1: w })

          if (groups.length < 2 || groups.length > 6) return null

          // برای هر گروه، محدوده‌ی عمودی را هم پیدا کن و بزرگ‌نمایی کن
          const out: string[] = []
          for (const g of groups) {
            let y0 = h, y1 = 0
            for (let y = 0; y < h; y++) {
              for (let x = g.x0; x < g.x1; x++) {
                const i = (y * w + x) * 4
                const gr = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
                if (gr < 160 && px[i + 3] > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; break }
              }
            }
            if (y1 <= y0) continue

            const cw = g.x1 - g.x0
            const ch = y1 - y0 + 1
            const pad = 8
            const oc = document.createElement('canvas')
            oc.width = cw * scale + pad * 2
            oc.height = ch * scale + pad * 2
            const octx = oc.getContext('2d')
            if (!octx) continue
            octx.imageSmoothingEnabled = false
            octx.fillStyle = '#ffffff'
            octx.fillRect(0, 0, oc.width, oc.height)
            octx.drawImage(img, g.x0, y0, cw, ch, pad, pad, cw * scale, ch * scale)

            // آستانه‌گذاری
            try {
              const d = octx.getImageData(0, 0, oc.width, oc.height)
              const p2 = d.data
              for (let i = 0; i < p2.length; i += 4) {
                const gr = 0.299 * p2[i] + 0.587 * p2[i + 1] + 0.114 * p2[i + 2]
                const v = gr < 160 ? 0 : 255
                p2[i] = p2[i + 1] = p2[i + 2] = v
                p2[i + 3] = 255
              }
              octx.putImageData(d, 0, 0)
            } catch { /* ignore */ }

            out.push(oc.toDataURL('image/png'))
          }

          return out.length >= 2 ? out : null
        },
        { sel: IMG_SELECTOR, scale },
      )
    } catch { return null }
  }

  /**
   * خواندن نماد به نماد. برای هر قطعه، OCR را با whitelist مخصوص
   * (رقم یا عملگر) اجرا می‌کند — این کار خطای تشخیص را به‌شدت کم می‌کند.
   */
  private async ocrPerCharacter(page: Page): Promise<{ raw: string; answer: string | null; method: string } | null> {
    let T: { recognize: (...a: unknown[]) => Promise<{ data: { text: string } }> }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      T = require('tesseract.js')
    } catch { return null }

    const parts = await this.segmentCharacters(page)
    if (!parts || parts.length < 2) return null

    const readOne = async (img: string, wl: string, psm: string): Promise<string> => {
      try {
        const r = await T.recognize(img, 'eng', {
          logger: () => {},
          tessedit_pageseg_mode: psm,
          tessedit_char_whitelist: wl,
        } as unknown as Record<string, unknown>)
        return String(r?.data?.text ?? '').replace(/\s+/g, '')
      } catch { return '' }
    }

    const symbols: string[] = []

    for (let i = 0; i < parts.length; i++) {
      const isOperator = parts.length === 3 && i === 1
      const img = parts[i]

      if (isOperator) {
        // عملگر: معمولاً + است
        const t = (await readOne(img, '+-*/x', '10')) || (await readOne(img, '', '10'))
        symbols.push(charToOperator(t.charAt(0)) ?? '+')
      } else {
        // رقم: psm 10 = تک‌کاراکتر
        let t = await readOne(img, '0123456789', '10')
        let d = charToDigit(t.charAt(0))
        if (d === null) {
          t = await readOne(img, '', '10')
          d = charToDigit(t.charAt(0))
        }
        if (d === null) {
          t = await readOne(img, '0123456789', '8')
          d = charToDigit(t.charAt(0))
        }
        if (d === null) return null
        symbols.push(d)
      }
    }

    // اگر فقط دو نماد خوانده شد (عملگر گم شده)، فرض بر جمع
    let expr: string
    if (symbols.length === 3) expr = symbols.join('')
    else if (symbols.length === 2) expr = `${symbols[0]}+${symbols[1]}`
    else expr = symbols.join('')

    const answer = solveMathExpression(expr)
    if (answer === null) return null

    return { raw: `${expr} (${parts.length} نماد)`, answer, method: `ocr-perchar(${parts.length})` }
  }

  /** OCR روی تصویر پیش‌پردازش‌شده با چند تنظیم مختلف */
  private async ocrRead(page: Page): Promise<{ raw: string; answer: string | null; method: string }> {
    let Tesseract: unknown
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Tesseract = require('tesseract.js')
    } catch {
      return { raw: '', answer: null, method: 'no-tesseract' }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const T = Tesseract as any

    const sources: Array<{ img: string | Buffer; tag: string }> = []

    const pre = await this.preprocessImage(page, 5, 150)
    if (pre) sources.push({ img: pre, tag: 'canvas-5x' })

    const pre2 = await this.preprocessImage(page, 4, 190)
    if (pre2) sources.push({ img: pre2, tag: 'canvas-4x-thr190' })

    try {
      const el = await page.$(IMG_SELECTOR)
      if (el) sources.push({ img: await el.screenshot(), tag: 'raw-shot' })
    } catch { /* ignore */ }

    const configs = [
      { psm: '7', wl: '0123456789+-*/=' },
      { psm: '8', wl: '0123456789+-*/=' },
      { psm: '7', wl: '' },
      { psm: '6', wl: '' },
    ]

    let bestRaw = ''

    for (const src of sources) {
      for (const cfg of configs) {
        try {
          const opts: Record<string, string> = { tessedit_pageseg_mode: cfg.psm }
          if (cfg.wl) opts.tessedit_char_whitelist = cfg.wl
          const r = await T.recognize(src.img, 'eng', { logger: () => {}, ...opts })
          const raw = String(r?.data?.text ?? '').trim()
          if (raw && !bestRaw) bestRaw = raw

          // ۱) مستقیم
          const direct = solveMathExpression(raw)
          if (direct !== null) return { raw, answer: direct, method: `ocr:${src.tag}/psm${cfg.psm}` }

          // ۲) با اصلاح اشتباهات رایج OCR
          const fixed = fixOcrConfusions(raw)
          const fuzzy = solveMathExpression(fixed)
          if (fuzzy !== null) {
            return { raw: `${raw} → ${fixed}`, answer: fuzzy, method: `ocr-fuzzy:${src.tag}/psm${cfg.psm}` }
          }
        } catch { /* تنظیم بعدی */ }
      }
    }

    return { raw: bestRaw, answer: null, method: 'ocr-failed' }
  }

  /**
   * کپچا را می‌خواند و پاسخ را برمی‌گرداند (بدون پر کردن فیلد).
   */
  async solveCaptcha(page: Page): Promise<CaptchaResult> {
    try {
      const img = await page.$(IMG_SELECTOR)
      if (!img) return { text: '', confidence: 0, needsManualReview: true, method: 'no-image' }

      await this.waitForImage(page)

      // مرحله ۱ — بدون OCR
      const domText = await this.extractFromDom(page)
      if (domText) {
        const ans = solveMathExpression(domText)
        if (ans !== null) {
          return { text: ans, confidence: 100, needsManualReview: false, raw: domText, method: 'dom' }
        }
      }

      // مرحله ۲ — OCR نماد به نماد (دقیق‌ترین روش برای ارقام فارسی)
      const perChar = await this.ocrPerCharacter(page)
      if (perChar?.answer != null) {
        return {
          text: perChar.answer,
          confidence: 95,
          needsManualReview: false,
          raw: perChar.raw,
          method: perChar.method,
        }
      }

      // مرحله ۳ — OCR کل تصویر (روش پشتیبان)
      const { raw, answer, method } = await this.ocrRead(page)
      if (answer !== null) {
        return {
          text: answer,
          confidence: method.startsWith('ocr-fuzzy') ? 60 : 90,
          needsManualReview: false,
          raw,
          method,
        }
      }

      return { text: '', confidence: 0, needsManualReview: true, raw, method }
    } catch (e) {
      return {
        text: '', confidence: 0, needsManualReview: true,
        raw: e instanceof Error ? e.message : 'error', method: 'exception',
      }
    }
  }

  /**
   * کپچا را حل می‌کند **و مقدار را داخل فیلد می‌نویسد** و تأیید می‌کند
   * که واقعاً نوشته شده است. این همان چیزی است که قبلاً انجام نمی‌شد.
   */
  async solveAndFill(
    page: Page,
    opts?: { onLog?: (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void | Promise<void> },
  ): Promise<{ filled: boolean; answer: string; result: CaptchaResult }> {
    const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
      try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
    }

    const result = await this.solveCaptcha(page)

    if (result.needsManualReview || !result.text) {
      await log(`کپچا خوانده نشد (روش: ${result.method}${result.raw ? ` | خام: "${String(result.raw).replace(/\n/g, ' ')}"` : ''})`, 'warn')
      return { filled: false, answer: '', result }
    }

    await log(`کپچا خوانده شد: "${String(result.raw ?? '').replace(/\n/g, ' ')}" ⇒ ${result.text}  [${result.method}]`, 'success')

    const input = await page.$(INPUT_SELECTOR)
    if (!input) {
      await log('فیلد ورودی کپچا پیدا نشد', 'error')
      return { filled: false, answer: result.text, result }
    }

    // پاک کردن و تایپ انسانی
    try {
      await input.click({ clickCount: 3 }).catch(() => {})
      await input.fill('')
      await page.waitForTimeout(120 + Math.random() * 200)
      await input.type(result.text, { delay: 90 + Math.random() * 110 })
    } catch {
      try { await input.fill(result.text) } catch { /* ignore */ }
    }

    // تأیید اینکه مقدار واقعاً داخل فیلد نشسته است
    let actual = ''
    try {
      actual = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null
        return el ? el.value : ''
      }, INPUT_SELECTOR)
    } catch { /* ignore */ }

    if (normalizeDigits(actual).trim() !== result.text) {
      await log(`مقدار در فیلد ننشست (انتظار: ${result.text} / واقعی: "${actual}") — تلاش با روش جایگزین`, 'warn')
      try {
        await page.evaluate(
          ({ sel, val }) => {
            const el = document.querySelector(sel) as HTMLInputElement | null
            if (el) {
              el.value = val
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }
          },
          { sel: INPUT_SELECTOR, val: result.text },
        )
        actual = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null
          return el ? el.value : ''
        }, INPUT_SELECTOR)
      } catch { /* ignore */ }
    }

    const filled = normalizeDigits(actual).trim() === result.text
    await log(filled ? `عدد ${result.text} در فیلد کپچا وارد شد` : 'نوشتن در فیلد کپچا ناموفق بود', filled ? 'success' : 'error')

    return { filled, answer: result.text, result }
  }

  async getCaptchaScreenshot(page: Page): Promise<string | null> {
    try {
      const captchaImg = await page.$(IMG_SELECTOR)
      if (!captchaImg) return null
      const buffer = await captchaImg.screenshot()
      return buffer.toString('base64')
    } catch { return null }
  }

  async saveCaptchaImage(page: Page, name: string): Promise<string | null> {
    try {
      const el = await page.$(IMG_SELECTOR)
      if (!el) return null
      return await browserManager.screenshot(page, name)
    } catch { return null }
  }

  /** تصویر تازه می‌گیرد و صبر می‌کند تا کامل بارگذاری شود */
  async refreshCaptcha(page: Page): Promise<boolean> {
    try {
      const before = await page.evaluate((sel) => {
        const im = document.querySelector(sel) as HTMLImageElement | null
        return im ? im.src : ''
      }, IMG_SELECTOR)

      const refreshBtn = await page.$(REFRESH_SELECTOR)
      if (refreshBtn) {
        await refreshBtn.click().catch(() => {})
      } else {
        // اگر دکمه نبود، خود تصویر را دوباره بارگذاری کن
        await page.evaluate((sel) => {
          const im = document.querySelector(sel) as HTMLImageElement | null
          if (im) {
            const u = new URL(im.src, location.href)
            u.searchParams.set('_', String(Date.now()))
            im.src = u.toString()
          }
        }, IMG_SELECTOR).catch(() => {})
      }

      await page.waitForTimeout(900)

      // صبر تا تصویر جدید واقعاً لود شود (مهم‌ترین بخش)
      const ok = await this.waitForImage(page, 12000)

      if (ok) {
        const after = await page.evaluate((sel) => {
          const im = document.querySelector(sel) as HTMLImageElement | null
          return im ? im.src : ''
        }, IMG_SELECTOR)
        if (after === before) await page.waitForTimeout(600)
      }
      return ok
    } catch { return false }
  }
}

export const captchaSolver = new CaptchaSolver()
