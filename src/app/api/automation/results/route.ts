import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'


async function reconcileRunningResults() {
  try {
    const stale = await prisma.automationResult.findMany({
      where: { status: { in: ['running', 'pending'] } },
      select: {
        id: true,
        status: true,
        resultMessage: true,
        taskId: true,
        startedAt: true,
        createdAt: true,
        job: { select: { id: true, status: true, result: true, error: true, completedAt: true, startedAt: true } },
      },
      take: 200,
    })

    const now = new Date()
    for (const r of stale) {
      const job = r.job
      if (!job) {
        await prisma.automationResult.update({
          where: { id: r.id },
          data: {
            status: 'failed',
            resultType: 'error',
            resultMessage: r.resultMessage || 'وظیفه مربوط به این نتیجه در صف/دیتابیس یافت نشد؛ وضعیت در حال اجرا اصلاح شد',
            finishedAt: now,
          },
        }).catch(() => {})
        continue
      }

      if (job.status === 'processing') continue

      if (job.status === 'completed') {
        await prisma.automationResult.update({
          where: { id: r.id },
          data: {
            status: 'completed',
            resultType: 'success',
            resultMessage: r.resultMessage || job.result || 'عملیات تکمیل شد',
            finishedAt: job.completedAt || now,
          },
        }).catch(() => {})
      } else if (job.status === 'failed') {
        await prisma.automationResult.update({
          where: { id: r.id },
          data: {
            status: 'failed',
            resultType: 'error',
            resultMessage: r.resultMessage || job.error || 'وظیفه ناموفق شد',
            errorCode: 'TASK_FAILED',
            finishedAt: job.completedAt || now,
          },
        }).catch(() => {})
      } else if (job.status === 'cancelled') {
        await prisma.automationResult.update({
          where: { id: r.id },
          data: {
            status: 'cancelled',
            resultType: 'warning',
            resultMessage: r.resultMessage || job.error || 'وظیفه لغو شد',
            finishedAt: job.completedAt || now,
          },
        }).catch(() => {})
      } else if (job.status === 'pending' && r.status !== 'pending') {
        await prisma.automationResult.update({
          where: { id: r.id },
          data: { status: 'pending', resultType: 'info', resultMessage: r.resultMessage || 'در صف انتظار' },
        }).catch(() => {})
      }
    }
  } catch {
    // اصلاح وضعیت نباید API نتایج را خراب کند
  }
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_queue')
  if (!guard.ok) return guard.response
  try {
    await reconcileRunningResults()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const result = await prisma.automationResult.findUnique({
        where: { id },
        include: {
          job: {
            include: { logs: true },
          },
          account: { select: { id: true, username: true } },
          worker: { select: { id: true, name: true, status: true } },
        },
      })
      if (!result) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
      return NextResponse.json(result)
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      where.OR = [
        { plate: { contains: search, mode: 'insensitive' as const } },
        { driver: { contains: search, mode: 'insensitive' as const } },
        { waybillNumber: { contains: search, mode: 'insensitive' as const } },
        { resultMessage: { contains: search, mode: 'insensitive' as const } },
        { account: { username: { contains: search, mode: 'insensitive' as const } } },
        { worker: { name: { contains: search, mode: 'insensitive' as const } } },
      ]
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {}
      if (dateFrom) createdAt.gte = new Date(dateFrom)
      if (dateTo) createdAt.lte = new Date(dateTo + 'T23:59:59.999Z')
      where.createdAt = createdAt
    }

    const [data, total] = await Promise.all([
      prisma.automationResult.findMany({
        where,
        include: {
          account: { select: { id: true, username: true } },
          worker: { select: { id: true, name: true } },
          /* مشخصات حساب باربگ و راننده از مسیر پروفایل می‌آید.
             ستون accountId به جدول Account اشاره دارد نه BarBargAccount،
             پس همیشه خالی است. */
          job: {
            select: {
              id: true,
              error: true,
              profile: {
                select: {
                  name: true,
                  plateNumber: true,
                  driverName: true,
                  driverNationalId: true,
                  barbargAccount: {
                    select: { accountName: true, username: true, status: true, lastError: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.automationResult.count({ where }),
    ])

    /* تخت کردن خروجی تا صفحه لازم نباشد در چند لایه بگردد */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shaped = data.map((r: any) => {
      const p = r.job?.profile ?? null
      const ba = p?.barbargAccount ?? null
      const msg = `${r.resultMessage ?? ''} ${r.job?.error ?? ''}`
      return {
        ...r,
        profileName: p?.name ?? null,
        plate: r.plate ?? p?.plateNumber ?? null,
        driverName: r.driver ?? p?.driverName ?? null,
        driverNationalId: p?.driverNationalId ?? null,
        accountHolder: ba?.accountName ?? null,
        accountUsername: ba?.username ?? r.account?.username ?? null,
        accountStatus: ba?.status ?? null,
        accountLastError: ba?.lastError ?? null,
        /* آیا علت شکست، اشتباه بودن رمز یا نام کاربری بوده؟ */
        badCredentials:
          /رمز عبور|نام کاربری|کاربری با این مشخصات|کاربری یافت نشد|مسدود|غیرفعال/.test(msg),
      }
    })

    return NextResponse.json({
      data: shaped,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  }
}
