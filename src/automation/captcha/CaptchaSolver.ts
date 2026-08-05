import type { Page } from 'playwright'
import { browserManager } from '../browser/BrowserManager'

export interface CaptchaResult {
  text: string
  confidence: number
  needsManualReview: boolean
  screenshotPath?: string
  raw?: string
  method?: string
  /** وضعیت تصویر: ok | not-loaded | broken | empty | no-image */
  imageState?: string
  /** یعنی صفحه باید رفرش شود (کپچا لود نشده) */
  needsReload?: boolean
}

const IMG_SELECTOR = '#dntCaptchaImg, img[alt="captcha"], img[src*="captcha" i], img[src*="Captcha"]'
const INPUT_SELECTOR = '#DNTCaptchaInputText, input[name="DNTCaptchaInputText"]'
const REFRESH_SELECTOR = '#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh" i], [id*="efresh" i]'

/* ------------------------------------------------------------------ */
/*  ابزار ارقام                                                        */
/* ------------------------------------------------------------------ */

export function normalizeDigits(input: string): string {
  return String(input)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

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

export function solveMathExpression(text: string): string | null {
  const s = normalizeDigits(text).replace(/\s+/g, '')
  if (!s) return null

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

  if (/[+\-*/×÷]/.test(s)) {
    const digits = s.match(/\d/g)
    if (!digits || digits.length < 2) return null
  }

  const only = s.match(/^\D*(\d{1,6})\D*$/)
  if (only) return only[1]

  return null
}

/* ------------------------------------------------------------------ */
/*  تطبیق الگو (Template Matching) — روش اصلی                          */
/* ------------------------------------------------------------------ */

interface SymbolMatch { kind: 'digit' | 'op'; value: string; score: number; second: number }
interface TemplateResult {
  error?: string
  symbols?: SymbolMatch[]
  expr?: string
  boxes?: number
  inkRatio?: number
}

/**
 * ارقام فارسی را با «تطبیق شکل» تشخیص می‌دهد.
 *
 * چرا این روش؟ Tesseract با داده‌ی انگلیسی آموزش دیده و ارقام فارسی را
 * اصلاً نمی‌شناسد (۴ را «2» و ۵ را «Y» می‌خواند). اینجا به‌جای OCR،
 * همان ارقام را با فونت‌های رایج روی canvas رندر می‌کنیم و شکل هر نماد
 * جداشده از تصویر را با آن‌ها مقایسه می‌کنیم (IoU). چون فونت کپچا ثابت
 * است، دقت این روش بسیار بالاتر است.
 */
async function classifyByTemplate(page: Page): Promise<TemplateResult> {
  try {
    return await page.evaluate((sel): TemplateResult => {
      const img = document.querySelector(sel) as HTMLImageElement | null
      if (!img) return { error: 'no-image' }
      if (!img.complete || (img.naturalWidth || 0) < 8 || (img.naturalHeight || 0) < 8) {
        return { error: 'not-loaded' }
      }

      const w = img.naturalWidth
      const h = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return { error: 'no-ctx' }
      ctx.drawImage(img, 0, 0)

      let data: Uint8ClampedArray
      try { data = ctx.getImageData(0, 0, w, h).data } catch { return { error: 'tainted' } }

      // --- باینری‌سازی ---
      const ink: number[][] = []
      let inkCount = 0
      for (let y = 0; y < h; y++) {
        const row: number[] = []
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const a = data[i + 3]
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          const v = (a > 40 && g < 160) ? 1 : 0
          row.push(v); inkCount += v
        }
        ink.push(row)
      }
      const inkRatio = inkCount / (w * h)
      if (inkCount < 15) return { error: 'empty', inkRatio }

      // --- جداسازی ستونی ---
      const colHas: boolean[] = []
      for (let x = 0; x < w; x++) {
        let has = false
        for (let y = 0; y < h; y++) { if (ink[y][x]) { has = true; break } }
        colHas.push(has)
      }
      const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
      let st = -1
      for (let x = 0; x <= w; x++) {
        const on = x < w ? colHas[x] : false
        if (on && st === -1) st = x
        else if (!on && st !== -1) {
          if (x - st >= 2) {
            let y0 = h, y1 = -1
            for (let y = 0; y < h; y++) {
              for (let xx = st; xx < x; xx++) {
                if (ink[y][xx]) { if (y < y0) y0 = y; if (y > y1) y1 = y; break }
              }
            }
            if (y1 >= y0) boxes.push({ x0: st, x1: x, y0, y1 })
          }
          st = -1
        }
      }
      if (boxes.length < 2 || boxes.length > 5) return { error: `boxes=${boxes.length}`, boxes: boxes.length, inkRatio }

      // --- نرمال‌سازی به شبکه‌ی N×N ---
      const N = 24
      const gridOf = (m: number[][], x0: number, x1: number, y0: number, y1: number): number[] => {
        const bw = x1 - x0, bh = y1 - y0 + 1
        const out = new Array(N * N).fill(0)
        for (let gy = 0; gy < N; gy++) {
          for (let gx = 0; gx < N; gx++) {
            const sx0 = x0 + Math.floor((gx * bw) / N)
            const sx1 = x0 + Math.max(Math.floor(((gx + 1) * bw) / N), Math.floor((gx * bw) / N) + 1)
            const sy0 = y0 + Math.floor((gy * bh) / N)
            const sy1 = y0 + Math.max(Math.floor(((gy + 1) * bh) / N), Math.floor((gy * bh) / N) + 1)
            let on = 0, tot = 0
            for (let y = sy0; y < sy1 && y <= y1; y++) {
              for (let x = sx0; x < sx1 && x < x1; x++) { on += m[y][x]; tot++ }
            }
            out[gy * N + gx] = tot > 0 && on / tot > 0.35 ? 1 : 0
          }
        }
        return out
      }

      // --- رندر مرجع ---
      const FONTS = [
        'Tahoma', 'Arial', 'Segoe UI', 'Times New Roman', 'Courier New',
        'Vazirmatn', 'IRANSans', 'B Nazanin', 'Nazanin', 'sans-serif', 'serif',
      ]
      const DIGITS = ['\u06F0', '\u06F1', '\u06F2', '\u06F3', '\u06F4', '\u06F5', '\u06F6', '\u06F7', '\u06F8', '\u06F9']
      const OPS = [['+', '+'], ['-', '-'], ['\u00D7', '*'], ['\u00F7', '/']]

      const renderGrid = (ch: string, font: string): number[] | null => {
        const S = 96
        const rc = document.createElement('canvas')
        rc.width = S; rc.height = S
        const rx = rc.getContext('2d')
        if (!rx) return null
        rx.fillStyle = '#fff'; rx.fillRect(0, 0, S, S)
        rx.fillStyle = '#000'
        rx.font = `${Math.floor(S * 0.66)}px "${font}"`
        rx.textAlign = 'center'; rx.textBaseline = 'middle'
        rx.fillText(ch, S / 2, S / 2)
        let d: Uint8ClampedArray
        try { d = rx.getImageData(0, 0, S, S).data } catch { return null }
        const m: number[][] = []
        let x0 = S, x1 = -1, y0 = S, y1 = -1, cnt = 0
        for (let y = 0; y < S; y++) {
          const row: number[] = []
          for (let x = 0; x < S; x++) {
            const i = (y * S + x) * 4
            const v = d[i] < 140 ? 1 : 0
            row.push(v)
            if (v) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
          }
          m.push(row)
        }
        if (cnt < 8 || x1 < x0 || y1 < y0) return null
        return gridOf(m, x0, x1 + 1, y0, y1)
      }

      // ساخت یک‌باره‌ی مراجع
      const refDigits: Array<{ v: string; g: number[] }> = []
      const refOps: Array<{ v: string; g: number[] }> = []
      for (const f of FONTS) {
        for (let d = 0; d < 10; d++) {
          const g = renderGrid(DIGITS[d], f)
          if (g) refDigits.push({ v: String(d), g })
        }
        for (const [ch, v] of OPS) {
          const g = renderGrid(ch, f)
          if (g) refOps.push({ v, g })
        }
      }
      if (refDigits.length === 0) return { error: 'no-refs' }

      const iou = (a: number[], b: number[]): number => {
        let inter = 0, uni = 0
        for (let i = 0; i < a.length; i++) {
          if (a[i] && b[i]) inter++
          if (a[i] || b[i]) uni++
        }
        return uni === 0 ? 0 : inter / uni
      }

      const best = (g: number[], refs: Array<{ v: string; g: number[] }>) => {
        const scores = new Map<string, number>()
        for (const r of refs) {
          const s = iou(g, r.g)
          if (s > (scores.get(r.v) ?? 0)) scores.set(r.v, s)
        }
        const sorted = [...scores.entries()].sort((p, q) => q[1] - p[1])
        return { value: sorted[0]?.[0] ?? '', score: sorted[0]?.[1] ?? 0, second: sorted[1]?.[1] ?? 0 }
      }

      const symbols: SymbolMatch[] = []
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]
        const g = gridOf(ink, b.x0, b.x1, b.y0, b.y1)
        const isOpSlot = boxes.length === 3 && i === 1
        const r = isOpSlot ? best(g, refOps) : best(g, refDigits)
        symbols.push({ kind: isOpSlot ? 'op' : 'digit', value: r.value, score: r.score, second: r.second })
      }

      const expr = symbols.map((s) => s.value).join('')
      return { symbols, expr, boxes: boxes.length, inkRatio }
    }, IMG_SELECTOR)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'evaluate-failed' }
  }
}

