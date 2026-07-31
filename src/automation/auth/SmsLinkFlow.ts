import { browserManager } from '../browser/BrowserManager'

const ALLOWED_HOSTS = ['barname.utcms.ir']

export interface OpenLinkResult {
  success: boolean
  error?: string
  finalUrl?: string
  screenshotPath?: string
}

function isAllowedLink(link: string): boolean {
  try {
    const url = new URL(link)
    return ALLOWED_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Opens a link (extracted from a forwarded SMS, e.g. an OTP / verification
 * link sent by barname.utcms.ir) inside the browser session tied to an
 * account, so that the site treats the click as coming from the same
 * session that requested it. Saves the resulting session afterwards.
 */
export class SmsLinkFlow {
  async openVerificationLink(accountId: string, link: string): Promise<OpenLinkResult> {
    if (!isAllowedLink(link)) {
      return { success: false, error: 'لینک به دامنه مجاز (barname.utcms.ir) اشاره نمی‌کند' }
    }

    const page = await browserManager.createPage(accountId)
    if (!page) {
      return { success: false, error: 'نشست فعالی برای این حساب یافت نشد — ابتدا یک بار به صورت دستی وارد شوید' }
    }

    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2500)
      const finalUrl = page.url()
      const screenshotPath = await browserManager.screenshot(page, `sms-link-${accountId}`)
      await browserManager.saveSession(accountId)
      return { success: true, finalUrl, screenshotPath }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'خطا در باز کردن لینک' }
    } finally {
      await browserManager.closePage(accountId)
    }
  }
}

export const smsLinkFlow = new SmsLinkFlow()
