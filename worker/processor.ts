import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { browserManager } from '../src/automation/browser/BrowserManager'
import { loginFlow } from '../src/automation/auth/LoginFlow'
import { WaybillFlow } from '../src/automation/waybill/WaybillFlow'
import type { WaybillData } from '../src/automation/interfaces'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

function decryptPassword(encrypted: string): string {
  const ALGORITHM = 'aes-256-cbc'
  const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
  const key = crypto.createHash('sha256').update(SECRET).digest()
  const [ivHex, data] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

export async function processWaybillJob(taskId: string): Promise<void> {
  const task = await prisma.job.findUnique({ where: { id: taskId } })
  if (!task) return

  await prisma.job.update({ where: { id: taskId }, data: { status: 'processing', startedAt: new Date() } })
  await log(taskId, 'info', 'شروع پردازش وظیفه')

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
    const job = await prisma.job.findUnique({ where: { id: taskId }, include: { profile: { include: { barbargAccount: true } } } })
    const accountId = job?.profile?.barbargAccount?.id || (task as Record<string, unknown>).accountId as string || 'default'

    await log(taskId, 'info', 'بارگذاری اطلاعات حساب از پایگاه داده...')
    let account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      account = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
    }
    if (!account) {
      await log(taskId, 'error', 'حساب یافت نشد')
      await failJobAndResult(taskId, automationResult.id, 'حساب یافت نشد', 'error', startedAt)
      return
    }

    // ------------------------------------------------------------------
    // ورود تازه در هر اجرا.
    // سشن این سایت عمر بسیار کوتاهی دارد و به IP هم حساس است، بنابراین
    // به سشن ذخیره‌شده اتکا نمی‌کنیم: هر بار از صفر لاگین می‌کنیم،
    // کپچا را حل می‌کنیم و مستقیم وارد صفحه‌ی عملیات می‌شویم.
    // ------------------------------------------------------------------
    await log(taskId, 'info', `حساب: ${account.username} | حالت: ورود تازه در هر اجرا`)

    await browserManager.launch(false)
    const page = await browserManager.createFreshPage(accountId)
    if (!page) throw new Error('خطا در ایجاد صفحه')

    const loginResult = await loginFlow.freshLogin(
      page,
      account.username,
      decryptPassword(account.passwordEncrypted),
      {
        maxCaptchaAttempts: 5,
        onStep: async (msg, level = 'info') => {
          await log(taskId, level === 'warn' ? 'warn' : level, msg)
        },
      },
    )

    if (!loginResult.success) {
      const screenshotDir = path.join(process.cwd(), 'automation-data', 'screenshots')
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
      const screenshotPath = path.join(screenshotDir, `login-failed-${accountId}-${Date.now()}.png`)
      try { await page.screenshot({ path: screenshotPath, fullPage: true }) } catch {}

      await prisma.barBargAccount.update({
        where: { id: account.id },
        data: { lastError: loginResult.error || 'ورود ناموفق' },
      }).catch(() => {})

      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'failed',
          accountId,
          resultMessage: loginResult.error || 'ورود ناموفق',
          resultType: 'error',
          errorCode: 'LOGIN_FAILED',
          screenshotPath,
          currentUrl: page.url(),
          finishedAt: new Date(),
          duration: Date.now() - startedAt,
        },
      })

      await log(taskId, 'error', `ورود ناموفق: ${loginResult.error} (تلاش کپچا: ${loginResult.captchaAttempts})`)
      await prisma.job.update({
        where: { id: taskId },
        data: { status: 'failed', error: loginResult.error || 'ورود ناموفق', completedAt: new Date() },
      })
      await browserManager.closePage(accountId)
      return
    }

    // نشست تازه را ذخیره کن (برای ابزارهای تشخیصی مفید است)
    await browserManager.saveSession(accountId).catch(() => {})
    await prisma.barBargAccount.update({
      where: { id: account.id },
      data: { lastLogin: new Date(), lastError: null },
    }).catch(() => {})
    await log(taskId, 'success', `ورود موفق (کپچا در ${loginResult.captchaAttempts} تلاش)`)

    await prisma.automationResult.update({
      where: { id: automationResult.id },
      data: { accountId, currentUrl: page.url() },
    })

    const flow = new WaybillFlow(page, accountId)

    // freshLogin قبلاً ما را به صفحه‌ی عملیات رسانده است؛ فقط اگر
    // به هر دلیلی جای دیگری بودیم، دوباره تلاش می‌کنیم.
    if (!page.url().toLowerCase().includes('hagigihogugi')) {
      await log(taskId, 'info', 'باز کردن فرم باربرگ...')
      const navigated = await flow.navigateToCreate()
      if (!navigated) throw new Error('خطا در باز کردن فرم')
    } else {
      await log(taskId, 'info', `فرم از قبل باز است: ${page.url()}`)
    }

    const waybillData = await resolveWaybillData(taskId)
    if (!waybillData) throw new Error('داده باربرگ یافت نشد')

    await log(taskId, 'info', 'پر کردن فرم...')
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

    const filled = await flow.fillForm(waybillData)
    if (!filled) throw new Error('خطا در پر کردن فرم')

    await delay(3000 + Math.random() * 5000)
    await log(taskId, 'info', 'بررسی کپچا...')
    const captchaResult = await flow.handleCaptcha()
    if (captchaResult.needsManual) {
      await log(taskId, 'warn', 'کپچا نیاز به حل دستی')
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

    await delay(3000 + Math.random() * 5000)
    await log(taskId, 'info', 'ارسال فرم...')
    const result = await flow.submit()

    const screenshotPath = await browserManager.screenshot(page, `result-${taskId}`)
    const htmlSnapshotPath = await browserManager.saveHtmlSnapshot(page, `result-${taskId}`)
    const pageKey = browserManager.getPageKeyForPage(page)
    const rawLog = pageKey ? browserManager.capturePageLog(pageKey) : browserManager.capturePlaywrightLog(page)
    const playwrightLog = JSON.parse(JSON.stringify(rawLog))

    if (result.success) {
      await browserManager.saveSession(accountId)
      await log(taskId, 'success', `ثبت موفق - ${result.resultMessage}`)
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
        await retryTask(taskId, automationResult.id, result.resultMessage)
      } else {
        await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: result.resultMessage, completedAt: new Date() } })
        await createErrorLog(taskId, result.resultMessage, screenshotPath)
        await prisma.activityLog.create({ data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: result.resultMessage } } })
      }
    }

    await browserManager.closePage(accountId)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'خطای ناشناخته'
    await log(taskId, 'error', msg)

    let screenshotPath: string | undefined
    let htmlSnapshotPath: string | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let playwrightLog: any

    try {
      const errAccountId = 'default'
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
      await retryTask(taskId, automationResult.id, msg)
    } else {
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: msg, completedAt: new Date() } })
      await createErrorLog(taskId, msg, screenshotPath)
      await prisma.activityLog.create({ data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: msg } } })
    }
  }
}

