import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') where.status = status

    const [data, total] = await Promise.all([
      prisma.job.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { waybill: { select: { id: true, waybillNumber: true } } } }),
      prisma.job.count({ where }),
    ])

    return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, waybillId } = body
    if (!type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const job = await prisma.job.create({
      data: { type, waybillId: waybillId || null },
    })
    return NextResponse.json(job, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
