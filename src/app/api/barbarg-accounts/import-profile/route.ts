/**
 * واردات خودکار مشخصات از آخرین بارنامه‌ی حساب
 *
 *   ورود → /barname/History/History → «جزئیات» → RealBarnameDetail
 *   → خواندن همه‌ی فیلدها → ساخت پروفایل
 *
 * POST { accountId, createProfile?: boolean }
 *   createProfile = false (پیش‌فرض) → فقط داده را برمی‌گرداند تا کاربر ببیند
 *   createProfile = true            → پروفایل را در دیتابیس هم می‌سازد
 */
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null
async function getEngine() {
  if (engine) return engine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('@/automation/engine/step1-engine.js')
  engine = mod?.importLastBarname ? mod : (mod?.default ?? mod)
  if (!engine?.importLastBarname) throw new Error('موتور بارگذاری نشد')
  return engine
}

function decryptPassword(encrypted: string): string {
  const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
  const key = crypto.createHash('sha256').update(SECRET).digest()
  const [ivHex, data] = encrypted.split(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
  let out = decipher.update(data, 'hex', 'utf8')
  out += decipher.final('utf8')
  return out
}


type ImportStatus = 'running' | 'success' | 'failed' | 'cancelled'
interface ImportSession {
  accountId: string
  status: ImportStatus
  logs: string[]
  error: string | null
  data: any | null
  profileId: string | null
  startedAt: number
  updatedAt: number
  stopRequested: boolean
  attempt: number
  browser?: any
}
const importSessions = new Map<string, ImportSession>()
const FINISHED_KEEP_MS = 30 * 60 * 1000

function pushImportLog(s: ImportSession, line: string) {
  const t = String(line || '').trim()
  if (!t) return
  s.logs.push(`${new Date().toLocaleTimeString('fa-IR')}  ${t.slice(0, 500)}`)
  if (s.logs.length > 500) s.logs.splice(0, s.logs.length - 500)
  s.updatedAt = Date.now()
}
function finishImportSession(s: ImportSession, status: ImportStatus, error?: string) {
  s.status = status
  if (error) s.error = error
  s.updatedAt = Date.now()
  setTimeout(() => importSessions.delete(s.accountId), FINISHED_KEEP_MS).unref?.()
}
const RETRYABLE_IMPORT_KINDS = new Set(['block', 'busy', 'timeout', 'waf', 'dead', 'login', 'error'])
function importWaitMs(kind?: string) {
  if (kind === 'block' || kind === 'waf') return 3 * 60 * 1000 + Math.random() * 2 * 60 * 1000
  if (kind === 'busy' || kind === 'timeout') return 2 * 60 * 1000 + Math.random() * 3 * 60 * 1000
  return 15 * 1000
}
async function sleepAbortable(ms: number, s: ImportSession) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (s.stopRequested) throw new Error('توسط کاربر متوقف شد')
    await new Promise((r) => setTimeout(r, Math.min(5000, until - Date.now())))
  }
}

