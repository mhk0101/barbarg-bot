import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response
  const { id } = await params
  const item = await prisma.barbargTemplate.findUnique({ where: { id } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await request.json()
  const item = await prisma.barbargTemplate.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response
  try {
    const { id } = await params
    // کارهای «ثبت سریع» وابسته را اول پاک کن تا خطای کلید خارجی ندهد
    await prisma.quickRegistrationJob.deleteMany({ where: { templateId: id } })
    await prisma.barbargTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
