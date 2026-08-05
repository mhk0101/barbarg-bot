/**
 * worker/processor.ts — پردازشگر وظایف تب «اتوماسیون ← مرکز کنترل»
 * ═══════════════════════════════════════════════════════════════════
 *  این فایل دیگر منطق مخصوص به خودش ندارد.
 *  کل کار به src/automation/engine/step1-engine.js سپرده می‌شود —
 *  همان کدی که `node test-step1.js` اجرا می‌کند.
 *  پس هر چیزی که در تستر کار می‌کند، اینجا هم دقیقا همان‌طور کار می‌کند.
 * ═══════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import crypto from 'crypto'

/**
 * موتور مشترک با test-step1.js — به‌صورت پویا بارگذاری می‌شود تا هم در
 * حالت ESM و هم CommonJS (tsx / next) بدون مشکل کار کند.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null
async function getEngine() {
  if (engine) return engine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('../src/automation/engine/step1-engine.js')
  engine = mod?.runWaybill ? mod : (mod?.default ?? mod)
  if (!engine?.runWaybill) throw new Error('موتور ثبت بارنامه بارگذاری نشد (step1-engine.js)')
  return engine
}

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

/** آیا موتور باید دکمه‌ی «ثبت نهایی سند حمل» را واقعا بزند؟ */
const DO_SUBMIT = process.env.BARBARG_SUBMIT !== 'false'   // پیش‌فرض: ثبت واقعی
/** مرورگر دیده شود یا نه (مثل تستر پیش‌فرض دیده می‌شود) */
const HEADLESS = process.env.BARBARG_HEADLESS === 'true'

/** خطاهایی که تکرارشان بی‌فایده است */
const PERMANENT = /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید|رمز|کلمه عبور|کاربری یافت نشد|قفل|مسدود|غیرفعال/

/** سقف شروع مجدد داخل موتور (بلاک IP / سرور مشغول / WAF) */
const MAX_RESTARTS = Number(process.env.BARBARG_MAX_RESTARTS || 20)

/**
 * ساخت اعلان برای زنگوله‌ی پنل.
 * فقط رویدادهای مهم — نه هر خطای کوچکی.
 */
async function notify(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') {
  await prisma.notification.create({
    data: { title, message: message.slice(0, 300), type },
  }).catch(() => {})
}

