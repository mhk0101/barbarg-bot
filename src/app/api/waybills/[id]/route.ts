import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.waybill.findUnique({
    where: { id },
    include: { sender: true, receiver: true, driver: true, vehicle: true, plate: true, cargo: true, jobs: true, timeline: true },
  })
  return item ? NextResponse.json(item) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const item = await prisma.waybill.update({ where: { id }, data: body })
  return NextResponse.json(item)
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.waybill.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
