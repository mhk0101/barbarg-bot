import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAutomationEngine } from '@/automation/engine/AutomationEngine'
import { Queue } from 'bullmq'
import { REDIS_CONFIG } from '@/lib/redis'

const automationQueue = new Queue('barbarg-automation', { connection: REDIS_CONFIG })

export async function GET() {
  try {
    const jobStatusGroups = await prisma.job.groupBy({ by: ['status'], _count: { id: true } })

    const jobCounts = Object.fromEntries(jobStatusGroups.map((g) => [g.status, g._count.id]))
    const pendingJobs = jobCounts['pending'] ?? 0
    const completedJobs = jobCounts['completed'] ?? 0
    const failedJobs = jobCounts['failed'] ?? 0
    const activeJobs = jobCounts['processing'] ?? 0

    const recentLogs = await prisma.jobLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 20,
      include: { job: { select: { id: true, type: true } } },
    })

    let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0 }
    try {
      const counts = await automationQueue.getJobCounts('waiting', 'active', 'completed', 'failed')
      queueStats = { waiting: counts.waiting ?? 0, active: counts.active ?? 0, completed: counts.completed ?? 0, failed: counts.failed ?? 0 }
    } catch {}

    const engine = getAutomationEngine()
    return NextResponse.json({
      status: { running: engine.isRunning(), paused: engine.isPaused() },
      queue: { waiting: pendingJobs + queueStats.waiting, active: activeJobs + queueStats.active, completed: completedJobs + queueStats.completed, failed: failedJobs + queueStats.failed },
      logs: recentLogs.map((l) => ({ id: l.id, jobId: l.jobId, level: l.level, message: l.message, timestamp: l.createdAt.toISOString(), jobType: l.job?.type })),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const engine = getAutomationEngine()
    const testMode = body.testMode === true

    switch (body.action) {
      case 'start': {
        await engine.start()
        // Create a test job and process it to actually launch the browser
        const testJob = await prisma.job.create({ data: { type: 'REGISTER_WAYBILL', status: 'pending', priority: 0, attempts: 0, maxRetries: 3 } })
        await automationQueue.add('process-waybill', {
          taskId: testJob.id, plateNumber: 'تست', accountId: 'default', jobIndex: 0, totalJobs: 1,
        }).catch(() => {
          engine.processTask(testJob.id).catch(() => {})
        })
        await prisma.activityLog.create({ data: { action: 'bot_started', resource: 'automation', details: { jobId: testJob.id } } })
        return NextResponse.json({ success: true, message: 'بات شروع شد' })
      }
      case 'stop': { engine.stop(); return NextResponse.json({ success: true, message: 'بات متوقف شد' }) }
      case 'pause': { engine.pause(); return NextResponse.json({ success: true, message: 'متوقف موقت' }) }
      case 'resume': { engine.resume(); return NextResponse.json({ success: true, message: 'ادامه یافت' }) }
      case 'test-login': {
        try {
          const { LoginFlow } = await import('@/automation/auth/LoginFlow')
          const { browserManager } = await import('@/automation/browser/BrowserManager')
          const login = new LoginFlow()
          await browserManager.launch(false) // headless: false for test
          const result = await login.openManualLogin(body.accountId || 'default')
          return NextResponse.json(result)
        } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا', success: false }) }
      }
      case 'trigger': {
        const { plateNumber, count, accountId } = body
        if (!plateNumber || !count) return NextResponse.json({ error: 'شماره پلاک و تعداد الزامی است' }, { status: 400 })

        const createdJobs = await prisma.job.createManyAndReturn({
          data: Array.from({ length: count }, () => ({ type: 'REGISTER_WAYBILL', status: 'pending', priority: 0, attempts: 0, maxRetries: 3 })),
        })

        for (let i = 0; i < createdJobs.length; i++) {
          const job = createdJobs[i]
          try {
            await automationQueue.add('process-waybill', {
              taskId: job.id, plateNumber, accountId: accountId || 'default',
              jobIndex: i, totalJobs: createdJobs.length,
            }, { delay: Math.floor(Math.random() * 75000 + 45000) * i })
          } catch (err) {
            console.error('[Trigger] BullMQ failed, falling back to in-process:', err)
            engine.processTask(job.id).catch(() => {})
          }
        }

        await prisma.activityLog.create({
          data: { action: 'jobs_created', resource: 'automation', details: { plateNumber, count, jobIds: createdJobs.map((j) => j.id) } },
        })
        return NextResponse.json({ success: true, message: `${count} وظیفه در صف اضافه شد`, jobs: createdJobs.map((j) => ({ id: j.id, status: j.status })) })
      }
      default:
        return NextResponse.json({ error: 'عملیت نامعتبر' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
