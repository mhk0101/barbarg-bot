import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_vehicles')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const where: Record<string, unknown> = search
      ? { OR: [{ vehicleType: { contains: search, mode: 'insensitive' as const } }] }
      : {}
    const data = await prisma.vehicle.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { name: true, id: true } },
        plates: { select: { id: true, plateNumber: true, dailyCount: true, dailyTarget: true, enabled: true, status: true } },
        _count: { select: { plates: true, waybills: true } },
      },
    })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'create_vehicles')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const vehicle = await prisma.vehicle.create({ data: body })
    return NextResponse.json(vehicle, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
