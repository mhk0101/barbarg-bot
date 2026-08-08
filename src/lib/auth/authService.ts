import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'barbarg-bot-jwt-secret-2024'
const ACCESS_TOKEN_EXPIRY = '1h'
const REFRESH_TOKEN_EXPIRY = '30d'

interface TokenPayload { userId: string; email: string; role: string }

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64').toString()
}

function sign(data: string): string {
  return base64url(createHmac('sha256', JWT_SECRET).update(data).digest())
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a)
    const bb = Buffer.from(b)
    return ba.length === bb.length && timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

function createToken(payload: TokenPayload, expiresIn: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const exp = expiresIn === '1h' ? now + 3600 : now + 30 * 24 * 3600
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp }))
  const signature = sign(`${header}.${body}`)
  return `${header}.${body}.${signature}`
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts
    const expected = sign(`${header}.${body}`)
    if (!safeEqual(signature, expected)) return null

    const payload = JSON.parse(base64urlDecode(body))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.userId || !payload.email || !payload.role) return null
    return { userId: payload.userId, email: payload.email, role: payload.role }
  } catch { return null }
}

export async function login(email: string, password: string, rememberMe: boolean, ip?: string, ua?: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return { error: 'کاربر یافت نشد' }
  if (user.status === 'blocked') return { error: 'حساب شما مسدود شده' }
  if (user.status === 'disabled') return { error: 'حساب شما غیرفعال است' }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: 'حساب شما قفل شده. بعداً تلاش کنید' }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    const attempts = user.failedAttempts + 1
    const locked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: attempts, lockedUntil: locked } })
    if (locked) return { error: 'حساب شما پس از ۵ تلاش ناموفق قفل شد' }
    return { error: `رمز عبور اشتباه است (${5 - attempts} تلاش باقیمانده)` }
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date(), lastActivity: new Date() } })

  const accessToken = createToken({ userId: user.id, email: user.email, role: user.role }, rememberMe ? REFRESH_TOKEN_EXPIRY : ACCESS_TOKEN_EXPIRY)
  const refreshToken = createToken({ userId: user.id, email: user.email, role: user.role }, REFRESH_TOKEN_EXPIRY)

  await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) } })
  await prisma.session.create({ data: { userId: user.id, token: accessToken, ipAddress: ip, userAgent: ua, expiresAt: new Date(Date.now() + (rememberMe ? 30 * 24 * 3600 * 1000 : 3600 * 1000)) } })

  await prisma.auditLog.create({ data: { userId: user.id, action: 'login', resource: 'auth', ipAddress: ip, userAgent: ua } })

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } }
}

export async function refreshToken(token: string) {
  const payload = await verifyToken(token)
  if (!payload) return { error: 'توکن نامعتبر' }
  const rt = await prisma.refreshToken.findUnique({ where: { token } })
  if (!rt || rt.expiresAt < new Date()) return { error: 'توکن منقضی شده' }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.status !== 'active') return { error: 'کاربر غیرفعال' }

  const newAccessToken = createToken({ userId: user.id, email: user.email, role: user.role }, ACCESS_TOKEN_EXPIRY)
  return { accessToken: newAccessToken }
}

export async function logout(userId: string) {
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.refreshToken.deleteMany({ where: { userId } })
  await prisma.auditLog.create({ data: { userId, action: 'logout', resource: 'auth' } })
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function createUser(data: { email: string; name: string; password: string; role?: string; phone?: string; department?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) return { error: 'ایمیل تکراری است' }
  const hashed = await hashPassword(data.password)
  const user = await prisma.user.create({ data: { ...data, password: hashed, role: data.role || 'operator' } })
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role } }
}

export async function updateUser(id: string, data: Partial<{ name: string; email: string; phone: string; department: string; role: string; status: string; notes: string }>) {
  return prisma.user.update({ where: { id }, data })
}

export async function deleteUser(id: string) {
  await prisma.refreshToken.deleteMany({ where: { userId: id } })
  await prisma.session.deleteMany({ where: { userId: id } })
  return prisma.user.delete({ where: { id } })
}

export async function getUsers(search?: string) {
  const where = search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {}
  return prisma.user.findMany({ where, select: { id: true, email: true, name: true, phone: true, department: true, role: true, status: true, avatar: true, lastLogin: true, lastActivity: true, createdAt: true, mustChangePassword: true }, orderBy: { createdAt: 'desc' } })
}

export async function getAuditLogs(userId?: string, limit = 50) {
  const where = userId ? { userId } : {}
  return prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: limit })
}

export async function seedFirstUser() {
  const count = await prisma.user.count()
  if (count > 0) return
  const hashed = await hashPassword('Admin123456')
  await prisma.user.create({ data: { email: 'admin@barbarg.local', name: 'مالک سیستم', password: hashed, role: 'owner', mustChangePassword: true } })
  console.log('First user created: admin@barbarg.local / Admin123456')
}
