import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  try {
    const data = await prisma.quickRegistrationJob.findMany({ orderBy: { createdAt: 'desc' }, include: { template: true } })
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
    const job = await prisma.quickRegistrationJob.create({ data: { templateId: body.templateId, plateNumber: body.plateNumber, targetCount: body.targetCount, status: 'pending' } })
    return NextResponse.json(job, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requirePermission(request, 'control_bot')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const job = await prisma.quickRegistrationJob.update({ where: { id: body.id }, data: { completedCount: body.completedCount, status: body.status, startedAt: body.startedAt, completedAt: body.completedAt } })
    return NextResponse.json(job)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id الزامی است' }, { status: 400 })
    await prisma.quickRegistrationJob.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
