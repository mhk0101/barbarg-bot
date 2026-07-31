import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { automationQueue } from '../../../../worker/queue'

export async function GET() {
  try {
    const now = new Date()
    const profiles = await prisma.registrationProfile.findMany({
      where: { status: 'active' },
      orderBy: { nextRun: 'asc' },
      include: { barbargAccount: { select: { id: true, accountName: true, username: true, status: true } } },
    })

    const dueProfiles = profiles.filter((p) => !p.nextRun || p.nextRun <= now)
    const upcomingProfiles = profiles.filter((p) => p.nextRun && p.nextRun > now)

    return NextResponse.json({
      profiles: profiles.map((p) => ({
        id: p.id, name: p.name, plateNumber: p.plateNumber, status: p.status,
        registrationsPerDay: p.registrationsPerDay, intervalMinutes: p.intervalMinutes,
        lastRun: p.lastRun?.toISOString() || null, nextRun: p.nextRun?.toISOString() || null,
        totalRuns: p.totalRuns, successfulRuns: p.successfulRuns, failedRuns: p.failedRuns,
        account: p.barbargAccount,
      })),
      dueCount: dueProfiles.length,
      upcomingCount: upcomingProfiles.length,
      totalActive: profiles.length,
    })
  } catch {
    return NextResponse.json({ profiles: [], dueCount: 0, upcomingCount: 0, totalActive: 0 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'tick') {
      const now = new Date()
      const dueProfiles = await prisma.registrationProfile.findMany({
        where: { status: 'active', OR: [{ nextRun: null }, { nextRun: { lte: now } }] },
        include: { barbargAccount: true },
      })

      const createdJobs = []
      for (const profile of dueProfiles) {
        if (!profile.barbargAccount || profile.barbargAccount.status !== 'active') continue
        if (profile.registrationsPerDay > 0 && profile.totalRuns >= profile.registrationsPerDay) continue

        const job = await prisma.job.create({
          data: {
            type: 'REGISTER_WAYBILL',
            status: 'pending',
            priority: profile.priority,
            maxRetries: profile.maxRetries,
            profileId: profile.id,
          },
        })

        const nextRun = new Date(now.getTime() + profile.intervalMinutes * 60 * 1000)
        await prisma.registrationProfile.update({
          where: { id: profile.id },
          data: { lastRun: now, nextRun, totalRuns: { increment: 1 } },
        })

        createdJobs.push({ jobId: job.id, profileId: profile.id, profileName: profile.name })

        try {
          await automationQueue.add('process-waybill', {
            taskId: job.id,
            plateNumber: profile.plateNumber,
            accountId: profile.accountId || '',
            jobIndex: 0,
            totalJobs: 1,
          }, { priority: profile.priority })
        } catch (e) {
          console.error('[Scheduler] Failed to enqueue job:', e)
        }
      }

      return NextResponse.json({ created: createdJobs.length, jobs: createdJobs })
    }

    if (action === 'run-now') {
      const { profileId } = body
      if (!profileId) return NextResponse.json({ error: 'profileId الزامی است' }, { status: 400 })

      const profile = await prisma.registrationProfile.findUnique({
        where: { id: profileId },
        include: { barbargAccount: true },
      })
      if (!profile) return NextResponse.json({ error: 'پروفایل یافت نشد' }, { status: 404 })
      if (!profile.barbargAccount || profile.barbargAccount.status !== 'active') {
        return NextResponse.json({ error: 'اکانت باربگ فعال نیست' }, { status: 400 })
      }

      const job = await prisma.job.create({
        data: {
          type: 'REGISTER_WAYBILL',
          status: 'pending',
          priority: profile.priority,
          maxRetries: profile.maxRetries,
          profileId: profile.id,
        },
      })

      const nextRun = new Date(Date.now() + profile.intervalMinutes * 60 * 1000)
      await prisma.registrationProfile.update({
        where: { id: profileId },
        data: { lastRun: new Date(), nextRun, totalRuns: { increment: 1 } },
      })

      try {
        await automationQueue.add('process-waybill', {
          taskId: job.id,
          plateNumber: profile.plateNumber,
          accountId: profile.accountId || '',
          jobIndex: 0,
          totalJobs: 1,
        }, { priority: profile.priority })
      } catch (e) {
        console.error('[Scheduler] Failed to enqueue job:', e)
      }

      return NextResponse.json({ success: true, jobId: job.id })
    }

    return NextResponse.json({ error: 'action نامعتبر' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
