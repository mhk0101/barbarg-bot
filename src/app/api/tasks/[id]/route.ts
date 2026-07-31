import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.job.findUnique({ where: { id }, include: { waybill: true, logs: true, errorLogs: true } })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const item = await prisma.job.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.job.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
