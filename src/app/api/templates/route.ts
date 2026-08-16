import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const plateNumber = searchParams.get('plate') || ''
    const where: Record<string, unknown> = plateNumber ? { plateNumber } : {}
    const data = await prisma.barbargTemplate.findMany({ where, orderBy: [{ isFavorite: 'desc' }, { useCount: 'desc' }, { updatedAt: 'desc' }] })
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
    const template = await prisma.barbargTemplate.create({ data: body })
    return NextResponse.json(template, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
