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
    const where: Record<string, unknown> = {}
    if (search) where.OR = [{ waybillNumber: { contains: search } }, { originProvince: { contains: search } }, { destProvince: { contains: search } }]
    if (status && status !== 'ALL') where.status = status
    const data = await prisma.waybill.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, waybillNumber: true, status: true, originProvince: true, originCity: true, destProvince: true, destCity: true, createdAt: true, updatedAt: true } })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const waybill = await prisma.waybill.create({ data: body })
    return NextResponse.json(waybill, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
