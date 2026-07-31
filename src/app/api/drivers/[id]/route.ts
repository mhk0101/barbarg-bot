import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.driver.findUnique({ where: { id } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const item = await prisma.driver.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.driver.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
