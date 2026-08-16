import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_notifications')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread') === 'true'
    const where = unreadOnly ? { read: false } : {}
    const data = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'view_notifications')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const notification = await prisma.notification.create({ data: { title: body.title, message: body.message, type: body.type || 'info' } })
    return NextResponse.json(notification, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requirePermission(request, 'view_notifications')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    if (body.id) {
      await prisma.notification.update({ where: { id: body.id }, data: { read: true } })
    } else if (body.markAll) {
      await prisma.notification.updateMany({ where: { read: false }, data: { read: true } })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requirePermission(request, 'view_notifications')
  if (!guard.ok) return guard.response
  try {
    await prisma.notification.deleteMany()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
