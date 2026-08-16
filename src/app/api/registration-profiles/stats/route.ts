import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const [total, active, disabled, runStats] = await Promise.all([
      prisma.registrationProfile.count(),
      prisma.registrationProfile.count({ where: { status: 'active' } }),
      prisma.registrationProfile.count({ where: { status: 'disabled' } }),
      prisma.registrationProfile.aggregate({
        _sum: { totalRuns: true, successfulRuns: true, failedRuns: true },
      }),
    ])

    return NextResponse.json({
      total,
      active,
      disabled,
      totalRuns: runStats._sum.totalRuns ?? 0,
      successfulRuns: runStats._sum.successfulRuns ?? 0,
      failedRuns: runStats._sum.failedRuns ?? 0,
    })
  } catch {
    return NextResponse.json({
      total: 0, active: 0, disabled: 0,
      totalRuns: 0, successfulRuns: 0, failedRuns: 0,
    })
  }
}
