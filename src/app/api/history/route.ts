import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const plate = searchParams.get('plate') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') where.status = status

    // فیلتر پلاک (برای دیالوگ تاریخچه در «ثبت سریع») و جستجو (پلاک/شماره باربرگ/راننده)
    const waybillWhere: Record<string, unknown> = {}
    if (plate) waybillWhere.plate = { plateNumber: { contains: plate, mode: 'insensitive' as const } }
    if (search) {
      waybillWhere.OR = [
        { plate: { plateNumber: { contains: search, mode: 'insensitive' as const } } },
        { waybillNumber: { contains: search, mode: 'insensitive' as const } },
        { driver: { name: { contains: search, mode: 'insensitive' as const } } },
      ]
    }
    if (plate || search) where.waybill = waybillWhere

    const [jobs, total, stats] = await Promise.all([
      prisma.job.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          waybill: {
            select: {
              waybillNumber: true,
              plate: { select: { plateNumber: true } },
              driver: { select: { name: true } },
            },
          },
        },
      }),
      prisma.job.count({ where }),
      prisma.job.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ])

    return NextResponse.json({
      records: jobs.map((j) => ({
        id: j.id,
        plateNumber: j.waybill?.plate?.plateNumber || '-',
        waybillNumber: j.waybill?.waybillNumber || '-',
        status: j.status,
        driver: j.waybill?.driver?.name || '-',
        createdAt: j.createdAt.toISOString(),
        completedAt: j.completedAt?.toISOString() || null,
        attempts: j.attempts,
        error: j.error,
      })),
      stats: {
        total,
        completed: stats.find((s) => s.status === 'completed')?._count.id || 0,
        failed: stats.find((s) => s.status === 'failed')?._count.id || 0,
        pending: stats.find((s) => s.status === 'pending')?._count.id || 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch {
    return NextResponse.json({ records: [], stats: { total: 0, completed: 0, failed: 0, pending: 0 }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
  }
}
