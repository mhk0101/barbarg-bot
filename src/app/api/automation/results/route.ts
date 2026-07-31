import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const result = await prisma.automationResult.findUnique({
        where: { id },
        include: {
          job: {
            include: { logs: true },
          },
          account: { select: { id: true, username: true } },
          worker: { select: { id: true, name: true, status: true } },
        },
      })
      if (!result) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
      return NextResponse.json(result)
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      where.OR = [
        { plate: { contains: search, mode: 'insensitive' as const } },
        { driver: { contains: search, mode: 'insensitive' as const } },
        { waybillNumber: { contains: search, mode: 'insensitive' as const } },
        { resultMessage: { contains: search, mode: 'insensitive' as const } },
        { account: { username: { contains: search, mode: 'insensitive' as const } } },
        { worker: { name: { contains: search, mode: 'insensitive' as const } } },
      ]
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {}
      if (dateFrom) createdAt.gte = new Date(dateFrom)
      if (dateTo) createdAt.lte = new Date(dateTo + 'T23:59:59.999Z')
      where.createdAt = createdAt
    }

    const [data, total] = await Promise.all([
      prisma.automationResult.findMany({
        where,
        include: {
          account: { select: { id: true, username: true } },
          worker: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.automationResult.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  }
}
