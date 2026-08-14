import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { encryptPassword } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const statsOnly = searchParams.get('stats') === 'true'

    if (statsOnly) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const [statusGroups, successfulToday, failedToday] = await Promise.all([
        prisma.barBargAccount.groupBy({ by: ['status'], _count: { id: true } }),
        prisma.barBargAccount.count({ where: { lastLogin: { gte: todayStart } } }),
        prisma.barBargAccount.count({ where: { lastError: { not: null }, updatedAt: { gte: todayStart } } }),
      ])

      const statusCounts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count.id]))
      const total = Object.values(statusCounts).reduce((sum, c) => sum + c, 0) as number
      const active = statusCounts['active'] ?? 0
      // نسخه‌های قبلی ورکر اشتباهاً مقدار inactive می‌نوشتند؛ برای سازگاری
      // رکوردهای قدیمی را هم غیرفعال حساب می‌کنیم.
      const disabled = (statusCounts['disabled'] ?? 0) + (statusCounts['inactive'] ?? 0)
      return NextResponse.json({ stats: { total, active, disabled, successfulToday, failedToday } })
    }

    const where: Record<string, unknown> = {}
    if (search) where.OR = [
      { accountName: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ]
    if (status && status !== 'ALL') {
      where.status = status === 'disabled' ? { in: ['disabled', 'inactive'] } : status
    }

    const [data, total] = await Promise.all([
      prisma.barBargAccount.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        select: {
          id: true, accountName: true, username: true, company: true, status: true,
          lastLogin: true, lastError: true, notes: true, phone: true, smsWebhookToken: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.barBargAccount.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const accountName = typeof body.accountName === 'string' ? body.accountName.trim() : ''
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const status = body.status === 'disabled' ? 'disabled' : 'active'
    if (!accountName || !username || !password) {
      return NextResponse.json({ error: 'نام حساب، نام کاربری و رمز عبور الزامی است' }, { status: 400 })
    }
    // چند حساب می‌توانند نام کاربری یکسان داشته باشند؛ کاربر خودش با «نام حساب» آن‌ها را تفکیک می‌کند.
    const encrypted = encryptPassword(password)
    const account = await prisma.barBargAccount.create({
      data: {
        accountName, username, passwordEncrypted: encrypted,
        company: typeof body.company === 'string' ? body.company.trim() || null : null,
        status,
        notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      },
      select: { id: true, accountName: true, username: true, company: true, status: true, lastLogin: true, lastError: true, createdAt: true },
    })
    return NextResponse.json(account, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