export async function processWaybillJob(taskId: string): Promise<void> {
  const task = await prisma.job.findUnique({ where: { id: taskId } })
  if (!task) return

  /* ممکن است کاربر در فاصله‌ی صف تا اجرا، وظیفه را لغو کرده باشد. */
  if (task.status === 'cancelled') {
    console.log(`[Worker] Job ${taskId} لغو شده بود — اجرا نمی‌شود`)
    await log(taskId, 'warn', 'وظیفه لغو شده بود — اجرا نشد')
    return
  }
  if (task.status === 'completed') {
    console.log(`[Worker] Job ${taskId} قبلا تمام شده — رد می‌شود`)
    return
  }

  await prisma.job.update({ where: { id: taskId }, data: { status: 'processing', startedAt: new Date() } })
  await log(taskId, 'info', 'شروع پردازش وظیفه')

  const automationResult = await prisma.automationResult.create({
    data: { taskId, status: 'running', startedAt: new Date(), retryCount: task.attempts },
  })

  const startedAt = Date.now()

  try {
    const engine = await getEngine()

    // ─── ۱) پروفایل و حساب ───
    const job = await prisma.job.findUnique({
      where: { id: taskId },
      include: { profile: { include: { barbargAccount: true } } },
    })

    const profile = job?.profile
    if (!profile) {
      const msg = 'پروفایل ثبت به این وظیفه وصل نیست — از صفحه «پروفایل‌ها» یک پروفایل بسازید و از «مرکز کنترل» دوباره به صف اضافه کنید'
      await log(taskId, 'error', msg)
      await failJobAndResult(taskId, automationResult.id, msg, 'error', startedAt)
      return
    }

    let account = profile.barbargAccount
    if (!account) account = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
    if (!account) {
      const msg = 'هیچ حساب باربگ فعالی یافت نشد'
      await log(taskId, 'error', msg)
      await failJobAndResult(taskId, automationResult.id, msg, 'error', startedAt)
      return
    }

    await log(taskId, 'info', `پروفایل: ${profile.name} | پلاک: ${profile.plateNumber} | حساب: ${account.username}`)

    // ─── ۲) داده‌ی پروفایل → قالب موتور ───
    const data = engine.profileToData(profile)
    const missing: string[] = engine.validateData(data)
    if (missing.length) {
      const msg = `فیلدهای اجباری خالی‌اند: ${missing.join('، ')}`
      await log(taskId, 'error', msg)
      await failJobAndResult(taskId, automationResult.id, msg, 'error', startedAt)
      return
    }

    await log(taskId, 'info',
      `داده آماده — راننده ${data.driver.name} | کالا ${data.cargo.name} ${data.cargo.weightTon} تن | ` +
      `${data.origin.city} ← ${data.destination.city}`)
    await log(taskId, 'info', DO_SUBMIT ? 'حالت: ثبت واقعی' : 'حالت: آزمایشی (dry-run) — دکمه ثبت نهایی زده نمی‌شود')

    // ─── ۳) اجرای موتور (همان test-step1.js) ───
    const result = await engine.runWaybill({
      credentials: { username: account.username, password: decryptPassword(account.passwordEncrypted) },
      data,
      submit: DO_SUBMIT,
      headless: HEADLESS,
      maxRestarts: MAX_RESTARTS,
      onLog: (line: string) => {
        const clean = String(line).replace(/^\s*\n/, '').trim()
        if (!clean) return
        const level = /✖|❌|🛑|خطا/.test(clean) ? 'error'
                    : /⚠|↻/.test(clean) ? 'warn'
                    : /✅|🎉|✔/.test(clean) ? 'success' : 'info'
        void log(taskId, level, clean.slice(0, 500))
      },
      onStep: async (n: number, ok: boolean, label: string) => {
        await log(taskId, ok ? 'success' : 'error', `گام ${n} (${label}): ${ok ? 'موفق' : 'ناموفق'}`)
      },

      /* اگر کاربر وسط کار از صف وظایف «لغو» بزند، موتور باید بایستد.
         قبلا لغو فقط دیتابیس را عوض می‌کرد و موتور تا ساعت‌ها ادامه می‌داد. */
      shouldStop: async () => {
        const now = await prisma.job.findUnique({
          where: { id: taskId },
          select: { status: true },
        }).catch(() => null)
        if (now?.status === 'cancelled') {
          await log(taskId, 'warn', 'درخواست لغو دریافت شد — متوقف می‌شویم')
          return true
        }
        return false
      },
    })

    await prisma.barBargAccount.update({
      where: { id: account.id },
      data: { lastLogin: new Date(), lastError: result.success ? null : (result.error ?? null) },
    }).catch(() => {})

    // ─── ۴) ثبت نتیجه ───
    if (result.success) {
      const message = result.trackingCode
        ? `ثبت شد — کد رهگیری ${result.trackingCode}`
        : 'همه گام‌ها موفق (حالت آزمایشی — ثبت نهایی انجام نشد)'

      await log(taskId, 'success', message)
      await prisma.job.update({
        where: { id: taskId },
        data: { status: 'completed', result: result.trackingCode || message, completedAt: new Date() },
      })
      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'completed',
          resultMessage: message,
          resultType: 'success',
          waybillNumber: result.trackingCode ?? undefined,
          finishedAt: new Date(),
          duration: Date.now() - startedAt,
        },
      })
      await prisma.registrationProfile.update({
        where: { id: profile.id },
        data: {
          lastRun: new Date(),
          totalRuns: { increment: 1 },
          successfulRuns: { increment: 1 },
          lastError: null,
        },
      }).catch(() => {})
      await prisma.activityLog.create({
        data: { action: 'task_completed', resource: 'automation', resourceId: taskId },
      }).catch(() => {})

      if (result.trackingCode) {
        await notify(
          'بارنامه ثبت شد',
          `پلاک ${profile.plateNumber} — کد رهگیری ${result.trackingCode}`,
          'success',
        )
      }
      return
    }

    // ─── لغو شده توسط کاربر ───
    if (result.kind === 'stopped') {
      await log(taskId, 'warn', 'وظیفه توسط کاربر لغو شد')
      await prisma.job.update({
        where: { id: taskId },
        data: { status: 'cancelled', error: 'توسط کاربر لغو شد', completedAt: new Date() },
      }).catch(() => {})
      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'cancelled', resultMessage: 'توسط کاربر لغو شد', resultType: 'warning',
          finishedAt: new Date(), duration: Date.now() - startedAt,
        },
      }).catch(() => {})
      return
    }

    // ─── ناموفق ───
    const errMsg = result.error || `گام «${result.lastStep ?? '?'}» ناموفق بود`
    await log(taskId, 'error', errMsg)

    await prisma.automationResult.update({
      where: { id: automationResult.id },
      data: {
        status: 'failed',
        resultMessage: errMsg,
        resultType: 'error',
        errorCode: 'SUBMISSION_FAILED',
        finishedAt: new Date(),
        duration: Date.now() - startedAt,
      },
    })
    await prisma.registrationProfile.update({
      where: { id: profile.id },
      data: { lastRun: new Date(), totalRuns: { increment: 1 }, failedRuns: { increment: 1 }, lastError: errMsg },
    }).catch(() => {})

    const kind = String(result.kind || 'error')

    /* فقط وقتی تسلیم می‌شویم که موتور واقعا سقف بلندش را خرج کرده باشد.

       block / waf → سقف ۲۰ بار داخل موتور ∷ تکرار دوباره بی‌فایده است
       busy / timeout → سقف فقط ۵ بار است (حدود ۱۸ دقیقه) ∷ سایت ممکن
         است نیم ساعت بعد سالم باشد، پس وظیفه باید دوباره در صف برود
       dead / login → مشکل محلی است، تکرار منطقی است */
    const engineExhausted = ['block', 'waf'].includes(kind)

    if (PERMANENT.test(errMsg) || kind === 'permanent') {
      await log(taskId, 'error', 'خطای دائمی — تلاش مجدد انجام نمی‌شود، داده را اصلاح کنید')
      await notify('خطای دائمی — نیاز به بررسی', `پلاک ${profile.plateNumber}: ${errMsg}`, 'error')
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: errMsg, completedAt: new Date() } })
      await createErrorLog(taskId, errMsg)
    } else if (engineExhausted) {
      const label = kind === 'waf' ? 'چالش امنیتی WAF' : 'بلاک IP'
      await log(taskId, 'error',
        `${label}: موتور تا ${MAX_RESTARTS} بار تلاش کرد و سایت پاسخ نداد — وظیفه متوقف شد`)
      await notify(label, `پلاک ${profile.plateNumber}: بعد از ${MAX_RESTARTS} تلاش متوقف شد`, 'error')
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: errMsg, completedAt: new Date() } })
      await createErrorLog(taskId, errMsg)
    } else if (task.attempts < task.maxRetries) {
      await retryTask(taskId, automationResult.id, errMsg, kind)
    } else {
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: errMsg, completedAt: new Date() } })
      await createErrorLog(taskId, errMsg)
      await prisma.activityLog.create({
        data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: errMsg } },
      }).catch(() => {})
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'خطای ناشناخته'
    await log(taskId, 'error', msg)

    await prisma.automationResult.update({
      where: { id: automationResult.id },
      data: {
        status: 'failed',
        resultMessage: msg,
        resultType: 'error',
        errorCode: 'EXCEPTION',
        finishedAt: new Date(),
        duration: Date.now() - startedAt,
      },
    }).catch(() => {})

    if (task.attempts < task.maxRetries) {
      await retryTask(taskId, automationResult.id, msg)
    } else {
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: msg, completedAt: new Date() } })
      await createErrorLog(taskId, msg)
      await prisma.activityLog.create({
        data: { action: 'task_failed', resource: 'automation', resourceId: taskId, details: { error: msg } },
      }).catch(() => {})
    }
  }
}

