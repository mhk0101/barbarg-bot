import { prisma } from '@/lib/prisma'
import { browserManager } from '../browser/BrowserManager'
import { loginFlow } from '../auth/LoginFlow'
import { WaybillFlow } from '../waybill/WaybillFlow'
import { getAutomationSettings, type AutomationSettings } from '@/lib/settings'
import type { WaybillData } from '../interfaces'

let engineInstance: AutomationEngine | null = null
export function getAutomationEngine(): AutomationEngine {
  if (!engineInstance) engineInstance = new AutomationEngine()
  return engineInstance
}

export class AutomationEngine {
  private running = false
  private paused = false
  private stats = { completed: 0, failed: 0, total: 0 }
  private settings: AutomationSettings | null = null

  async start(): Promise<void> {
    if (this.running) return
    this.settings = await getAutomationSettings()
    this.running = true
    this.paused = false
    await prisma.activityLog.create({ data: { action: 'engine_started', resource: 'automation', details: JSON.parse(JSON.stringify({ timestamp: new Date().toISOString(), settings: this.settings })) } })
  }

  stop(): void { this.running = false; this.paused = false; browserManager.close().catch(() => {}) }
  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  isRunning(): boolean { return this.running }
  isPaused(): boolean { return this.paused }
  getStats() { return { ...this.stats } }
  getSettings() { return this.settings }

  async processTask(taskId: string): Promise<void> {
    const settings = await getAutomationSettings()
    const task = await prisma.job.findUnique({ where: { id: taskId } })
    if (!task) return

    await prisma.job.update({ where: { id: taskId }, data: { status: 'processing', startedAt: new Date() } })
    await this.log(taskId, 'info', 'شروع پردازش وظیفه')

    const automationResult = await prisma.automationResult.create({
      data: {
        taskId,
        status: 'running',
        startedAt: new Date(),
        retryCount: task.attempts,
      },
    })

    const startedAt = Date.now()

    try {
      const accountId = 'default'
      const hasSession = browserManager.hasSession(accountId)

      if (!hasSession) {
        await this.log(taskId, 'error', 'نشست ذخیره نشده')
        await prisma.notification.create({ data: { title: 'ورود مورد نیاز', message: 'برای ادامه وارد سایت شوید', type: 'warning' } })
        await this.failJobAndResult(taskId, automationResult.id, 'نشست ذخیره نشده', 'error', startedAt)
        return
      }

      await this.log(taskId, 'info', 'مرورگر راه‌اندازی شد')
      await browserManager.launch()

      // Wait before connecting to avoid rate limiting
      await this.delay(5000 + Math.random() * 5000)

      let sessionValid = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          sessionValid = await loginFlow.isSessionValid(accountId)
          break
        } catch {
          await this.log(taskId, 'warn', `تلاش ${attempt + 1} برای بررسی نشست ناموفق - انتظار ۱۰ ثانیه`)
          await this.delay(10000)
        }
      }

      if (!sessionValid) {
        await this.log(taskId, 'error', 'نشست منقضی شده')
        browserManager.removeSession(accountId)
        await prisma.notification.create({ data: { title: 'نشست منقضی شده', message: 'لطفاً مجدداً وارد شوید', type: 'error' } })
        await this.failJobAndResult(taskId, automationResult.id, 'نشست منقضی شده', 'error', startedAt)
        return
      }

