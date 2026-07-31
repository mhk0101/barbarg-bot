import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const SCREENSHOT_DIR = path.join(process.cwd(), 'automation-data', 'screenshots')
const HTML_DIR = path.join(process.cwd(), 'automation-data', 'html')

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }

export interface PlaywrightLogData {
  consoleErrors: string[]
  networkErrors: string[]
  timeouts: string[]
  requestFailures: string[]
  currentUrl: string
}

export class BrowserManager {
  private browser: Browser | null = null
  private contexts: Map<string, BrowserContext> = new Map()
  private pages: Map<string, Page> = new Map()
  private pageLogs: Map<string, PlaywrightLogData> = new Map()
  private pageListeners: Map<string, Array<() => void>> = new Map()

  async launch(headless = false): Promise<Browser> {
    ensureDir(SCREENSHOT_DIR)
    ensureDir(HTML_DIR)
    if (this.browser?.isConnected()) return this.browser
    this.browser = await chromium.launch({
      headless,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
    return this.browser
  }

  async getAuthenticatedContext(accountId: string): Promise<BrowserContext | null> {
    ensureDir(SESSION_DIR)
    const statePath = path.join(SESSION_DIR, `${accountId}.json`)
    if (!fs.existsSync(statePath)) return null
    if (!this.browser) await this.launch()
    const ctx = await this.browser!.newContext({ storageState: statePath })
    this.contexts.set(accountId, ctx)
    return ctx
  }

  async createPage(accountId: string): Promise<Page | null> {
    const ctx = await this.getAuthenticatedContext(accountId)
    if (!ctx) return null
    const page = await ctx.newPage()
    const pageKey = `page-${accountId}-${Date.now()}`
    this.pages.set(pageKey, page)
    this.attachPageListeners(pageKey, page)
    return page
  }

  private attachPageListeners(pageKey: string, page: Page): void {
    const logData: PlaywrightLogData = {
      consoleErrors: [],
      networkErrors: [],
      timeouts: [],
      requestFailures: [],
      currentUrl: page.url(),
    }
    this.pageLogs.set(pageKey, logData)

    const consoleListener = (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === 'error') {
        logData.consoleErrors.push(msg.text())
      }
    }

    const requestFailedListener = (request: { url: () => string; failure: () => { errorText: string } | null }) => {
      const failure = request.failure()
      const msg = `${request.url()} - ${failure?.errorText || 'unknown'}`
      logData.networkErrors.push(msg)
      logData.requestFailures.push(msg)
    }

    page.on('console', consoleListener)
    page.on('requestfailed', requestFailedListener)

    const cleanup = () => {
      page.removeListener('console', consoleListener)
      page.removeListener('requestfailed', requestFailedListener)
    }

    this.pageListeners.set(pageKey, [cleanup])
  }

  async saveHtmlSnapshot(page: Page, name: string): Promise<string> {
    ensureDir(HTML_DIR)
    const filePath = path.join(HTML_DIR, `${name}-${Date.now()}.html`)
    const content = await page.content()
    fs.writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  capturePlaywrightLog(page: Page): PlaywrightLogData {
    for (const [, logData] of this.pageLogs) {
      if (logData.currentUrl === page.url()) {
        logData.currentUrl = page.url()
        return { ...logData }
      }
    }
    return { consoleErrors: [], networkErrors: [], timeouts: [], requestFailures: [], currentUrl: page.url() }
  }

  capturePageLog(pageKey: string): PlaywrightLogData {
    const logData = this.pageLogs.get(pageKey)
    if (logData) {
      return { ...logData, currentUrl: '' }
    }
    return { consoleErrors: [], networkErrors: [], timeouts: [], requestFailures: [], currentUrl: '' }
  }

  getPageKeyForPage(page: Page): string | undefined {
    for (const [key, p] of this.pages) {
      if (p === page) return key
    }
    return undefined
  }

  async saveSession(accountId: string): Promise<void> {
    ensureDir(SESSION_DIR)
    const ctx = this.contexts.get(accountId)
    if (ctx) {
      const statePath = path.join(SESSION_DIR, `${accountId}.json`)
      await ctx.storageState({ path: statePath })
    }
  }

  async screenshot(page: Page, name: string): Promise<string> {
    ensureDir(SCREENSHOT_DIR)
    const filePath = path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`)
    await page.screenshot({ path: filePath, fullPage: true })
    return filePath
  }

  hasSession(accountId: string): boolean {
    const statePath = path.join(SESSION_DIR, `${accountId}.json`)
    return fs.existsSync(statePath)
  }

  removeSession(accountId: string): void {
    const statePath = path.join(SESSION_DIR, `${accountId}.json`)
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
    this.contexts.delete(accountId)
  }

  async closePage(accountId: string): Promise<void> {
    for (const [key, page] of this.pages) {
      if (key.startsWith(`page-${accountId}`)) {
        const listeners = this.pageListeners.get(key)
        if (listeners) {
          for (const cleanup of listeners) cleanup()
          this.pageListeners.delete(key)
        }
        this.pageLogs.delete(key)
        await page.close().catch(() => {})
        this.pages.delete(key)
      }
    }
  }

  async close(): Promise<void> {
    for (const [key] of this.pages) await this.closePage(key.replace('page-', ''))
    for (const [, ctx] of this.contexts) await ctx.close().catch(() => {})
    this.contexts.clear()
    this.pageLogs.clear()
    this.pageListeners.clear()
    if (this.browser) { await this.browser.close().catch(() => {}); this.browser = null }
  }

  isConnected(): boolean { return this.browser?.isConnected() ?? false }
}

export const browserManager = new BrowserManager()
