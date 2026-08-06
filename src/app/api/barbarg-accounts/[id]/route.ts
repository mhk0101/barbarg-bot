import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { encryptPassword } from '@/lib/encryption'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  const { id } = await params
  const item = await prisma.barBargAccount.findUnique({
    where: { id },
    select: { id: true, accountName: true, username: true, company: true, status: true, lastLogin: true, lastError: true, notes: true, phone: true, smsWebhookToken: true, createdAt: true, updatedAt: true },
  })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const { id } = await params
    const body = await request.json()
    const updateData: Record<string, unknown> = {}
    if (body.accountName !== undefined) updateData.accountName = body.accountName
    if (body.username !== undefined) updateData.username = body.username
    if (body.company !== undefined) updateData.company = body.company || null
    if (body.status !== undefined) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.phone !== undefined) updateData.phone = body.phone || null
    if (body.password && body.password.length > 0) {
      updateData.passwordEncrypted = encryptPassword(body.password)
    }

    const item = await prisma.barBargAccount.update({
      where: { id }, data: updateData,
      select: { id: true, accountName: true, username: true, company: true, status: true, lastLogin: true, lastError: true, notes: true, phone: true, smsWebhookToken: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json(item)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const { id } = await params
    await prisma.barBargAccount.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