async function createProfileFromImportResult(account: any, d: any, result: any) {
  const accNid = String(account.username || '').replace(/\D/g, '')
  const profileName =
    (d.driverName && String(d.driverName).trim()) ||
    (d.plateNumber && `پروفایل ${d.plateNumber}`) ||
    d.name ||
    `وارد‌شده از ${account.accountName}`

  return prisma.registrationProfile.create({
    data: {
      name: profileName,
      status: 'active',
      senderType: 'حقیقی',
      senderFirstName: d.senderFirstName || '',
      senderLastName: d.senderLastName || '',
      senderMobile: '',
      senderNationalId: accNid,
      receiverType: 'حقیقی',
      receiverFirstName: d.receiverFirstName || '',
      receiverLastName: d.receiverLastName || '',
      receiverMobile: '',
      receiverNationalId: accNid,
      plateNumber: d.plateNumber || '',
      driverName: d.driverName || '',
      driverNationalId: d.driverNationalId || accNid,
      cargoName: d.cargoName || '',
      cargoPackaging: d.cargoPackaging || null,
      cargoQuantity: d.cargoQuantity || null,
      cargoWeight: d.cargoWeight || null,
      cargoValue: d.cargoValue || null,
      insuranceAmount: d.insuranceAmount || null,
      originProvince: d.originProvince || '',
      originCity: d.originCity || '',
      originAddress: d.originAddress || null,
      destProvince: d.destProvince || '',
      destCity: d.destCity || '',
      destAddress: d.destAddress || null,
      notes: d.trackingCode ? `به‌صورت خودکار از بارنامه ${d.trackingCode} وارد شد` : 'به‌صورت خودکار وارد شد',
      barbargAccount: { connect: { id: account.id } },
    },
  })
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const { accountId, createProfile = false, async: asyncMode = false, action } = body

    if (!accountId) {
      return NextResponse.json({ error: 'شناسه حساب الزامی است' }, { status: 400 })
    }

    if (action === 'cancel') {
      const s = importSessions.get(accountId)
      if (s && s.status === 'running') {
        s.stopRequested = true
        s.status = 'cancelled'
        s.error = 'توسط کاربر متوقف شد'
        pushImportLog(s, 'عملیات توسط کاربر متوقف شد')
        if (s.browser) await s.browser.close().catch(() => {})
        finishImportSession(s, 'cancelled', 'توسط کاربر متوقف شد')
      }
      return NextResponse.json({ success: true })
    }

    const account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'حساب یافت نشد' }, { status: 404 })
    }

    if (asyncMode) {
      const existing = importSessions.get(accountId)
      if (existing && existing.status === 'running') {
        return NextResponse.json({ success: true, sessionId: accountId, status: existing.status, logs: existing.logs })
      }

      const session: ImportSession = {
        accountId, status: 'running', logs: [], error: null, data: null, profileId: null,
        startedAt: Date.now(), updatedAt: Date.now(), stopRequested: false, attempt: 0, browser: null,
      }
      importSessions.set(accountId, session)
      pushImportLog(session, `شروع دریافت اطلاعات برای حساب «${account.accountName}»؛ تا زمان توقف کاربر ادامه می‌دهد`)

      ;(async () => {
        const eng = await getEngine()
        while (!session.stopRequested) {
          session.attempt += 1
          pushImportLog(session, `تلاش ${session.attempt}: ورود به سامانه و خواندن آخرین بارنامه...`)
          try {
            const result = await eng.importLastBarname({
              credentials: { username: account.username, password: decryptPassword(account.passwordEncrypted) },
              headless: process.env.BARBARG_HEADLESS === 'true',
              fast: true,
              onBrowser: (browser: any) => { session.browser = browser },
              shouldStop: () => session.stopRequested || session.status === 'cancelled',
              onLog: (line: string) => pushImportLog(session, line),
            })

            if (session.stopRequested || result.kind === 'stopped') break

            if (result.success) {
              await prisma.barBargAccount.update({ where: { id: account.id }, data: { lastLogin: new Date(), lastError: null } }).catch(() => {})
              const d = result.data
              const nid = String(account.username || '').replace(/\D/g, '')
              if (nid) {
                if (!d.driverNationalId) d.driverNationalId = nid
                if (!d.senderNationalId) d.senderNationalId = nid
                if (!d.receiverNationalId) d.receiverNationalId = nid
              }
              if (d.driverName && String(d.driverName).trim()) d.name = String(d.driverName).trim()
              session.data = d

              if (createProfile) {
                const profile = await createProfileFromImportResult(account, d, result)
                session.profileId = profile.id
                await prisma.notification.create({
                  data: { title: 'پروفایل خودکار ساخته شد', message: `از آخرین بارنامه‌ی حساب «${account.accountName}» پروفایل «${profile.name}» ساخته شد.`, type: 'success' },
                }).catch(() => {})
              }
              pushImportLog(session, 'دریافت اطلاعات با موفقیت انجام شد')
              finishImportSession(session, 'success')
              return
            }

            const kind = String(result.kind || 'error')
            const err = String(result.error || 'خطای نامشخص')
            pushImportLog(session, `خطا (${kind}): ${err}`)
            await prisma.barBargAccount.update({ where: { id: account.id }, data: { lastError: err } }).catch(() => {})

            if (kind === 'no_history') {
              finishImportSession(session, 'failed', err)
              return
            }

            const wait = (kind === 'bad_credentials' || kind === 'account_locked')
              ? 60 * 1000
              : importWaitMs(kind)
            if (kind === 'bad_credentials' || kind === 'account_locked') {
              pushImportLog(session, 'هشدار: سایت/کپچا ممکن است موقتاً خطای نام کاربری یا رمز داده باشد؛ حساب غیرفعال نمی‌شود و دوباره از صفر تلاش می‌کنم')
            }
            pushImportLog(session, `خطا قابل تلاش مجدد است؛ ${Math.round(wait / 1000)} ثانیه صبر می‌کنم و دوباره از صفر شروع می‌کنم`)
            await sleepAbortable(wait, session)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'خطای غیرمنتظره'
            if (session.stopRequested || /توسط کاربر متوقف|Target page, context or browser has been closed|Target closed|browser has been closed/i.test(msg)) break
            pushImportLog(session, `خطای غیرمنتظره: ${msg}`)
            await sleepAbortable(15000, session)
          } finally {
            session.browser = null
          }
        }
        pushImportLog(session, 'عملیات توسط کاربر متوقف شد')
        finishImportSession(session, 'cancelled', 'توسط کاربر متوقف شد')
      })().catch((e) => {
        finishImportSession(session, 'failed', e instanceof Error ? e.message : 'خطای غیرمنتظره')
      })

      return NextResponse.json({ success: true, sessionId: accountId, status: session.status, logs: session.logs })
    }

    const eng = await getEngine()
    const logs: string[] = []

    const result = await eng.importLastBarname({
      credentials: {
        username: account.username,
        password: decryptPassword(account.passwordEncrypted),
      },
      headless: process.env.BARBARG_HEADLESS === 'true',
      fast: true,
      onLog: (line: string) => {
        const t = String(line).trim()
        if (t) logs.push(t.slice(0, 300))
      },
    })

    if (!result.success) {
      // در مسیر دریافت اطلاعات، حتی اگر سایت خطای نام کاربری/رمز داد، حساب را غیرفعال نمی‌کنیم؛
      // چون این مسیر ممکن است به‌خاطر کپچا/اختلال سایت به‌اشتباه چنین خطایی بگیرد.
      await prisma.barBargAccount.update({
        where: { id: account.id },
        data: { lastError: result.error },
      }).catch(() => {})

      /* حتی وقتی تاریخچه خالی است، نام دارنده‌ی حساب را از نوار بالای
         سایت خوانده‌ایم — همان را در نام حساب ذخیره کن تا هدر نرود. */
      if (result.accountHolderName) {
        await prisma.barBargAccount.update({
          where: { id: account.id },
          data: { notes: `نام دارنده‌ی حساب در سامانه: ${result.accountHolderName}` },
        }).catch(() => {})
      }

      return NextResponse.json(
        {
          error: result.error,
          kind: result.kind,
          accountHolderName: result.accountHolderName || null,
          logs,
        },
        { status: result.kind === 'no_history' ? 404 : 400 },
      )
    }

    await prisma.barBargAccount.update({
      where: { id: account.id },
      data: { lastLogin: new Date(), lastError: null },
    }).catch(() => {})

    const d = result.data

    /* پیش‌نمایش هم همین دو قاعده را داشته باشد تا فرم پنل هم درست پر شود */
    {
      const nid = String(account.username || '').replace(/\D/g, '')
      if (nid) {
        if (!d.driverNationalId) d.driverNationalId = nid
        if (!d.senderNationalId) d.senderNationalId = nid
        if (!d.receiverNationalId) d.receiverNationalId = nid
      }
      if (d.driverName && String(d.driverName).trim()) d.name = String(d.driverName).trim()
    }

    // فقط پیش‌نمایش
    if (!createProfile) {
      return NextResponse.json({
        success: true, data: d, raw: result.raw,
        history: result.history || [], logs,
      })
    }

    /* کد ملی صاحب حساب = نام کاربری حساب باربگ */
    const accNid = String(account.username || '').replace(/\D/g, '')

    /* نام پروفایل = نام راننده */
    const profileName =
      (d.driverName && String(d.driverName).trim()) ||
      (d.plateNumber && `پروفایل ${d.plateNumber}`) ||
      d.name ||
      `وارد‌شده از ${account.accountName}`

    // ساخت پروفایل واقعی
    const profile = await prisma.registrationProfile.create({
      data: {
        name: profileName,
        status: 'active',

        senderType: 'حقیقی',
        senderFirstName: d.senderFirstName || '',
        senderLastName: d.senderLastName || '',
        senderMobile: '',
        senderNationalId: accNid,

        receiverType: 'حقیقی',
        receiverFirstName: d.receiverFirstName || '',
        receiverLastName: d.receiverLastName || '',
        receiverMobile: '',
        receiverNationalId: accNid,

        plateNumber: d.plateNumber || '',
        driverName: d.driverName || '',
        driverNationalId: d.driverNationalId || accNid,

        cargoName: d.cargoName || '',
        cargoPackaging: d.cargoPackaging || null,
        cargoQuantity: d.cargoQuantity || null,
        cargoWeight: d.cargoWeight || null,
        cargoValue: d.cargoValue || null,
        insuranceAmount: d.insuranceAmount || null,

        originProvince: d.originProvince || '',
        originCity: d.originCity || '',
        originAddress: d.originAddress || null,
        destProvince: d.destProvince || '',
        destCity: d.destCity || '',
        destAddress: d.destAddress || null,

        notes: d.trackingCode
          ? `به‌صورت خودکار از بارنامه ${d.trackingCode} وارد شد`
          : 'به‌صورت خودکار وارد شد',

        barbargAccount: { connect: { id: account.id } },
      },
    })

    await prisma.notification.create({
      data: {
        title: 'پروفایل خودکار ساخته شد',
        message:
          `از آخرین بارنامه‌ی حساب «${account.accountName}» ` +
          `پروفایل «${profile.name}» ساخته شد. ` +
          'فیلدهای موبایل و کد ملی فرستنده/گیرنده و کرایه را تکمیل کنید.',
        type: 'success',
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true, data: d, profileId: profile.id,
      historyCount: (result.history || []).length,
      logs,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطای ناشناخته' },
      { status: 500 },
    )
  }
}


export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  if (!accountId) return NextResponse.json({ error: 'accountId الزامی است' }, { status: 400 })
  const s = importSessions.get(accountId)
  if (!s) return NextResponse.json({ status: 'not_found', logs: [] })
  return NextResponse.json({
    status: s.status,
    logs: s.logs,
    error: s.error,
    data: s.data,
    profileId: s.profileId,
    attempt: s.attempt,
    elapsed: Math.floor((Date.now() - s.startedAt) / 1000),
    updatedAt: new Date(s.updatedAt).toISOString(),
  })
}
