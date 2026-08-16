import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = search
      ? { OR: [{ cardNumber: { contains: search, mode: 'insensitive' } }, { plate: { plateNumber: { contains: search, mode: 'insensitive' } } }] }
      : {}

    const cards = await prisma.fuelCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        plate: { select: { plateNumber: true } },
        fuelLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })

    const totalAllocated = cards.reduce((sum, c) => sum + c.allocatedFuel, 0)
    const totalConsumed = cards.reduce((sum, c) => sum + c.consumedFuel, 0)

    return NextResponse.json({
      cards: cards.map((c) => ({
        id: c.id,
        cardNumber: c.cardNumber,
        fuelType: c.fuelType,
        plate: c.plate?.plateNumber || '-',
        status: c.status,
        allocated: c.allocatedFuel,
        consumed: c.consumedFuel,
        remaining: c.allocatedFuel - c.consumedFuel,
      })),
      logs: cards.flatMap((c) => c.fuelLogs.map((l) => ({
        id: l.id,
        cardNumber: c.cardNumber,
        date: l.date,
        amount: l.amount,
        station: l.station || '-',
      }))),
      stats: { totalCards: cards.length, totalAllocated, totalConsumed, totalRemaining: totalAllocated - totalConsumed },
    })
  } catch {
    return NextResponse.json({ cards: [], logs: [], stats: { totalCards: 0, totalAllocated: 0, totalConsumed: 0, totalRemaining: 0 } })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const card = await prisma.fuelCard.create({ data: body })
    return NextResponse.json(card, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
