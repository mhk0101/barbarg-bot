import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'
import { browserManager } from '../browser/BrowserManager'

const SITE_URL = 'https://barname.utcms.ir'
const LOGIN_URL = `${SITE_URL}/Barname/Account/Login`
const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }

function solveMathCaptcha(text: string): string | null {
  // Captcha is a simple math expression like "6+0", "8-3", "12*5"
  const cleaned = text.replace(/\s+/g, '').trim()
  const match = cleaned.match(/^(-?\d+)\s*([+\-*/÷])\s*(-?\d+)$/)
  if (!match) return null
  const a = parseInt(match[1])
  const op = match[2]
  const b = parseInt(match[3])
  switch (op) {
    case '+': return String(a + b)
    case '-': return String(a - b)
    case '*': return String(a * b)
    case '/': return b !== 0 ? String(Math.round(a / b)) : null
    case '÷': return b !== 0 ? String(Math.round(a / b)) : null
    default: return null
  }
}

async function readCaptchaText(page: Page): Promise<string> {
  try {
    // Try to get captcha image and OCR it
    const captchaImg = await page.$('#dntCaptchaImg, img[alt="captcha"], img[src*="captcha"]')
    if (!captchaImg) return ''

    // Take screenshot of captcha
    const buffer = await captchaImg.screenshot()
    const Tesseract = require('tesseract.js')
    const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} })
    return result.data.text.trim()
  } catch { return '' }
}

async function refreshCaptcha(page: Page): Promise<void> {
  try {
    const refreshBtn = await page.$('#dntCaptchaRefreshButton, a[data-ajax-url*="Refresh"]')
    if (refreshBtn) await refreshBtn.click()
    await page.waitForTimeout(1500)
  } catch {}
}

export class LoginFlow {
  private async waitForPageReady(page: Page): Promise<void> {
    try {
      await page.waitForFunction(() => {
        const loading = document.getElementById('loading')
        if (!loading) return true
        const style = window.getComputedStyle(loading)
        return style.display === 'none' || style.visibility === 'hidden' || loading.offsetParent === null
      }, { timeout: 15000 })
    } catch {
      await page.evaluate(() => {
        const loading = document.getElementById('loading')
        if (loading) {
          loading.style.display = 'none'
          loading.style.visibility = 'hidden'
          loading.style.pointerEvents = 'none'
          loading.remove()
        }
      })
    }
    await page.waitForTimeout(1000)
  }

  async loginWithSavedSession(accountId: string): Promise<{ success: boolean; needsReLogin: boolean }> {
    const page = await browserManager.createPage(accountId)
    if (!page) return { success: false, needsReLogin: true }
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2000)
      if (!page.url().includes('Login')) return { success: true, needsReLogin: false }
      return { success: false, needsReLogin: true }
    } catch {
      return { success: false, needsReLogin: true }
    } finally {
      await browserManager.closePage(accountId)
    }
  }

  async openManualLogin(accountId: string): Promise<{ success: boolean }> {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: false, channel: 'chrome' })
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(LOGIN_URL)
    await page.waitForFunction(() => !window.location.pathname.includes('Login'), { timeout: 300000 })
    await page.waitForTimeout(2000)
    ensureDir(SESSION_DIR)
    await context.storageState({ path: path.join(SESSION_DIR, `${accountId}.json`) })
    await browser.close()
    return { success: true }
  }

  async isSessionValid(accountId: string): Promise<boolean> {
    const statePath = path.join(SESSION_DIR, `${accountId}.json`)
    if (!fs.existsSync(statePath)) return false
    const page = await browserManager.createPage(accountId)
    if (!page) return false
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.waitForPageReady(page)
      return !page.url().includes('Login')
    } catch { return false }
    finally { await browserManager.closePage(accountId) }
  }

  async automatedLogin(accountId: string, username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const page = await browserManager.createPage(accountId)
    if (!page) return { success: false, error: 'خطا در ایجاد صفحه' }

    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.waitForPageReady(page)

      if (!page.url().includes('Login')) {
        await browserManager.saveSession(accountId)
        return { success: true }
      }

      // Fill credentials
      await page.fill('#NationalCode', username)
      await page.fill('#user-password', password)

      // Solve captcha
      for (let attempt = 0; attempt < 5; attempt++) {
        const captchaText = await readCaptchaText(page)
        const answer = solveMathCaptcha(captchaText)
        if (answer) {
          const input = await page.$('#DNTCaptchaInputText')
          if (input) { await input.fill(answer); break }
        }
        await refreshCaptcha(page)
      }

      // Click login
      const loginBtn = await page.$('#inter')
      if (loginBtn) await loginBtn.click()
      await page.waitForTimeout(5000)

      if (!page.url().includes('Login')) {
        await browserManager.saveSession(accountId)
        return { success: true }
      }
      return { success: false, error: 'ورود ناموفق' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'خطا' }
    } finally {
      await browserManager.closePage(accountId)
    }
  }
}

export const loginFlow = new LoginFlow()
