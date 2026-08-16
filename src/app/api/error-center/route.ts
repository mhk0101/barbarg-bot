import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_logs')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = { status: { in: ['failed', 'paused', 'error'] } }
    if (status && status !== 'all') where.status = status
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59')
    }
    if (search) {
      where.OR = [
        { plate: { contains: search, mode: 'insensitive' } },
        { driver: { contains: search, mode: 'insensitive' } },
        { sender: { contains: search, mode: 'insensitive' } },
        { receiver: { contains: search, mode: 'insensitive' } },
        { resultMessage: { contains: search, mode: 'insensitive' } },
        { errorCode: { contains: search, mode: 'insensitive' } },
        { waybillNumber: { contains: search, mode: 'insensitive' } },
        { currentUrl: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [data, total, counts] = await Promise.all([
      prisma.automationResult.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          worker: { select: { id: true, name: true, status: true } },
        },
      }),
      prisma.automationResult.count({ where }),
      prisma.automationResult.groupBy({
        by: ['status'],
        where: { status: { in: ['failed', 'paused', 'error'] } },
        _count: { id: true },
      }),
    ])

    return NextResponse.json({
      data: data.map((r) => ({
        id: r.id,
        plate: r.plate,
        driver: r.driver,
        vehicle: r.vehicle,
        sender: r.sender,
        receiver: r.receiver,
        waybillNumber: r.waybillNumber,
        status: r.status,
        resultMessage: r.resultMessage,
        resultType: r.resultType,
        errorCode: r.errorCode,
        retryCount: r.retryCount,
        duration: r.duration,
        screenshotPath: r.screenshotPath,
        htmlSnapshotPath: r.htmlSnapshotPath,
        currentUrl: r.currentUrl,
        playwrightLog: r.playwrightLog,
        worker: r.worker,
        accountId: r.accountId,
        startedAt: r.startedAt?.toISOString() || null,
        finishedAt: r.finishedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      counts: {
        all: total,
        failed: counts.find((c) => c.status === 'failed')?._count.id || 0,
        paused: counts.find((c) => c.status === 'paused')?._count.id || 0,
        error: counts.find((c) => c.status === 'error')?._count.id || 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch {
    return NextResponse.json({ data: [], counts: { all: 0, failed: 0, paused: 0, error: 0 }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'control_bot')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const { action, resultId } = body

    if (action === 'retry') {
      if (!resultId) return NextResponse.json({ error: 'resultId الزامی است' }, { status: 400 })

      const result = await prisma.automationResult.findUnique({ where: { id: resultId } })
      if (!result) return NextResponse.json({ error: 'نتیجه یافت نشد' }, { status: 404 })

      const job = await prisma.job.create({
        data: {
          type: 'REGISTER_WAYBILL',
          status: 'pending',
          priority: 0,
          maxRetries: 3,
          profileId: result.taskId ? (await prisma.job.findUnique({ where: { id: result.taskId }, select: { profileId: true } }))?.profileId || null : null,
        },
      })

      await prisma.automationResult.update({
        where: { id: resultId },
        data: { retryCount: { increment: 1 } },
      })

      return NextResponse.json({ success: true, jobId: job.id })
    }

    return NextResponse.json({ error: 'action نامعتبر' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