      await this.log(taskId, 'info', 'نشست معتبر - شروع عملیات')
      const page = await browserManager.createPage(accountId)
      if (!page) throw new Error('خطا در ایجاد صفحه')

      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: { accountId, currentUrl: page.url() },
      })

      const waybillFlow = new WaybillFlow(page, accountId)
      await this.log(taskId, 'info', 'باز کردن فرم باربرگ...')
      const navigated = await waybillFlow.navigateToCreate()
      if (!navigated) throw new Error('خطا در باز کردن فرم')

      const waybillData = await this.resolveWaybillData(taskId)
      if (!waybillData) throw new Error('داده باربرگ یافت نشد')

      await this.log(taskId, 'info', 'پر کردن فرم...')
      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          plate: waybillData.plateNumber,
          driver: waybillData.driverName,
          sender: `${waybillData.senderFirstName} ${waybillData.senderLastName}`,
          receiver: `${waybillData.receiverFirstName} ${waybillData.receiverLastName}`,
          currentUrl: page.url(),
        },
      })

      const filled = await waybillFlow.fillForm(waybillData)
      if (!filled) throw new Error('خطا در پر کردن فرم')

      await this.delay(settings.actionDelay * 1000)
      await this.log(taskId, 'info', 'بررسی کپچا...')
      const captchaResult = await waybillFlow.handleCaptcha()
      if (captchaResult.needsManual) {
        await this.log(taskId, 'warn', 'کپچا نیاز به حل دستی')
        const screenshotPath = captchaResult.screenshotPath || await browserManager.screenshot(page, 'captcha-paused')
        await prisma.automationResult.update({
          where: { id: automationResult.id },
          data: {
            status: 'paused',
            resultMessage: 'نیاز به حل دستی کپچا',
            resultType: 'warning',
            screenshotPath,
            finishedAt: new Date(),
            duration: Date.now() - startedAt,
          },
        })
        await prisma.job.update({ where: { id: taskId }, data: { status: 'paused', error: 'نیاز به حل دستی کپچا' } })
        return
      }

      await this.delay(settings.actionDelay * 1000)
      await this.log(taskId, 'info', 'ارسال فرم...')
      const result = await waybillFlow.submit()

      const screenshotPath = await browserManager.screenshot(page, `result-${taskId}`)
      const htmlSnapshotPath = await browserManager.saveHtmlSnapshot(page, `result-${taskId}`)

      const pageKey = browserManager.getPageKeyForPage(page)
      const rawLog = pageKey ? browserManager.capturePageLog(pageKey) : browserManager.capturePlaywrightLog(page)
      const playwrightLog = JSON.parse(JSON.stringify(rawLog))

      if (result.success) {
        await browserManager.saveSession(accountId)
        await this.log(taskId, 'success', `ثبت موفق - ${result.resultMessage}`)
        await prisma.job.update({
          where: { id: taskId },
          data: { status: 'completed', result: result.trackingCode || result.resultMessage, completedAt: new Date() },
        })
        await prisma.automationResult.update({
          where: { id: automationResult.id },
          data: {
            status: 'completed',
            resultMessage: result.resultMessage,
            resultType: 'success',
            waybillNumber: result.trackingCode,
            screenshotPath,
            htmlSnapshotPath,
            playwrightLog,
            currentUrl: page.url(),
            finishedAt: new Date(),
            duration: Date.now() - startedAt,
          },
        })
        await prisma.activityLog.create({ data: { action: 'task_completed', resource: 'automation', resourceId: taskId } })
        this.stats.completed++
      } else {
        await prisma.automationResult.update({
          where: { id: automationResult.id },
          data: {
            status: 'failed',
            resultMessage: result.resultMessage,
            resultType: result.resultType,
            errorCode: 'SUBMISSION_FAILED',
            screenshotPath,
            htmlSnapshotPath,
            playwrightLog,
            currentUrl: page.url(),
            finishedAt: new Date(),
            duration: Date.now() - startedAt,
          },
        })

        if (task.attempts < task.maxRetries) {
          await this.retryTask(taskId, automationResult.id, result.resultMessage, settings)
        } else {
          await prisma.job.update({
            where: { id: taskId },
            data: { status: 'failed', error: result.resultMessage, completedAt: new Date() },
          })
          await this.createErrorLog(taskId, result.resultMessage, screenshotPath)
          await prisma.activityLog.create({ data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: result.resultMessage } } })
        }
        this.stats.failed++
      }

      await browserManager.closePage(accountId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'خطای ناشناخته'
      await this.log(taskId, 'error', msg)

      let screenshotPath: string | undefined
      let htmlSnapshotPath: string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let playwrightLog: any

      const errAccountId = 'default'
      try {
        const errPage = await browserManager.createPage(errAccountId)
        if (errPage) {
          screenshotPath = await browserManager.screenshot(errPage, `error-${taskId}`)
          htmlSnapshotPath = await browserManager.saveHtmlSnapshot(errPage, `error-${taskId}`)
          const pageKey = browserManager.getPageKeyForPage(errPage)
          const rawLog = pageKey ? browserManager.capturePageLog(pageKey) : browserManager.capturePlaywrightLog(errPage)
          playwrightLog = JSON.parse(JSON.stringify(rawLog))
          await browserManager.closePage(errAccountId)
        }
      } catch { }

      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'failed',
          resultMessage: msg,
          resultType: 'error',
          errorCode: 'EXCEPTION',
          screenshotPath,
          htmlSnapshotPath,
          playwrightLog,
          finishedAt: new Date(),
          duration: Date.now() - startedAt,
        },
      })

      if (task.attempts < task.maxRetries) {
        await this.retryTask(taskId, automationResult.id, msg, settings)
      } else {
        await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: msg, completedAt: new Date() } })
        await this.createErrorLog(taskId, msg, screenshotPath)
        await prisma.activityLog.create({ data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: msg } } })
      }
      this.stats.failed++
    }
  }

  private async resolveWaybillData(taskId: string): Promise<WaybillData | null> {
    const job = await prisma.job.findUnique({
      where: { id: taskId },
      include: {
        waybill: {
          include: {
            sender: true,
            receiver: true,
            driver: true,
            plate: true,
            cargo: true,
          },
        },
      },
    })
    if (!job?.waybill) return null

    const w = job.waybill
    const senderName = (w.sender?.name || '').split(' ')
    const receiverName = (w.receiver?.name || '').split(' ')

    return {
      plateNumber: w.plate?.plateNumber || '',
      driverName: w.driver?.name || '',
      senderFirstName: senderName[0] || '',
      senderLastName: senderName.slice(1).join(' ') || '',
      senderMobile: w.sender?.phone || '',
      senderNationalId: w.sender?.nationalId || '',
      receiverFirstName: receiverName[0] || '',
      receiverLastName: receiverName.slice(1).join(' ') || '',
      receiverMobile: w.receiver?.phone || '',
      receiverNationalId: w.receiver?.nationalId || '',
      originProvince: w.originProvince || '',
      originCity: w.originCity || '',
      destProvince: w.destProvince || '',
      destCity: w.destCity || '',
      cargoName: w.cargo?.name || '',
      freightCost: w.freightCost || undefined,
    }
  }

  private async retryTask(taskId: string, automationResultId: string, errorMessage: string, settings: AutomationSettings): Promise<void> {
    const oldJob = await prisma.job.findUnique({ where: { id: taskId } })
    if (!oldJob) return

    const retryDelay = settings.retryIntervals[oldJob.attempts] || settings.retryIntervals[settings.retryIntervals.length - 1] || 60

    const newJob = await prisma.job.create({
      data: {
        waybillId: oldJob.waybillId,
        type: oldJob.type,
        status: 'pending',
        priority: oldJob.priority,
        attempts: oldJob.attempts + 1,
        maxRetries: oldJob.maxRetries,
        nextRetryAt: new Date(Date.now() + retryDelay * 1000),
      },
    })

    await prisma.automationResult.update({
      where: { id: automationResultId },
      data: { retryCount: oldJob.attempts + 1 },
    })

    await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: errorMessage, completedAt: new Date() } })

    await this.log(taskId, 'info', `تلاش مجدد برنامه‌ریزی شد: Job ${newJob.id} در ${retryDelay} ثانیه`)
    await prisma.activityLog.create({
      data: { action: 'task_retry_scheduled', resource: 'automation', resourceId: taskId, details: { newJobId: newJob.id, retryDelay, attempt: oldJob.attempts + 1 } },
    })
  }

  private async failJobAndResult(taskId: string, automationResultId: string, message: string, resultType: string, startedAt: number): Promise<void> {
    await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: message, completedAt: new Date() } })
    await prisma.automationResult.update({
      where: { id: automationResultId },
      data: {
        status: 'failed',
        resultMessage: message,
        resultType,
        finishedAt: new Date(),
        duration: Date.now() - startedAt,
      },
    })
    this.stats.failed++
  }

  private async createErrorLog(jobId: string, message: string, screenshotPath?: string): Promise<void> {
    await prisma.errorLog.create({
      data: {
        jobId,
        errorCode: 'TASK_FAILED',
        errorTitle: 'خطای اجرا',
        errorDescription: message,
        suggestedSolution: 'تلاش مجدد',
        retryStatus: 'pending',
        screenshotPath,
      },
    }).catch(() => {})
  }

  private async log(jobId: string, level: string, message: string): Promise<void> {
    await prisma.jobLog.create({ data: { jobId, level, message } }).catch(() => {})
  }

  private delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
}
