import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
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
  try {
    const body = await request.json()
    const notification = await prisma.notification.create({ data: { title: body.title, message: body.message, type: body.type || 'info' } })
    return NextResponse.json(notification, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

export async function DELETE() {
  try {
    await prisma.notification.deleteMany()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
