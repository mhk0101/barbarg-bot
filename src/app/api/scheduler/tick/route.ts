import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const now = new Date()

    const dueProfiles = await prisma.registrationProfile.findMany({
      where: {
        status: 'active',
        OR: [{ nextRun: null }, { nextRun: { lte: now } }],
      },
      include: { barbargAccount: true },
    })

    const createdJobs: Array<{ jobId: string; profileId: string; profileName: string }> = []

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
    }

    return NextResponse.json({ created: createdJobs.length, jobs: createdJobs })
  } catch (e: unknown) {
    return NextResponse.json(
      { created: 0, jobs: [], error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}
