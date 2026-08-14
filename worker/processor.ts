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
import { extractSmsCode } from '../src/lib/sms-code'

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

/** 🖥 [موقت] فقط در «قسمت اتوماسیون» (ورکر): بعد از رسیدن به گام آخر،
    مرورگر را باز نگه دار — هر نتیجه‌ای که بود (موفق یا ناموفق).
    پیش‌فرض روشن است. برای خاموش‌کردن موقت: BARBARG_KEEP_OPEN_ON_FINAL=false
    برای حذف کامل این قابلیت: همین بلاک و خط `keepOpenOnFinal:` پایین را بردارید. */
const KEEP_OPEN_ON_FINAL = process.env.BARBARG_KEEP_OPEN_ON_FINAL !== 'false'

/** خطاهایی که تکرارشان بی‌فایده است */
const PERMANENT = /مختصات انتخابی نامعتبر|کد ملی|کدملی|شناسه ملی|اعتبار کافی|موجودی|تکراری|مجوز|دسترسی ندارید|رمز|کلمه عبور|کاربری یافت نشد|قفل|مسدود|غیرفعال|صدور غیر مجاز بارنامه شهری|محدودیت در صدور بارنامه شهری|لیست سیاه سامانه|لیست سیاه/

/** سقف شروع مجدد داخل موتور (بلاک IP / سرور مشغول / WAF) */
const MAX_RESTARTS = Number(process.env.BARBARG_MAX_RESTARTS || 20)

/** بعد از ثبت موفق واقعی، برای همان ترکیب «اکانت + پلاک» این بازه صبر می‌کنیم. پیش‌فرض: ۳۰ تا ۳۵ دقیقه. */
const SUCCESS_COOLDOWN_MIN_MS = Number(process.env.BARBARG_SUCCESS_COOLDOWN_MIN_MS || 30 * 60 * 1000)
const SUCCESS_COOLDOWN_MAX_MS = Number(process.env.BARBARG_SUCCESS_COOLDOWN_MAX_MS || 35 * 60 * 1000)

function normalisePlateForCooldown(v: string): string {
  return String(v || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '')
    .trim()
}

function cooldownKey(accountId: string, plateNumber: string): string {
  const safePlate = normalisePlateForCooldown(plateNumber).replace(/[^\w\u0600-\u06FF-]/g, '')
  return `automation.successCooldown.${accountId}.${safePlate}`
}

function fmtWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m} دقیقه و ${s} ثانیه` : `${s} ثانیه`
}

function randomSuccessCooldownMs(): number {
  const min = Math.min(SUCCESS_COOLDOWN_MIN_MS, SUCCESS_COOLDOWN_MAX_MS)
  const max = Math.max(SUCCESS_COOLDOWN_MIN_MS, SUCCESS_COOLDOWN_MAX_MS)
  return Math.floor(min + Math.random() * (max - min + 1))
}

async function getPairCooldownUntil(accountId: string, plateNumber: string): Promise<Date | null> {
  const rec = await prisma.setting.findUnique({ where: { key: cooldownKey(accountId, plateNumber) } }).catch(() => null)
  const value = rec?.value as { until?: string } | null | undefined
  const until = value?.until ? new Date(value.until) : null
  return until && Number.isFinite(until.getTime()) ? until : null
}

async function setPairSuccessCooldown(accountId: string, plateNumber: string): Promise<{ until: Date; waitMs: number }> {
  const waitMs = randomSuccessCooldownMs()
  const until = new Date(Date.now() + waitMs)
  await prisma.setting.upsert({
    where: { key: cooldownKey(accountId, plateNumber) },
    update: { value: { until: until.toISOString(), accountId, plateNumber, reason: 'success', updatedAt: new Date().toISOString() } },
    create: { key: cooldownKey(accountId, plateNumber), value: { until: until.toISOString(), accountId, plateNumber, reason: 'success', updatedAt: new Date().toISOString() } },
  }).catch(() => {})
  return { until, waitMs }
}

async function waitForPairCooldown(taskId: string, accountId: string, plateNumber: string): Promise<boolean> {
  const until = await getPairCooldownUntil(accountId, plateNumber)
  if (!until) return true

  let remaining = until.getTime() - Date.now()
  if (remaining <= 0) return true

  await log(taskId, 'warn', `برای همین اکانت و پلاک، ثبت موفق قبلی وجود دارد؛ شروع این عملیات ${fmtWait(remaining)} عقب می‌افتد`)

  while (remaining > 0) {
    const now = await prisma.job.findUnique({ where: { id: taskId }, select: { status: true } }).catch(() => null)
    if (now?.status === 'cancelled') {
      await log(taskId, 'warn', 'وظیفه هنگام انتظار فاصله بعد از ثبت موفق لغو شد')
      return false
    }
    await new Promise((r) => setTimeout(r, Math.min(15_000, remaining)))
    remaining = until.getTime() - Date.now()
  }

  await log(taskId, 'info', 'فاصله اجباری بعد از ثبت موفق قبلی تمام شد؛ عملیات شروع می‌شود')
  return true
}

/**
 * ساخت اعلان برای زنگوله‌ی پنل.
 * فقط رویدادهای مهم — نه هر خطای کوچکی.
 */
async function notify(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') {
  await prisma.notification.create({
    data: { title, message: message.slice(0, 300), type },
  }).catch(() => {})
}

function createOtpCodeProvider(accountId: string, listenAfter: Date, taskId: string) {
  /* پیامک‌هایی که قبلاً خوانده و «استفاده‌شده» شده‌اند را دنبال می‌کنیم تا
     در تلاش بعدی همان کد قدیمی برنگردد و در عوض پیامک جدیدتر خوانده شود.
     (قبلا کد یک بار کش می‌شد و تلاش دوم همیشه همان کد قبلی را می‌گرفت.) */
  const usedSmsIds = new Set<string>()
  return async () => {
    const smsList = await prisma.smsMessage.findMany({
      where: {
        accountId,
        status: 'pending',
        createdAt: { gte: listenAfter },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => [])

    for (const sms of smsList) {
      if (usedSmsIds.has(sms.id)) continue
      const code = extractSmsCode(`${sms.rawText || ''} ${sms.resultMessage || ''}`)
      if (!code) continue
      usedSmsIds.add(sms.id)
      await prisma.smsMessage.update({
        where: { id: sms.id },
        data: { status: 'used', usedAt: new Date(), resultMessage: `کد ورود برای ثبت نهایی استفاده شد: ${code}` },
      }).catch(() => {})
      await log(taskId, 'success', `کد پیامکی جدید دریافت شد و برای OTP نهایی استفاده می‌شود: ${code}`)
      return code
    }
    return ''
  }
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

    // اگر برای همین «اکانت + پلاک» ثبت موفق قبلی داشته‌ایم، قبل از شروع عملیات بعدی ۵ تا ۱۵ دقیقه صبر می‌کنیم.
    const cooldownOk = await waitForPairCooldown(taskId, account.id, profile.plateNumber)
    if (!cooldownOk) {
      await prisma.job.update({
        where: { id: taskId },
        data: { status: 'cancelled', error: 'هنگام انتظار فاصله اجباری لغو شد', completedAt: new Date() },
      }).catch(() => {})
      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'cancelled', resultMessage: 'هنگام انتظار فاصله اجباری لغو شد', resultType: 'warning',
          finishedAt: new Date(), duration: Date.now() - startedAt,
        },
      }).catch(() => {})
      return
    }

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

    /* مشخصات را همین اول در نتیجه ثبت کن — حتی اگر بعدا شکست بخورد،
       در صفحه‌ی نتایج معلوم باشد برای کدام پلاک و راننده بود.

       نکته: ستون accountId به جدول Account اشاره دارد ولی ما از
       BarBargAccount استفاده می‌کنیم؛ پس مشخصات حساب را در
       فیلدهای متنی ذخیره می‌کنیم (نقض کلید خارجی رخ ندهد). */
    await prisma.automationResult.update({
      where: { id: automationResult.id },
      data: {
        plate: profile.plateNumber,
        driver: data.driver.name,
        vehicle: `${data.driver.name}${data.driver.nationalId ? ` (${data.driver.nationalId})` : ''}`,
        sender: `${data.sender.firstName} ${data.sender.lastName}`.trim(),
        receiver: `${data.receiver.firstName} ${data.receiver.lastName}`.trim(),
      },
    }).catch(() => {})
    await log(taskId, 'info', DO_SUBMIT ? 'حالت: ثبت واقعی' : 'حالت: آزمایشی (dry-run) — دکمه ثبت نهایی زده نمی‌شود')

    // ─── ۳) اجرای موتور (همان test-step1.js) ───
    const otpListenAfter = new Date(Date.now() - 30 * 1000)
    const getOtpCode = createOtpCodeProvider(account.id, otpListenAfter, taskId)

    const result = await engine.runWaybill({
      credentials: { username: account.username, password: decryptPassword(account.passwordEncrypted) },
      data,
      submit: DO_SUBMIT,
      headless: HEADLESS,
      maxRestarts: MAX_RESTARTS,
      keepOpenOnFinal: KEEP_OPEN_ON_FINAL,
      getOtpCode,
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
        : (DO_SUBMIT
            ? 'ثبت با موفقیت انجام شد — رسید نهایی «سند حمل صادر گردید» در سایت نمایش داده شد (کد رهگیری خوانده نشد)'
            : 'همه گام‌ها موفق (حالت آزمایشی — ثبت نهایی انجام نشد)')

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
      const cooldown = DO_SUBMIT
        ? await setPairSuccessCooldown(account.id, profile.plateNumber)
        : null
      if (cooldown) {
        await log(
          taskId,
          'success',
          `فاصله بعد از ثبت موفق برای همین اکانت و پلاک تنظیم شد: ${fmtWait(cooldown.waitMs)} (تا ${cooldown.until.toLocaleString('fa-IR')})`,
        )
      }

      const nextRunAfterSuccess = cooldown
        ? (profile.nextRun && profile.nextRun > cooldown.until ? profile.nextRun : cooldown.until)
        : profile.nextRun

      await prisma.registrationProfile.update({
        where: { id: profile.id },
        data: {
          lastRun: new Date(),
          nextRun: nextRunAfterSuccess,
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

    /* ─── کد یکبارمصرف (OTP) ───
       از قیف «غیرفعال‌سازی حساب» جدا شد: نرسیدن یا ثبت‌نشدن کد پیامکی
       لزوماً مشکل حساب نیست (ممکن است پیامک دیر برسد یا اپراتور مشکل
       داشته باشد). فقط همین وظیفه ناموفق می‌شود و جزئیات ثبت می‌گردد. */
    if (kind === 'otp_failed') {
      await log(taskId, 'error', errMsg)
      await log(taskId, 'warn', 'کد یکبارمصرف کامل نشد — وظیفه ناموفق ثبت شد ولی حساب غیرفعال نشد (ممکن است پیامک دیر رسیده باشد)')
      await notify('کد یکبارمصرف حساب باربگ ثبت نشد', `پلاک ${profile.plateNumber}: ${errMsg}`, 'warning')
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: errMsg, completedAt: new Date() } })
      await createErrorLog(taskId, errMsg)
      return
    }

    /* ─── خطاهای قطعی مربوط به خود حساب باربگ ───
       این خطاها با تکرار حل نمی‌شوند. علاوه بر متوقف کردن این وظیفه:
         ۱) حساب غیرفعال می‌شود تا بقیه‌ی وظایف هم بی‌خود تلاش نکنند
         ۲) وظایف در انتظار همین حساب لغو می‌شوند
         ۳) اعلان ساخته می‌شود تا کاربر فورا بفهمد
       نمونه‌ها: رمز اشتباه، حساب قفل/مسدود، محدودیت موقت صدور بارنامه شهری. */
    if (kind === 'bad_credentials' || kind === 'account_locked' || kind === 'account_restricted') {
      const isLocked = kind === 'account_locked'
      const isRestricted = kind === 'account_restricted'
      const title = isRestricted
        ? 'حساب باربگ برای صدور بارنامه شهری محدود شده است'
        : (isLocked ? 'حساب باربگ مسدود است' : 'مشخصات حساب باربگ اشتباه است')

      await log(taskId, 'error', errMsg)
      await log(taskId, 'error', `حساب «${account.accountName}» (${account.username}) غیرفعال شد`)

      // ۱) حساب را غیرفعال کن
      await prisma.barBargAccount.update({
        where: { id: account.id },
        data: { status: 'inactive', lastError: errMsg },
      }).catch(() => {})

      // ۲) وظایف در انتظار همین حساب را لغو کن
      let cancelled = 0
      try {
        const victims = await prisma.job.findMany({
          where: { status: 'pending', profile: { accountId: account.id } },
          select: { id: true },
        })
        if (victims.length) {
          const ids = victims.map((v) => v.id)
          await prisma.job.updateMany({
            where: { id: { in: ids } },
            data: { status: 'cancelled', error: title, completedAt: new Date() },
          })
          cancelled = ids.length

          const { automationQueue } = await import('./queue')
          const queued = await automationQueue.getJobs(['waiting', 'delayed', 'paused'])
          for (const qj of queued) {
            if (!ids.includes(qj?.data?.taskId)) continue
            try { await qj.remove() } catch { /* مهم نیست */ }
          }
        }
      } catch { /* لغو دسته‌جمعی بهتره ولی الزامی نیست */ }

      if (cancelled > 0) {
        await log(taskId, 'warn', `${cancelled} وظیفه‌ی در انتظار این حساب لغو شد`)
      }

      // ۳) اعلان
      await notify(
        title,
        `حساب «${account.accountName}» (${account.username}): ${errMsg}` +
        (cancelled > 0 ? ` — ${cancelled} وظیفه‌ی در انتظار لغو شد.` : ''),
        'error',
      )

      await prisma.job.update({
        where: { id: taskId },
        data: { status: 'failed', error: errMsg, completedAt: new Date() },
      })
      await createErrorLog(taskId, errMsg)
      return
    }

    if (kind === 'driver_plate_not_found') {
      const title = 'راننده یا پلاک در سامانه پیدا نشد'
      await log(taskId, 'error', 'بعد از ۳ تلاش داخل گام ۳ و ۱۰ شروع مجدد کامل، راننده یا پلاک پیدا نشد')
      await log(taskId, 'error', errMsg)

      let cancelled = 0
      try {
        const victims = await prisma.job.findMany({
          where: { status: 'pending', profileId: profile.id },
          select: { id: true },
        })
        if (victims.length) {
          const ids = victims.map((v) => v.id)
          await prisma.job.updateMany({
            where: { id: { in: ids } },
            data: { status: 'cancelled', error: title, completedAt: new Date() },
          })
          cancelled = ids.length
          const { automationQueue } = await import('./queue')
          const queued = await automationQueue.getJobs(['waiting', 'delayed', 'paused'])
          for (const qj of queued) {
            if (!ids.includes(qj?.data?.taskId)) continue
            try { await qj.remove() } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }

      await notify(title, `پروفایل «${profile.name}» | پلاک ${profile.plateNumber}: ${errMsg}` + (cancelled ? ` — ${cancelled} وظیفه در انتظار لغو شد.` : ''), 'error')
      await prisma.job.update({ where: { id: taskId }, data: { status: 'failed', error: title + ': ' + errMsg, completedAt: new Date() } })
      await prisma.automationResult.update({
        where: { id: automationResult.id },
        data: {
          status: 'failed', resultMessage: title + ': ' + errMsg, resultType: 'error',
          errorCode: 'DRIVER_PLATE_NOT_FOUND', finishedAt: new Date(), duration: Date.now() - startedAt,
        },
      }).catch(() => {})
      await prisma.registrationProfile.update({
        where: { id: profile.id },
        data: { lastError: title + ': ' + errMsg, failedRuns: { increment: 1 } },
      }).catch(() => {})
      await createErrorLog(taskId, title + ': ' + errMsg)
    } else if (PERMANENT.test(errMsg) || kind === 'permanent') {
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
