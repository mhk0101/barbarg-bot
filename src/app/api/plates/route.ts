import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}
    if (search) where.OR = [{ plateNumber: { contains: search, mode: 'insensitive' } }, { account: { username: { contains: search, mode: 'insensitive' } } }]
    if (status && status !== 'ALL') where.status = status

    const [data, total] = await Promise.all([
      prisma.licensePlate.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { account: { select: { username: true } } } }),
      prisma.licensePlate.count({ where }),
    ])

    return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { plateNumber, province, accountId } = body
    if (!plateNumber || !province || !accountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const plate = await prisma.licensePlate.create({
      data: { plateNumber, province, accountId },
    })
    return NextResponse.json(plate, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
