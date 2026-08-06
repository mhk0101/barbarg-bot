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

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const { accountId, createProfile = false } = body

    if (!accountId) {
      return NextResponse.json({ error: 'شناسه حساب الزامی است' }, { status: 400 })
    }

    const account = await prisma.barBargAccount.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'حساب یافت نشد' }, { status: 404 })
    }

    const eng = await getEngine()
    const logs: string[] = []

    const result = await eng.importLastBarname({
      credentials: {
        username: account.username,
        password: decryptPassword(account.passwordEncrypted),
      },
      headless: process.env.BARBARG_HEADLESS === 'true',
      onLog: (line: string) => {
        const t = String(line).trim()
        if (t) logs.push(t.slice(0, 300))
      },
    })

    if (!result.success) {
      // مشخصات اشتباه ⇒ حساب را غیرفعال کن (مثل مسیر اتوماسیون)
      if (result.kind === 'bad_credentials' || result.kind === 'account_locked') {
        await prisma.barBargAccount.update({
          where: { id: account.id },
          data: { status: 'inactive', lastError: result.error },
        }).catch(() => {})
      } else {
        await prisma.barBargAccount.update({
          where: { id: account.id },
          data: { lastError: result.error },
        }).catch(() => {})
      }

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
