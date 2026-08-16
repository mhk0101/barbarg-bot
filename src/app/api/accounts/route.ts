import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const where: Record<string, unknown> = {}
    if (search) where.OR = [{ username: { contains: search, mode: 'insensitive' as const } }, { nationalId: { contains: search } }]
    if (status && status !== 'ALL') where.status = status
    const data = await prisma.account.findMany({ where, orderBy: { createdAt: 'desc' }, select: { id: true, username: true, nationalId: true, description: true, status: true, dailyLimit: true, dailyUsed: true, lastActivity: true, createdAt: true } })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response
  try {
    const body = await request.json()
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.hash(body.password, 10)
    const account = await prisma.account.create({ data: { username: body.username, password: hashed, nationalId: body.nationalId, description: body.description, dailyLimit: body.dailyLimit || 50 }, select: { id: true, username: true, nationalId: true, description: true, status: true, dailyLimit: true, dailyUsed: true, lastActivity: true, createdAt: true } })
    return NextResponse.json(account, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
