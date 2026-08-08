import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

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

function normalizeEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase()
}

function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'owner') return true
  // مدیر نباید مالک بسازد یا کسی را مالک کند.
  return targetRole !== 'owner'
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_users')
  if (!guard.ok) return guard.response

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
  const guard = await requirePermission(request, 'manage_users')
  if (!guard.ok) return guard.response

  const body = await request.json()
  const name = String(body.name || '').trim()
  const email = normalizeEmail(body.email)
  const password = String(body.password || '')
  const role = String(body.role || 'operator')
  const phone = body.phone ? String(body.phone).trim() : null
  const department = body.department ? String(body.department).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'نام، ایمیل و رمز عبور الزامی هستند' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
  }
  if (!canAssignRole(guard.user.role, role)) {
    return NextResponse.json({ error: 'فقط مالک سیستم می‌تواند نقش مالک ایجاد کند' }, { status: 403 })
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
      role,
      phone,
      department,
      notes,
      status: 'active',
    },
    select: userSelect,
  })

  await prisma.auditLog.create({
    data: { userId: guard.user.userId, action: 'user_created', resource: 'user', resourceId: created.id, details: { email, role } },
  }).catch(() => {})

  return NextResponse.json(created, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_users')
  if (!guard.ok) return guard.response

  const body = await request.json()
  const { id, action } = body

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  if (target.role === 'owner' && guard.user.role !== 'owner') {
    return NextResponse.json({ error: 'فقط مالک سیستم می‌تواند کاربر مالک را تغییر دهد' }, { status: 403 })
  }

  if (action === 'lock') {
    if (id === guard.user.userId) return NextResponse.json({ error: 'نمی‌توانید حساب خودتان را قفل کنید' }, { status: 400 })
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
      data: { password: hashed, mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
      select: userSelect,
    })
    return NextResponse.json({ ...updated, newPassword: randomPass })
  }

  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = String(body.name || '').trim()
  if (body.email !== undefined) {
    const email = normalizeEmail(body.email)
    if (!email) return NextResponse.json({ error: 'ایمیل الزامی است' }, { status: 400 })
    const duplicate = await prisma.user.findUnique({ where: { email } })
    if (duplicate && duplicate.id !== id) return NextResponse.json({ error: 'ایمیل تکراری است' }, { status: 400 })
    updateData.email = email
  }
  if (body.phone !== undefined) updateData.phone = body.phone ? String(body.phone).trim() : null
  if (body.department !== undefined) updateData.department = body.department ? String(body.department).trim() : null
  if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes).trim() : null

  if (body.role !== undefined) {
    const newRole = String(body.role)
    if (!canAssignRole(guard.user.role, newRole)) {
      return NextResponse.json({ error: 'فقط مالک سیستم می‌تواند نقش مالک بدهد' }, { status: 403 })
    }
    if (id === guard.user.userId && newRole !== target.role) {
      return NextResponse.json({ error: 'نمی‌توانید نقش خودتان را تغییر دهید' }, { status: 400 })
    }
    updateData.role = newRole
  }

  if (body.status !== undefined) {
    const newStatus = String(body.status)
    if (id === guard.user.userId && newStatus !== 'active') {
      return NextResponse.json({ error: 'نمی‌توانید حساب خودتان را مسدود کنید' }, { status: 400 })
    }
    updateData.status = newStatus
  }

  if (body.password) {
    const password = String(body.password)
    if (password.length < 6) return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
    updateData.password = await bcrypt.hash(password, 10)
    updateData.mustChangePassword = false
    updateData.failedAttempts = 0
    updateData.lockedUntil = null
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
    await prisma.auditLog.create({
      data: { userId: guard.user.userId, action: 'user_updated', resource: 'user', resourceId: id, details: { fields: Object.keys(updateData) } },
    }).catch(() => {})
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'خطا در بروزرسانی' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_users')
  if (!guard.ok) return guard.response
  if (guard.user.role !== 'owner') return NextResponse.json({ error: 'فقط مالک سیستم می‌تواند کاربر حذف کند' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  if (id === guard.user.userId) {
    return NextResponse.json({ error: 'نمی‌توانید خود را حذف کنید' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })

  if (target.role === 'owner') {
    const owners = await prisma.user.count({ where: { role: 'owner' } })
    if (owners <= 1) return NextResponse.json({ error: 'آخرین مالک سیستم قابل حذف نیست' }, { status: 400 })
  }

  await prisma.refreshToken.deleteMany({ where: { userId: id } })
  await prisma.session.deleteMany({ where: { userId: id } })
  await prisma.user.delete({ where: { id } })
  await prisma.auditLog.create({
    data: { userId: guard.user.userId, action: 'user_deleted', resource: 'user', resourceId: id, details: { email: target.email, role: target.role } },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
