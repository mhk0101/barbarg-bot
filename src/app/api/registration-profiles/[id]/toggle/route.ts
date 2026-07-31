import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const current = await prisma.registrationProfile.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!current) {
      return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
    }
    const newStatus = current.status === 'active' ? 'disabled' : 'active'
    const item = await prisma.registrationProfile.update({
      where: { id },
      data: { status: newStatus },
    })
    return NextResponse.json(item)
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}
