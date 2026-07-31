import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, hashPassword } from '@/lib/auth/authService'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, email: true, name: true, phone: true, department: true, role: true, status: true, avatar: true, lastLogin: true, lastActivity: true, mustChangePassword: true } })
  return NextResponse.json({ user })
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await request.json()
  if (body.password) {
    const bcrypt = await import('bcryptjs')
    body.password = await bcrypt.hash(body.password, 10)
    body.mustChangePassword = false
  }
  const user = await prisma.user.update({ where: { id: payload.userId }, data: body, select: { id: true, email: true, name: true, phone: true, department: true, role: true, status: true } })
  return NextResponse.json({ user })
}