async function retryTask(
  taskId: string, automationResultId: string, errorMessage: string, kind = 'error',
): Promise<void> {
  const oldJob = await prisma.job.findUnique({ where: { id: taskId } })
  if (!oldJob) return

  /* فاصله‌ی تلاش مجدد بر اساس نوع خطا:

       خطای گام/داده → ۱۰ ثانیه تا ۵ دقیقه (ممکن است فوری حل شود)
       سرور مشغول/تایم‌اوت → ۱۰ تا ۶۰ دقیقه

     موتور قبلا ۵ بار (حدود ۱۸ دقیقه) تلاش کرده؛ تکرار زودهنگام
     فقط فشار بی‌فایده روی سایتی است که الان مریض است. */
  const SITE_DOWN = ['busy', 'timeout', 'block', 'waf'].includes(kind)
  const retryIntervals = SITE_DOWN
    ? [10 * 60, 20 * 60, 30 * 60, 45 * 60, 60 * 60]
    : [10, 30, 60, 120, 300]
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

  await prisma.job.update({
    where: { id: taskId },
    data: { status: 'failed', error: errorMessage, completedAt: new Date() },
  })

  /* ⚠ مهم: جاب جدید باید به صف Redis هم اضافه شود.
     قبلا فقط در دیتابیس ساخته می‌شد (status: 'pending') ولی هرگز
     به صف اضافه نمی‌شد. ورکر فقط از Redis کار برمی‌دارد، پس جاب
     برای همیشه در حالت «در انتظار» می‌ماند و هیچ‌وقت اجرا نمی‌شد. */
  try {
    const { automationQueue } = await import('./queue')
    const profile = oldJob.profileId
      ? await prisma.registrationProfile.findUnique({
          where: { id: oldJob.profileId },
          select: { plateNumber: true, accountId: true },
        })
      : null

    await automationQueue.add(
      'process-waybill',
      {
        taskId: newJob.id,
        plateNumber: profile?.plateNumber || '',
        accountId: profile?.accountId || '',
        jobIndex: 0,
        totalJobs: 1,
      },
      { delay: retryDelay * 1000, priority: oldJob.priority },
    )
    await log(taskId, 'info', `تلاش مجدد برنامه‌ریزی شد: Job ${newJob.id} در ${retryDelay} ثانیه`)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    await log(taskId, 'error',
      `جاب تلاش مجدد ساخته شد ولی به صف اضافه نشد (Redis در دسترس نیست؟): ${m}`)
    // جاب یتیم را علامت بزن تا در صف وظایف گمراه‌کننده نباشد
    await prisma.job.update({
      where: { id: newJob.id },
      data: { status: 'failed', error: 'به صف اضافه نشد: ' + m, completedAt: new Date() },
    }).catch(() => {})
  }

  await prisma.activityLog.create({
    data: {
      action: 'task_retry_scheduled', resource: 'automation', resourceId: taskId,
      details: { newJobId: newJob.id, retryDelay, attempt: oldJob.attempts + 1 },
    },
  }).catch(() => {})
}

async function failJobAndResult(
  taskId: string, automationResultId: string, message: string, resultType: string, startedAt: number,
): Promise<void> {
  await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: message, completedAt: new Date() } })
  await prisma.automationResult.update({
    where: { id: automationResultId },
    data: {
      status: 'failed', resultMessage: message, resultType,
      finishedAt: new Date(), duration: Date.now() - startedAt,
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
