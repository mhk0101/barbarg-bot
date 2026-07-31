import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/authService'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

async function authCheck(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null
  return verifyToken(token)
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  department: true,
  role: true,
  status: true,
  avatar: true,
  notes: true,
  mustChangePassword: true,
  failedAttempts: true,
  lockedUntil: true,
  lastLogin: true,
  lastActivity: true,
  createdAt: true,
  updatedAt: true,
}

export async function GET(request: NextRequest) {
  const user = await authCheck(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || undefined
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')))
  const role = searchParams.get('role') || undefined
  const status = searchParams.get('status') || undefined

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (role) where.role = role
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

export async function POST(request: NextRequest) {
  const user = await authCheck(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, email, password, role, phone, department, notes } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'نام، ایمیل و رمز عبور الزامی هستند' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'ایمیل تکراری است' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const created = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: role || 'operator',
      phone: phone || null,
      department: department || null,
      notes: notes || null,
    },
    select: userSelect,
  })

  return NextResponse.json(created, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const user = await authCheck(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, name, email, phone, department, role, status, notes, password, action } = body

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  if (action === 'lock') {
    const updated = await prisma.user.update({
      where: { id },
      data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
      select: userSelect,
    })
    return NextResponse.json(updated)
  }

  if (action === 'unlock') {
    const updated = await prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedAttempts: 0 },
      select: userSelect,
    })
    return NextResponse.json(updated)
  }

  if (action === 'resetPassword') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
    let randomPass = ''
    for (let i = 0; i < 12; i++) {
      randomPass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const hashed = await bcrypt.hash(randomPass, 10)
    const updated = await prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: userSelect,
    })
    return NextResponse.json({ ...updated, newPassword: randomPass })
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email
  if (phone !== undefined) updateData.phone = phone
  if (department !== undefined) updateData.department = department
  if (role !== undefined) updateData.role = role
  if (status !== undefined) updateData.status = status
  if (notes !== undefined) updateData.notes = notes

  if (password) {
    updateData.password = await bcrypt.hash(password, 10)
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No data to update' }, { status: 400 })
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'خطا در بروزرسانی' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authCheck(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner') return NextResponse.json({ error: 'Only owner can delete users' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  if (id === user.userId) {
    return NextResponse.json({ error: 'نمی‌توانید خود را حذف کنید' }, { status: 400 })
  }

  await prisma.refreshToken.deleteMany({ where: { userId: id } })
  await prisma.session.deleteMany({ where: { userId: id } })
  await prisma.user.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
