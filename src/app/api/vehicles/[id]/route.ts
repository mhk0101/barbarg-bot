import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'view_vehicles')
  if (!guard.ok) return guard.response
  const { id } = await params
  const item = await prisma.vehicle.findUnique({ where: { id }, include: { driver: true, plates: true } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'create_vehicles')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await request.json()
  const item = await prisma.vehicle.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'create_vehicles')
  if (!guard.ok) return guard.response
  const { id } = await params
  await prisma.vehicle.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
