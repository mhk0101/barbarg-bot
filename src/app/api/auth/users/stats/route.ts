import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/authService'
import { prisma } from '@/lib/prisma'

async function authCheck(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function GET(request: NextRequest) {
  const user = await authCheck(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [total, active, blocked, locked] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.user.count({ where: { status: 'blocked' } }),
    prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
  ])

  const [owner, admin, operator, viewer] = await Promise.all([
    prisma.user.count({ where: { role: 'owner' } }),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { role: 'operator' } }),
    prisma.user.count({ where: { role: 'viewer' } }),
  ])

  const recentLogins = await prisma.user.findMany({
    where: { lastLogin: { not: null } },
    select: { id: true, name: true, email: true, lastLogin: true, role: true },
    orderBy: { lastLogin: 'desc' },
    take: 5,
  })

  return NextResponse.json({
    total,
    active,
    blocked,
    locked,
    byRole: { owner, admin, operator, viewer },
    recentLogins,
  })
}
