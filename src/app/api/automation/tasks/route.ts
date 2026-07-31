import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status

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
      await prisma.job.update({ where: { id: body.jobId }, data: { status: 'pending', error: null, startedAt: null, completedAt: null } })
      return NextResponse.json({ success: true })
    }
    if (body.action === 'cancel' && body.jobId) {
      await prisma.job.update({ where: { id: body.jobId }, data: { status: 'cancelled', completedAt: new Date() } })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
