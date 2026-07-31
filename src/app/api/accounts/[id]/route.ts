import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.account.findUnique({ where: { id }, select: { id: true, username: true, nationalId: true, description: true, status: true, dailyLimit: true, dailyUsed: true, lastActivity: true, createdAt: true } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  if (body.password) {
    const bcrypt = await import('bcryptjs')
    body.password = await bcrypt.hash(body.password, 10)
  }
  const item = await prisma.account.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.account.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