async function resolveWaybillData(taskId: string): Promise<WaybillData | null> {
  const job = await prisma.job.findUnique({
    where: { id: taskId },
    include: {
      profile: true,
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
  if (!job) return null

  if (job.profile) {
    const p = job.profile
    return {
      plateNumber: p.plateNumber,
      driverName: p.driverName,
      senderFirstName: p.senderFirstName,
      senderLastName: p.senderLastName,
      senderMobile: p.senderMobile,
      senderNationalId: p.senderNationalId,
      receiverFirstName: p.receiverFirstName,
      receiverLastName: p.receiverLastName,
      receiverMobile: p.receiverMobile,
      receiverNationalId: p.receiverNationalId,
      originProvince: p.originProvince,
      originCity: p.originCity,
      destProvince: p.destProvince,
      destCity: p.destCity,
      cargoName: p.cargoName,
      freightCost: p.freightCost || undefined,
    }
  }

  if (!job.waybill) return null
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

async function retryTask(taskId: string, automationResultId: string, errorMessage: string): Promise<void> {
  const oldJob = await prisma.job.findUnique({ where: { id: taskId } })
  if (!oldJob) return

  const retryIntervals = [10, 30, 60, 120, 300]
  const retryDelay = retryIntervals[oldJob.attempts] || retryIntervals[retryIntervals.length - 1] || 60

  const newJob = await prisma.job.create({
    data: {
      waybillId: oldJob.waybillId,
      profileId: oldJob.profileId,
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

  await log(taskId, 'info', `تلاش مجدد برنامه‌ریزی شد: Job ${newJob.id} در ${retryDelay} ثانیه`)
  await prisma.activityLog.create({
    data: { action: 'task_retry_scheduled', resource: 'automation', resourceId: taskId, details: { newJobId: newJob.id, retryDelay, attempt: oldJob.attempts + 1 } },
  })
}

async function failJobAndResult(taskId: string, automationResultId: string, message: string, resultType: string, startedAt: number): Promise<void> {
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
}

async function createErrorLog(jobId: string, message: string, screenshotPath?: string): Promise<void> {
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

async function log(jobId: string, level: string, message: string) {
  await prisma.jobLog.create({ data: { jobId, level, message } }).catch(() => {})
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
