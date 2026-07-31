import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const updateData: Record<string, unknown> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.accountId !== undefined) updateData.accountId = body.accountId
    const item = await prisma.smsMessage.update({ where: { id }, data: updateData })
    return NextResponse.json(item)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.smsMessage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}