/* ------------------------------------------------------------------ */
/*  حل‌کننده                                                            */
/* ------------------------------------------------------------------ */

export class CaptchaSolver {
  /** وضعیت تصویر کپچا را بررسی می‌کند */
  async checkImageState(page: Page): Promise<'ok' | 'not-loaded' | 'no-image' | 'empty'> {
    try {
      const st = await page.evaluate((sel) => {
        const im = document.querySelector(sel) as HTMLImageElement | null
        if (!im) return 'no-image'
        if (!im.complete || (im.naturalWidth || 0) < 8 || (im.naturalHeight || 0) < 8) return 'not-loaded'
        return 'ok'
      }, IMG_SELECTOR)
      return st as 'ok' | 'not-loaded' | 'no-image'
    } catch { return 'no-image' }
  }

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
          let p: HTMLElement | null = img.parentElement
          for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
            const t = (p.innerText || '').trim()
            if (t && t.length < 40) push(t)
          }
        }
        document.querySelectorAll('label,span,div,p,td').forEach((el) => {
          const t = ((el as HTMLElement).innerText || '').trim()
          if (t && t.length <= 20 && /[\d\u06F0-\u06F9\u0660-\u0669]\s*[+\-*/×÷]\s*[\d\u06F0-\u06F9\u0660-\u0669]/.test(t)) out.push(t)
        })
        return out
      }, IMG_SELECTOR)

      for (const c of candidates) {
        if (/^captcha$/i.test(c)) continue
        const ans = solveMathExpression(c)
        if (ans !== null && /[\d\u06F0-\u06F9\u0660-\u0669]/.test(c)) return c
      }
    } catch { /* ignore */ }
    return null
  }

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
          c.width = w * scale; c.height = h * scale
          const ctx = c.getContext('2d')
          if (!ctx) return null
          ctx.imageSmoothingEnabled = false
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
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
          } catch { /* ignore */ }
          return c.toDataURL('image/png')
        },
        { sel: IMG_SELECTOR, scale, threshold },
      )
    } catch { return null }
  }

  async waitForImage(page: Page, timeoutMs = 12000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await page.evaluate((sel) => {
          const im = document.querySelector(sel) as HTMLImageElement | null
          return !!(im && im.complete && im.naturalWidth > 8)
        }, IMG_SELECTOR)
        if (ok) { await page.waitForTimeout(120); return true }
      } catch { /* ignore */ }
      await page.waitForTimeout(300)
    }
    return false
  }

  /** OCR کل تصویر — فقط به‌عنوان پشتیبان */
  private async ocrRead(page: Page): Promise<{ raw: string; answer: string | null; method: string }> {
    let T: { recognize: (...a: unknown[]) => Promise<{ data: { text: string } }> }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      T = require('tesseract.js')
    } catch {
      return { raw: '', answer: null, method: 'no-tesseract' }
    }

    const sources: Array<{ img: string | Buffer; tag: string }> = []
    const pre = await this.preprocessImage(page, 5, 150)
    if (pre) sources.push({ img: pre, tag: 'canvas-5x' })
    const pre2 = await this.preprocessImage(page, 4, 190)
    if (pre2) sources.push({ img: pre2, tag: 'canvas-4x' })

    const configs = [
      { psm: '7', wl: '0123456789+-*/=' },
      { psm: '8', wl: '0123456789+-*/=' },
      { psm: '7', wl: '' },
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
          // اگر OCR کلمه‌ی captcha را خواند یعنی تصویر لود نشده
          if (/captcha/i.test(raw) && !/\d/.test(raw)) continue
          const direct = solveMathExpression(raw)
          if (direct !== null) return { raw, answer: direct, method: `ocr:${src.tag}/psm${cfg.psm}` }
          const fixed = fixOcrConfusions(raw)
          const fuzzy = solveMathExpression(fixed)
          if (fuzzy !== null) return { raw: `${raw} → ${fixed}`, answer: fuzzy, method: `ocr-fuzzy:${src.tag}/psm${cfg.psm}` }
        } catch { /* بعدی */ }
      }
    }
    return { raw: bestRaw, answer: null, method: 'ocr-failed' }
  }

  async solveCaptcha(page: Page): Promise<CaptchaResult> {
    try {
      const img = await page.$(IMG_SELECTOR)
      if (!img) {
        return { text: '', confidence: 0, needsManualReview: true, method: 'no-image', imageState: 'no-image', needsReload: true }
      }

      const loaded = await this.waitForImage(page)
      if (!loaded) {
        return {
          text: '', confidence: 0, needsManualReview: true,
          method: 'not-loaded', imageState: 'not-loaded', needsReload: true,
          raw: 'تصویر کپچا بارگذاری نشد',
        }
      }

      // ─────────────────────────────────────────────────────────────
      // دقیقا همان مسیر تصمیم‌گیری test-step1.js:
      //   تطبیق الگو تنها مرجع است. اگر خطا داد یا اطمینان < ۰.۴۲ بود،
      //   کپچای تازه می‌گیریم. هیچ‌وقت به OCR تکیه نمی‌کنیم چون روی
      //   ارقام فارسی نتیجه‌ی غلط می‌دهد و پاسخ اشتباه بدتر از نخواندن است.
      // ─────────────────────────────────────────────────────────────
      const tpl = await classifyByTemplate(page)

      if (tpl.error) {
        const reload = tpl.error === 'not-loaded' || tpl.error === 'empty' || tpl.error === 'no-image'
        return {
          text: '', confidence: 0, needsManualReview: true,
          method: `template:${tpl.error}`, imageState: tpl.error,
          needsReload: reload,
          raw: `تطبیق الگو ناموفق: ${tpl.error}`,
        }
      }

      if (tpl.symbols && tpl.expr) {
        const minScore = Math.min(...tpl.symbols.map((sym) => sym.score))
        const answer = solveMathExpression(tpl.expr)
        const detail = tpl.symbols.map((sym) => `${sym.value}(${sym.score.toFixed(2)})`).join(' ')

        // شرط پذیرش — عینا مثل تستر: ans !== null && minS >= 0.42
        if (answer !== null && minScore >= 0.42) {
          const n = parseInt(answer, 10)
          if (!Number.isNaN(n) && n >= 0 && n <= 999) {
            return {
              text: answer,
              confidence: Math.round(minScore * 100),
              needsManualReview: false,
              raw: `${tpl.expr} [${detail}]`,
              method: `template(${tpl.boxes})`,
              imageState: 'ok',
            }
          }
        }

        return {
          text: '', confidence: Math.round(minScore * 100), needsManualReview: true,
          raw: `الگو نامطمئن (${(minScore * 100).toFixed(0)}%): ${tpl.expr} [${detail}]`,
          method: 'template-low', imageState: 'ok',
        }
      }

      return {
        text: '', confidence: 0, needsManualReview: true,
        raw: 'نمادی در تصویر پیدا نشد', method: 'template-nosymbols',
        imageState: 'ok', needsReload: true,
      }
    } catch (e) {
      return {
        text: '', confidence: 0, needsManualReview: true,
        raw: e instanceof Error ? e.message : 'error', method: 'exception',
      }
    }
  }

  async solveAndFill(
    page: Page,
    opts?: { onLog?: (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void | Promise<void> },
  ): Promise<{ filled: boolean; answer: string; result: CaptchaResult }> {
    const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
      try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
    }

    const result = await this.solveCaptcha(page)

    if (result.needsReload) {
      await log(`کپچا لود نشده (${result.method}) — نیاز به رفرش صفحه`, 'warn')
      return { filled: false, answer: '', result }
    }

    if (result.needsManualReview || !result.text) {
      await log(`کپچا خوانده نشد (${result.method}${result.raw ? ` | ${String(result.raw).replace(/\n/g, ' ')}` : ''})`, 'warn')
      return { filled: false, answer: '', result }
    }

    await log(`کپچا: ${String(result.raw ?? '').replace(/\n/g, ' ')} ⇒ ${result.text}  [${result.method} ${result.confidence}%]`, 'success')

    const input = await page.$(INPUT_SELECTOR)
    if (!input) {
      await log('فیلد ورودی کپچا پیدا نشد', 'error')
      return { filled: false, answer: result.text, result }
    }

    try {
      await input.click({ clickCount: 3 }).catch(() => {})
      await input.fill('')
      await page.waitForTimeout(40 + Math.random() * 60)
      await input.type(result.text, { delay: 25 + Math.random() * 30 })
    } catch {
      try { await input.fill(result.text) } catch { /* ignore */ }
    }

    let actual = ''
    try {
      actual = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null
        return el ? el.value : ''
      }, INPUT_SELECTOR)
    } catch { /* ignore */ }

    if (normalizeDigits(actual).trim() !== result.text) {
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
    if (!filled) await log('نوشتن در فیلد کپچا ناموفق بود', 'error')

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
        await page.evaluate((sel) => {
          const im = document.querySelector(sel) as HTMLImageElement | null
          if (im) {
            const u = new URL(im.src, location.href)
            u.searchParams.set('_', String(Date.now()))
            im.src = u.toString()
          }
        }, IMG_SELECTOR).catch(() => {})
      }

      await page.waitForTimeout(500)
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
