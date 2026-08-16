import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_logs')
  if (!guard.ok) return guard.response
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level')
    const resource = searchParams.get('resource')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: Record<string, unknown> = {}
    if (level && level !== 'all') where.level = level
    if (resource && resource !== 'all') where.resource = resource
    if (search) where.OR = [{ message: { contains: search, mode: 'insensitive' as const } }, { action: { contains: search, mode: 'insensitive' as const } }]

    const data = await prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
