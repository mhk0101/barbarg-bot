import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLogin } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requireLogin(request)
  if (!guard.ok) return guard.response
  try {
    const [totalAccounts, totalPlates, totalWaybills, jobStatusGroups, profileStats] = await Promise.all([
      prisma.account.count(),
      prisma.licensePlate.count(),
      prisma.waybill.count(),
      prisma.job.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.registrationProfile.aggregate({
        _count: { id: true },
        _sum: { totalRuns: true, successfulRuns: true, failedRuns: true },
      }),
    ])

    const jobCounts = Object.fromEntries(jobStatusGroups.map((g) => [g.status, g._count.id]))
    const completedJobs = jobCounts['completed'] ?? 0
    const failedJobs = jobCounts['failed'] ?? 0
    const pendingJobs = jobCounts['pending'] ?? 0
    const activeJobs = jobCounts['active'] ?? 0

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recentJobs = await prisma.job.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    })

    const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
    const weeklyMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      weeklyMap[key] = 0
    }
    recentJobs.forEach((j) => {
      const key = j.createdAt.toISOString().slice(0, 10)
      if (key in weeklyMap) weeklyMap[key]++
    })
    const weeklyActivity = Object.entries(weeklyMap).map(([date, count]) => {
      const d = new Date(date + 'T00:00:00')
      return { day: dayNames[d.getDay()], count }
    })

    const statusDistribution = [
      { name: 'تکمیل شده', value: completedJobs },
      { name: 'ناموفق', value: failedJobs },
      { name: 'در انتظار', value: pendingJobs },
      { name: 'فعال', value: activeJobs },
    ]

    const workers = await prisma.workerStatus.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, status: true, tasksCompleted: true, tasksFailed: true, lastHeartbeat: true },
    })

    const workerData = workers.map((w) => ({
      name: w.name,
      status: w.status === 'idle' ? 'آماده' : w.status === 'running' ? 'فعال' : w.status === 'error' ? 'خطا' : 'غیرفعال',
      progress: w.tasksCompleted + w.tasksFailed > 0
        ? Math.round((w.tasksCompleted / (w.tasksCompleted + w.tasksFailed)) * 100)
        : 0,
      tasksCompleted: w.tasksCompleted,
      tasksFailed: w.tasksFailed,
      lastHeartbeat: w.lastHeartbeat?.toISOString() || null,
    }))

    const successRate = (completedJobs + failedJobs) > 0
      ? Math.round((completedJobs / (completedJobs + failedJobs)) * 100)
      : 0

    const activeProfileCount = await prisma.registrationProfile.count({ where: { status: 'active' } })

    return NextResponse.json({
      stats: {
        accounts: totalAccounts ?? 0,
        plates: totalPlates ?? 0,
        waybills: totalWaybills ?? 0,
        completed: completedJobs ?? 0,
        failed: failedJobs ?? 0,
        pending: pendingJobs ?? 0,
        activeJobs: activeJobs ?? 0,
        successRate,
        profiles: profileStats._count.id ?? 0,
        activeProfiles: activeProfileCount,
        totalRuns: profileStats._sum.totalRuns ?? 0,
        successfulRuns: profileStats._sum.successfulRuns ?? 0,
        failedRuns: profileStats._sum.failedRuns ?? 0,
      },
      weeklyActivity,
      statusDistribution,
      workers: workerData,
    })
  } catch {
    return NextResponse.json({
      stats: { accounts: 0, plates: 0, waybills: 0, completed: 0, failed: 0, pending: 0, activeJobs: 0, successRate: 0, profiles: 0, activeProfiles: 0, totalRuns: 0, successfulRuns: 0, failedRuns: 0 },
      weeklyActivity: [],
      statusDistribution: [],
      workers: [],
    })
  }
}
