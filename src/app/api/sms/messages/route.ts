import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (status && status !== 'ALL') where.status = status

    const data = await prisma.smsMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { account: { select: { id: true, accountName: true, username: true } } },
    })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
