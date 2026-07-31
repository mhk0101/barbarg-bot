import { prisma } from '@/lib/prisma'
import { browserManager } from '../browser/BrowserManager'
import { loginFlow } from '../auth/LoginFlow'
import { WaybillFlow } from '../waybill/WaybillFlow'
import { captchaSolver } from '../captcha/CaptchaSolver'
import type { WaybillData } from '../interfaces'

export interface WorkflowResult {
  success: boolean
  trackingCode?: string
  error?: string
  screenshotPath?: string
}

export class WaybillWorkflow {
  private accountId: string
  private jobId: string
  private testMode: boolean

  constructor(accountId: string, jobId: string, testMode = false) {
    this.accountId = accountId
    this.jobId = jobId
    this.testMode = testMode
  }

  async execute(data: WaybillData): Promise<WorkflowResult> {
    await this.log('info', 'شروع workflow باربرگ')

    // Step 1: Check session
    await this.log('info', 'بررسی نشست مرورگر...')
    const hasSession = browserManager.hasSession(this.accountId)
    if (!hasSession) {
      await this.log('error', 'نشست ذخیره نشده - نیاز به ورود دستی')
      return { success: false, error: 'نشست ذخیره نشده' }
    }

    // Step 2: Launch browser
    await this.log('info', 'راه‌اندازی مرورگر...')
    await browserManager.launch()

    // Step 3: Validate session
    await this.log('info', 'اعتبارسنجی نشست...')
    const valid = await loginFlow.isSessionValid(this.accountId)
    if (!valid) {
      await this.log('error', 'نشست منقضی شده')
      browserManager.removeSession(this.accountId)
      return { success: false, error: 'نشست منقضی شده' }
    }

    // Step 4: Create page
    await this.log('info', 'ایجاد صفحه مرورگر...')
    const page = await browserManager.createPage(this.accountId)
    if (!page) return { success: false, error: 'خطا در ایجاد صفحه' }

    try {
      // Step 5: Navigate to form
      const flow = new WaybillFlow(page, this.accountId)
      await this.log('info', 'باز کردن فرم باربرگ...')
      const navigated = await flow.navigateToCreate()
      if (!navigated) return { success: false, error: 'خطا در باز کردن فرم' }

      // Step 6: Fill form
      await this.log('info', 'پر کردن فیلدهای فرم...')
      const filled = await flow.fillForm(data)
      if (!filled) return { success: false, error: 'خطا در پر کردن فرم' }

      // Step 7: Handle captcha
      await this.delay(3000 + Math.random() * 5000)
      await this.log('info', 'بررسی کپچا...')
      const captchaResult = await flow.handleCaptcha()
      if (captchaResult.needsManual) {
        await this.log('warn', 'کپچا نیاز به حل دستی')
        return { success: false, error: 'نیاز به حل دستی کپچا', screenshotPath: captchaResult.screenshotPath }
      }

      // Step 8: Submit
      await this.delay(3000 + Math.random() * 5000)
      await this.log('info', 'ارسال فرم...')
      const result = await flow.submit()

      if (result.success) {
        await browserManager.saveSession(this.accountId)
        await this.log('success', `ثبت موفق - ${result.trackingCode || 'نامشخص'}`)
        return { success: true, trackingCode: result.trackingCode }
      } else {
        await this.log('error', result.resultMessage || 'ثبت ناموفق')
        const screenshotPath = await browserManager.screenshot(page, `error-${this.jobId}`)
        return { success: false, error: result.resultMessage, screenshotPath }
      }
    } finally {
      await browserManager.closePage(this.accountId)
    }
  }

  private async log(level: string, message: string): Promise<void> {
    await prisma.jobLog.create({ data: { jobId: this.jobId, level, message } }).catch(() => {})
  }

  private delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
}
