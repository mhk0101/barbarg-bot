import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { extractSmsCode } from '@/lib/sms-code'


async function cleanupExpiredCodeMessages() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000)
  const old = await prisma.smsMessage.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, rawText: true, resultMessage: true },
    take: 500,
  }).catch(() => [])
  const ids = old
    .filter((m) => extractSmsCode(`${m.rawText || ''} ${m.resultMessage || ''}`))
    .map((m) => m.id)
  if (ids.length) await prisma.smsMessage.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    await cleanupExpiredCodeMessages()
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const status = searchParams.get('status')
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (status && status !== 'ALL') where.status = status

    const data = await prisma.smsMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { account: { select: { id: true, accountName: true, username: true } } },
    })
    return NextResponse.json({ data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا در دریافت پیامک‌ها', data: [] }, { status: 500 })
  }
}
