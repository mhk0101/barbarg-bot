import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * ساخت گروهی آدرس وبهوک پیامک برای همه اکانت‌ها.
 *
 * POST /api/barbarg-accounts/sms-tokens
 *   body (اختیاری): { regenerate: boolean }
 *     regenerate = false (پیش‌فرض) → فقط اکانت‌هایی که لینک ندارند
 *     regenerate = true            → برای همه اکانت‌ها لینک جدید (لینک‌های قبلی باطل می‌شوند!)
 *
 * خروجی: لیست همه اکانت‌ها با توکن‌هایشان + تعداد ساخته‌شده
 */
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json().catch(() => ({}))
    const regenerate = body?.regenerate === true

    const accounts = await prisma.barBargAccount.findMany({
      select: { id: true, accountName: true, username: true, smsWebhookToken: true },
      orderBy: { accountName: 'asc' },
    })

    const targets = regenerate ? accounts : accounts.filter((a) => !a.smsWebhookToken)

    let created = 0
    for (const acc of targets) {
      const token = crypto.randomBytes(24).toString('hex')
      await prisma.barBargAccount.update({
        where: { id: acc.id },
        data: { smsWebhookToken: token },
      })
      acc.smsWebhookToken = token
      created++
    }

    await prisma.activityLog.create({
      data: {
        action: 'sms_tokens_bulk_created',
        resource: 'barbarg_account',
        details: { created, regenerate, total: accounts.length },
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      created,
      skipped: accounts.length - targets.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        accountName: a.accountName,
        username: a.username,
        smsWebhookToken: a.smsWebhookToken,
      })),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}

/**
 * حذف گروهی آدرس وبهوک همه اکانت‌ها.
 *
 * DELETE /api/barbarg-accounts/sms-tokens
 *   همه لینک‌های وبهوک پیامک باطل می‌شوند — اپ‌های فورواردر روی گوشی‌ها
 *   دیگر نمی‌توانند پیامک بفرستند تا لینک جدید ساخته و تنظیم شود.
 */
export async function DELETE(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const result = await prisma.barBargAccount.updateMany({
      where: { smsWebhookToken: { not: null } },
      data: { smsWebhookToken: null },
    })

    await prisma.activityLog.create({
      data: {
        action: 'sms_tokens_bulk_deleted',
        resource: 'barbarg_account',
        details: { deleted: result.count },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}
