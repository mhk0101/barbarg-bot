import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_plates')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const plateNumber = searchParams.get('plate') || ''
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const plateWhere: Record<string, unknown> = {}
    if (plateNumber) plateWhere.plateNumber = { contains: plateNumber, mode: 'insensitive' }

    const plates = await prisma.licensePlate.findMany({
      where: plateWhere,
      select: { id: true, plateNumber: true, province: true, dailyTarget: true, dailyCount: true, status: true, enabled: true },
    })

    const plateIds = plates.map((p) => p.id)

    const jobWhere: Record<string, unknown> = {}
    if (plateIds.length > 0) jobWhere.waybill = { plateId: { in: plateIds } }
    if (status && status !== 'ALL') jobWhere.status = status

    const [jobs, totalJobs, stats] = await Promise.all([
      prisma.job.findMany({
        where: jobWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          waybill: {
            select: {
              id: true, waybillNumber: true, status: true, originProvince: true, originCity: true,
              destProvince: true, destCity: true, createdAt: true,
              plate: { select: { plateNumber: true } },
              driver: { select: { name: true } },
            },
          },
        },
      }),
      prisma.job.count({ where: jobWhere }),
      prisma.job.groupBy({
        by: ['status'],
        where: plateIds.length > 0 ? { waybill: { plateId: { in: plateIds } } } : {},
        _count: { id: true },
      }),
    ])

    const statusStats = {
      total: totalJobs,
      completed: stats.find((s) => s.status === 'completed')?._count.id || 0,
      failed: stats.find((s) => s.status === 'failed')?._count.id || 0,
      pending: stats.find((s) => s.status === 'pending') || 0,
    }

    return NextResponse.json({
      records: jobs.map((j) => ({
        id: j.id,
        plateNumber: j.waybill?.plate?.plateNumber || '-',
        waybillNumber: j.waybill?.waybillNumber || '-',
        status: j.status === 'completed' ? 'موفق' : j.status === 'failed' ? 'ناموفق' : j.status === 'pending' ? 'در انتظار' : j.status,
        driver: j.waybill?.driver?.name || '-',
        origin: j.waybill?.originProvince ? `${j.waybill.originProvince} - ${j.waybill.originCity || ''}` : '-',
        dest: j.waybill?.destProvince ? `${j.waybill.destProvince} - ${j.waybill.destCity || ''}` : '-',
        createdAt: j.createdAt.toISOString(),
        error: j.error,
      })),
      plates,
      stats: statusStats,
      pagination: { page, limit, total: totalJobs, totalPages: Math.ceil(totalJobs / limit) },
    })
  } catch {
    return NextResponse.json({ records: [], plates: [], stats: { total: 0, completed: 0, failed: 0, pending: 0 }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
  }
}
