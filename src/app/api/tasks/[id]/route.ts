import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'view_queue')
  if (!guard.ok) return guard.response
  const { id } = await params
  const item = await prisma.job.findUnique({ where: { id }, include: { waybill: true, logs: true, errorLogs: true } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'control_bot')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await request.json()
  const item = await prisma.job.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'control_bot')
  if (!guard.ok) return guard.response
  const { id } = await params
  await prisma.job.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
