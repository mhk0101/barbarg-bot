import type { Page } from 'playwright'

/**
 * تشخیص و عبور از «چالش امنیتی» فایروال (WAF).
 *
 * این با کپچای خود سامانه (DNTCaptcha) فرق دارد:
 *   - قبل از رسیدن به صفحه‌ی ورود ظاهر می‌شود
 *   - عنوان انگلیسی «Security check» دارد
 *   - فیلد پاسخ `pcode` است، نه `DNTCaptchaInputText`
 *   - تصویر GIF به‌صورت inline (data:image/gif;base64) داخل صفحه است
 *   - فیلدهای مخفی `vcode` و `req_data` هم همراه فرم ارسال می‌شوند
 *
 * متن این کپچا معمولاً حروف/ارقام لاتین است (نه عبارت ریاضی فارسی).
 */

export interface WafResult {
  detected: boolean
  solved: boolean
  attempts: number
  text?: string
  error?: string
}

const PCODE_SELECTOR = 'input[name="pcode"]'
const SUBMIT_SELECTOR = 'input[type="submit"], button[type="submit"]'

/** آیا صفحه‌ی فعلی یک چالش WAF است؟ */
export async function isWafChallenge(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      if (document.querySelector('input[name="pcode"]')) return true
      if (document.querySelector('input[name="vcode"][value="CAPTCHA"]')) return true
      const t = (document.body?.innerText || '').slice(0, 500)
      return /Security\s*check/i.test(t) && /enter the above text/i.test(t)
    })
  } catch { return false }
}

/** تصویر چالش را با بزرگ‌نمایی و آستانه‌گذاری آماده‌ی OCR می‌کند */
async function prepareImage(page: Page, scale: number, threshold: number, invert: boolean): Promise<string | null> {
  try {
    return await page.evaluate(
      ({ scale, threshold, invert }) => {
        // تصویر چالش: معمولاً تنها img داخل h1 یا اولین img با data:image
        const img =
          (document.querySelector('h1 img') as HTMLImageElement | null) ||
          (Array.from(document.querySelectorAll('img')).find((i) =>
            (i as HTMLImageElement).src.startsWith('data:image'),
          ) as HTMLImageElement | null)
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
            let v = g < threshold ? 0 : 255
            if (invert) v = 255 - v
            px[i] = px[i + 1] = px[i + 2] = v
            px[i + 3] = 255
          }
          ctx.putImageData(d, 0, 0)
        } catch { /* ignore */ }

        return c.toDataURL('image/png')
      },
      { scale, threshold, invert },
    )
  } catch { return null }
}

/** متن چالش را با OCR می‌خواند */
async function readChallengeText(page: Page): Promise<string[]> {
  let T: { recognize: (...a: unknown[]) => Promise<{ data: { text: string; confidence: number } }> }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    T = require('tesseract.js')
  } catch { return [] }

  const variants: Array<{ scale: number; thr: number; inv: boolean }> = [
    { scale: 4, thr: 150, inv: false },
    { scale: 6, thr: 128, inv: false },
    { scale: 4, thr: 100, inv: false },
    { scale: 4, thr: 180, inv: true },
  ]

  const results: Array<{ text: string; conf: number }> = []

  for (const v of variants) {
    const img = await prepareImage(page, v.scale, v.thr, v.inv)
    if (!img) continue
    for (const psm of ['7', '8', '6']) {
      try {
        const r = await T.recognize(img, 'eng', {
          logger: () => {},
          tessedit_pageseg_mode: psm,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        } as unknown as Record<string, unknown>)
        const txt = String(r?.data?.text ?? '').replace(/[^A-Za-z0-9]/g, '')
        if (txt.length >= 3 && txt.length <= 12) {
          results.push({ text: txt, conf: Number(r?.data?.confidence ?? 0) })
        }
      } catch { /* بعدی */ }
    }
  }

  // پرتکرارترین‌ها اول
  const freq = new Map<string, { n: number; conf: number }>()
  for (const r of results) {
    const cur = freq.get(r.text) ?? { n: 0, conf: 0 }
    freq.set(r.text, { n: cur.n + 1, conf: Math.max(cur.conf, r.conf) })
  }

  return Array.from(freq.entries())
    .sort((a, b) => (b[1].n - a[1].n) || (b[1].conf - a[1].conf))
    .map(([t]) => t)
}

/**
 * اگر صفحه چالش WAF بود، آن را حل می‌کند و منتظر بارگذاری صفحه‌ی بعدی می‌ماند.
 */
export async function solveWafChallenge(
  page: Page,
  opts?: {
    maxAttempts?: number
    onLog?: (msg: string, level?: 'info' | 'warn' | 'error' | 'success') => void | Promise<void>
  },
): Promise<WafResult> {
  const log = async (m: string, l: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    try { await opts?.onLog?.(m, l) } catch { /* ignore */ }
  }

  if (!(await isWafChallenge(page))) {
    return { detected: false, solved: true, attempts: 0 }
  }

  const maxAttempts = opts?.maxAttempts ?? 4
  await log('چالش امنیتی فایروال تشخیص داده شد (Security check)', 'warn')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // صبر برای بارگذاری کامل تصویر inline
    await page.waitForTimeout(600)

    const candidates = await readChallengeText(page)
    if (candidates.length === 0) {
      await log(`متن چالش خوانده نشد (تلاش ${attempt}/${maxAttempts})`, 'warn')
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(1500)
      if (!(await isWafChallenge(page))) {
        await log('چالش برطرف شد', 'success')
        return { detected: true, solved: true, attempts: attempt }
      }
      continue
    }

    const text = candidates[0]
    await log(`متن چالش: "${text}" (تلاش ${attempt}/${maxAttempts})`)

    const input = await page.$(PCODE_SELECTOR)
    if (!input) {
      return { detected: true, solved: false, attempts: attempt, error: 'فیلد pcode پیدا نشد' }
    }

    try {
      await input.click({ clickCount: 3 }).catch(() => {})
      await input.fill('')
      await input.type(text, { delay: 90 + Math.random() * 90 })
    } catch {
      try { await input.fill(text) } catch { /* ignore */ }
    }

    await page.waitForTimeout(400)

    const submit = await page.$(SUBMIT_SELECTOR)
    if (submit) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {}),
        submit.click().catch(() => {}),
      ])
    } else {
      await page.keyboard.press('Enter').catch(() => {})
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
    }

    await page.waitForTimeout(2000)

    if (!(await isWafChallenge(page))) {
      await log(`چالش امنیتی با موفقیت عبور شد (${text})`, 'success')
      return { detected: true, solved: true, attempts: attempt, text }
    }

    await log(`پاسخ "${text}" پذیرفته نشد`, 'warn')
  }

  return {
    detected: true,
    solved: false,
    attempts: maxAttempts,
    error: `عبور از چالش امنیتی پس از ${maxAttempts} تلاش ناموفق بود`,
  }
}
