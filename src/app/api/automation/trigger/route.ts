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
      /* ⚠ دیتابیس و Redis دو نمای از یک چیزند، نه دو چیز جدا.
         جمع کردنشان باعث می‌شد یک جاب دو بار شمرده شود — مثلا «۱ در حال اجرا»
         در حالی که صف وظایف خالی بود. دیتابیس مرجع است. */
      queue: {
        waiting: Math.max(pendingJobs, queueStats.waiting),
        active: Math.max(activeJobs, queueStats.active),
        completed: completedJobs,
        failed: failedJobs,
      },
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
        // فقط موتور را روشن می‌کند؛ دیگر «جاب تستی» با پلاک الکی نمی‌سازد.
        // ثبت واقعی از طریق «افزودن به صف» انجام می‌شود.
        await engine.start()
        await prisma.activityLog.create({
          data: { action: 'bot_started', resource: 'automation', details: {} },
        })
        return NextResponse.json({
          success: true,
          message: 'بات فعال شد — حالا از «افزودن به صف» ثبت را شروع کنید',
        })
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
        const { plateNumber, count, accountId, profileId: explicitProfileId } = body
        if (!plateNumber || !count) return NextResponse.json({ error: 'شماره پلاک و تعداد الزامی است' }, { status: 400 })

        // ---- FIX: a job MUST carry a profileId, otherwise the worker has no
        // form data to fill and dies with "داده باربرگ یافت نشد".
        // Resolve the registration profile for this plate (+account if given).
        let profile = null

        if (explicitProfileId) {
          profile = await prisma.registrationProfile.findUnique({ where: { id: explicitProfileId } })
          if (!profile) {
            return NextResponse.json({ error: 'پروفایل انتخاب‌شده یافت نشد' }, { status: 404 })
          }
        } else {
          // normalise Persian/Arabic digits so "۱۲ ب ۳۴۵" matches "12 ب 345"
          const normalise = (s: string) =>
            s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
             .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
             .replace(/\s+/g, '')
             .trim()

          const target = normalise(plateNumber)

          // همه‌ی پروفایل‌های فعال را می‌گیریم و بعد فیلتر می‌کنیم.
          // فیلتر کردن accountId در کوئری باعث می‌شد پروفایل‌هایی که
          // حسابشان تعیین نشده (accountId = null) هرگز پیدا نشوند.
          const activeProfiles = await prisma.registrationProfile.findMany({
            where: { status: 'active' },
          })

          const byPlate = activeProfiles.filter(
            (p) => normalise(p.plateNumber) === target,
          )
          const byPlateLoose = byPlate.length
            ? byPlate
            : activeProfiles.filter((p) => normalise(p.plateNumber).includes(target))

          const wantAccount = accountId && accountId !== 'default' ? accountId : null

          profile =
            // ۱) هم پلاک هم حساب مطابق
            (wantAccount ? byPlateLoose.find((p) => p.accountId === wantAccount) : null)
            // ۲) پلاک مطابق و پروفایل حساب ندارد (بعدا وصلش می‌کنیم)
            || byPlateLoose.find((p) => !p.accountId)
            // ۳) فقط پلاک مطابق
            || byPlateLoose[0]
            || null

          // اگر پروفایل حساب نداشت ولی کاربر حساب انتخاب کرده، همان را ثبت کن
          if (profile && !profile.accountId && wantAccount) {
            await prisma.registrationProfile.update({
              where: { id: profile.id },
              data: { barbargAccount: { connect: { id: wantAccount } } },
            }).catch(() => { /* اختیاری است */ })
            profile = { ...profile, accountId: wantAccount }
          }

          if (!profile) {
            const all = await prisma.registrationProfile.findMany({
              select: { name: true, plateNumber: true, status: true },
              take: 10,
            })
            const list = all.length
              ? all.map((p) => `«${p.plateNumber}»${p.status !== 'active' ? ' (غیرفعال)' : ''}`).join('، ')
              : 'هیچ پروفایلی ثبت نشده'
            return NextResponse.json({
              error: `پروفایلی با پلاک «${plateNumber}» پیدا نشد. پلاک‌های موجود: ${list}`,
            }, { status: 404 })
          }
        }

        if (!profile) {
          return NextResponse.json({
            error: `هیچ پروفایل فعالی برای پلاک «${plateNumber}» یافت نشد. ابتدا از صفحه «پروفایل‌ها» یک پروفایل برای این پلاک بسازید.`,
          }, { status: 404 })
        }

        const createdJobs = await prisma.job.createManyAndReturn({
          data: Array.from({ length: count }, () => ({
            type: 'REGISTER_WAYBILL',
            status: 'pending',
            priority: profile!.priority ?? 0,
            attempts: 0,
            maxRetries: profile!.maxRetries ?? 3,
            profileId: profile!.id,
          })),
        })

        for (let i = 0; i < createdJobs.length; i++) {
          const job = createdJobs[i]
          try {
            await automationQueue.add('process-waybill', {
              taskId: job.id, plateNumber,
              accountId: profile!.accountId || accountId || 'default',
              jobIndex: i, totalJobs: createdJobs.length,
            }, { delay: Math.floor(Math.random() * 75000 + 45000) * i })
          } catch (err) {
            console.error('[Trigger] BullMQ failed, falling back to in-process:', err)
            engine.processTask(job.id).catch(() => {})
          }
        }

        await prisma.activityLog.create({
          data: { action: 'jobs_created', resource: 'automation', details: { plateNumber, count, profileId: profile!.id, jobIds: createdJobs.map((j) => j.id) } },
        })
        return NextResponse.json({
          success: true,
          message: `${count} وظیفه با پروفایل «${profile!.name}» در صف اضافه شد`,
          profile: { id: profile!.id, name: profile!.name },
          jobs: createdJobs.map((j) => ({ id: j.id, status: j.status })),
        })
      }
      default:
        return NextResponse.json({ error: 'عملیت نامعتبر' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
