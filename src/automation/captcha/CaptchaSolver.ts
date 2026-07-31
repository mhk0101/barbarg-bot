import type { Page } from 'playwright'
import { browserManager } from '../browser/BrowserManager'

export interface CaptchaResult { text: string; confidence: number; needsManualReview: boolean; screenshotPath?: string }

function solveMathExpression(text: string): string | null {
  const cleaned = text.replace(/\s+/g, '').trim()
  const match = cleaned.match(/^(-?\d+)\s*([+\-*/÷×])\s*(-?\d+)$/)
  if (!match) return null
  const a = parseInt(match[1]); const op = match[2]; const b = parseInt(match[3])
  switch (op) {
    case '+': return String(a + b)
    case '-': return String(a - b)
    case '*': case '×': return String(a * b)
    case '/': case '÷': return b !== 0 ? String(Math.round(a / b)) : null
    default: return null
  }
}

export class CaptchaSolver {
  async solveCaptcha(page: Page): Promise<CaptchaResult> {
    try {
      const captchaImg = await page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha"]')
      if (!captchaImg) return { text: '', confidence: 0, needsManualReview: true }

      // Try OCR first
      try {
        const buffer = await captchaImg.screenshot()
        const Tesseract = require('tesseract.js')
        const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} })
        const text = result.data.text.trim()
        const confidence = result.data.confidence

        // Try to solve as math
        const answer = solveMathExpression(text)
        if (answer) return { text: answer, confidence: 95, needsManualReview: false }

        // Low confidence or unrecognized
        if (confidence < 50 || text.length < 2) {
          return { text: '', confidence, needsManualReview: true }
        }

        return { text, confidence, needsManualReview: false }
      } catch {
        return { text: '', confidence: 0, needsManualReview: true }
      }
    } catch {
      return { text: '', confidence: 0, needsManualReview: true }
    }
  }

  async getCaptchaScreenshot(page: Page): Promise<string | null> {
    try {
      const captchaImg = await page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha"]')
      if (!captchaImg) return null
      const buffer = await captchaImg.screenshot()
      return buffer.toString('base64')
    } catch { return null }
  }

  async refreshCaptcha(page: Page): Promise<void> {
    try {
      const refreshBtn = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh"]')
      if (refreshBtn) await refreshBtn.click()
      await page.waitForTimeout(1500)
    } catch {}
  }
}

export const captchaSolver = new CaptchaSolver()
