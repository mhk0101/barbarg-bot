import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/permissions'
import { hashPassword } from '@/lib/auth/authService'
import { prisma } from '@/lib/prisma'

const profileSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  department: true,
  role: true,
  status: true,
  avatar: true,
  lastLogin: true,
  lastActivity: true,
  mustChangePassword: true,
}

export async function GET(request: NextRequest) {
  const auth = await currentUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: profileSelect })
  return user
    ? NextResponse.json({ user })
    : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function PUT(request: NextRequest) {
  const auth = await currentUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const data: Record<string, unknown> = {}

  // فقط فیلدهای بی‌خطر پروفایل خود کاربر قابل ویرایش است.
  // role/status/lockedUntil/failedAttempts/mustChangePassword از این API قابل تغییر نیستند.
  if (body.name !== undefined) data.name = String(body.name || '').trim()
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null
  if (body.department !== undefined) data.department = body.department ? String(body.department).trim() : null
  if (body.avatar !== undefined) data.avatar = body.avatar ? String(body.avatar).trim() : null

  if (body.password) {
    const password = String(body.password)
    if (password.length < 6) return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' }, { status: 400 })
    data.password = await hashPassword(password)
    data.mustChangePassword = false
    data.failedAttempts = 0
    data.lockedUntil = null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'هیچ فیلد مجازی برای بروزرسانی ارسال نشده است' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: profileSelect,
  })

  await prisma.auditLog.create({
    data: { userId: auth.userId, action: 'profile_updated', resource: 'auth', details: { fields: Object.keys(data).filter((x) => x !== 'password') } },
  }).catch(() => {})

  return NextResponse.json({ user })
}
