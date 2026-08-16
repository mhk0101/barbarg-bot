import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_queue')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const level = searchParams.get('level')

    const where: Record<string, unknown> = {}
    if (jobId) where.jobId = jobId
    if (level) where.level = level

    const logs = await prisma.jobLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { job: { select: { id: true, type: true } } },
    })

    return NextResponse.json({
      data: logs.map((l) => ({
        id: l.id,
        jobId: l.jobId,
        level: l.level,
        message: l.message,
        details: l.details,
        jobType: l.job?.type,
        timestamp: l.createdAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
