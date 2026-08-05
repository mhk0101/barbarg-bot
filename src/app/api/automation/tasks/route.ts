import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Queue } from 'bullmq'
import { REDIS_CONFIG } from '@/lib/redis'

const automationQueue = new Queue('barbarg-automation', { connection: REDIS_CONFIG })

/**
 * پاکسازی جاب‌های «زامبی».
 *
 * اگر پنجره‌ی Worker وسط کار بسته شود، جاب برای همیشه در حالت
 * processing می‌ماند و پنل می‌گوید «۱ در حال اجرا» در حالی که هیچ
 * چیزی در حال اجرا نیست.
 *
 * معیار: ۶ ساعت از شروع گذشته و در صف Redis هم نیست.
 * (۶ ساعت چون بدترین حالت واقعی حدود ۴.۵ ساعت است)
 */
async function reapZombieJobs(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const stale = await prisma.job.findMany({
      where: { status: 'processing', OR: [{ startedAt: { lt: cutoff } }, { startedAt: null }] },
      select: { id: true },
    })
    if (stale.length === 0) return 0

    // کدامشان واقعا هنوز در صف‌اند؟
    const live = new Set<string>()
    try {
      const qjobs = await automationQueue.getJobs(['active', 'waiting', 'delayed'])
      for (const qj of qjobs) if (qj?.data?.taskId) live.add(qj.data.taskId as string)
    } catch { /* Redis در دسترس نیست — محتاطانه دست نمی‌زنیم */ return 0 }

    const dead = stale.filter((j) => !live.has(j.id)).map((j) => j.id)
    if (dead.length === 0) return 0

    await prisma.job.updateMany({
      where: { id: { in: dead } },
      data: {
        status: 'failed',
        error: 'ورکر وسط کار متوقف شد (جاب رهاشده)',
        completedAt: new Date(),
      },
    })
    return dead.length
  } catch {
    return 0
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status

    await reapZombieJobs()

    const [jobs, jobStatusGroups] = await Promise.all([
      prisma.job.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.job.groupBy({ by: ['status'], _count: { id: true } }),
    ])

    const jobCounts = Object.fromEntries(jobStatusGroups.map((g) => [g.status, g._count.id]))
    const total = Object.values(jobCounts).reduce((sum, c) => sum + c, 0) as number
    const pending = jobCounts['pending'] ?? 0
    const processing = jobCounts['processing'] ?? 0
    const completed = jobCounts['completed'] ?? 0
    const failed = jobCounts['failed'] ?? 0

    return NextResponse.json({
      jobs, stats: { total, pending, processing, completed, failed },
    })
  } catch {
    return NextResponse.json({ jobs: [], stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 } })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (body.action === 'retry' && body.jobId) {
      await prisma.job.update({
        where: { id: body.jobId },
        data: { status: 'pending', error: null, startedAt: null, completedAt: null },
      })

      /* ⚠ دیتابیس به‌تنهایی کافی نیست — ورکر فقط از Redis کار برمی‌دارد.
         بدون این، جاب تا ابد در حالت «در انتظار» می‌ماند. */
      try {
        const job = await prisma.job.findUnique({
          where: { id: body.jobId },
          include: { profile: { select: { plateNumber: true, accountId: true } } },
        })
        await automationQueue.add('process-waybill', {
          taskId: body.jobId,
          plateNumber: job?.profile?.plateNumber || '',
          accountId: job?.profile?.accountId || '',
          jobIndex: 0,
          totalJobs: 1,
        }, { priority: job?.priority ?? 0 })
      } catch (e) {
        await prisma.job.update({
          where: { id: body.jobId },
          data: { status: 'failed', error: 'به صف اضافه نشد (Redis در دسترس نیست؟)', completedAt: new Date() },
        }).catch(() => {})
        return NextResponse.json({ error: 'به صف اضافه نشد — Redis را چک کنید' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (body.action === 'cancel' && body.jobId) {
      await prisma.job.update({
        where: { id: body.jobId },
        data: { status: 'cancelled', error: 'توسط کاربر لغو شد', completedAt: new Date() },
      })

      /* ⚠ مهم: فقط عوض کردن دیتابیس کافی نبود.
         جاب در صف Redis دست‌نخورده می‌ماند و ورکر بعدا اجرایش می‌کرد —
         کاربر پیام «لغو شد» می‌دید ولی وظیفه باز هم اجرا می‌شد. */
      let removed = 0
      try {
        const queued = await automationQueue.getJobs(['waiting', 'delayed', 'active', 'paused'])
        for (const qj of queued) {
          if (qj?.data?.taskId !== body.jobId) continue
          try { await qj.remove(); removed++ }
          catch { try { await qj.discard(); removed++ } catch {} }
        }
      } catch (e) {
        void e
        return NextResponse.json({
          success: true,
          warning: 'در دیتابیس لغو شد ولی از صف حذف نشد — Redis را چک کنید',
        })
      }
      return NextResponse.json({ success: true, removedFromQueue: removed })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
