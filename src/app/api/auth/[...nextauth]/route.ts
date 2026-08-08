import { NextRequest, NextResponse } from 'next/server'
import { login, logout, verifyToken } from '@/lib/auth/authService'
import { permissionsOf } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clearAuthCookies(response: NextResponse) {
  const isProd = process.env.NODE_ENV === 'production'
  for (const name of ['access_token', 'refresh_token']) {
    response.cookies.delete({ name, path: '/' })
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 0,
      expires: new Date(0),
      path: '/',
    })
  }
}

async function getDbUserFromRequest(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true, email: true, name: true, phone: true, department: true, role: true,
      status: true, avatar: true, lastLogin: true, lastActivity: true, mustChangePassword: true,
      lockedUntil: true,
    },
  }).catch(() => null)
  if (!user) return null
  if (user.status !== 'active') return null
  if (user.lockedUntil && user.lockedUntil > new Date()) return null
  return user
}

async function routeName(ctx: { params: Promise<{ nextauth?: string[] }> }) {
  const params = await ctx.params
  return (params.nextauth || [])[0] || ''
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ nextauth?: string[] }> }) {
  const name = await routeName(ctx)

  // سازگاری با کلاینت‌هایی که هنوز /api/auth/session را صدا می‌زنند.
  if (name === 'session') {
    const user = await getDbUserFromRequest(request)
    if (!user) return NextResponse.json({ user: null, expires: null })
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      expires: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
  }

  // اگر Turbopack به اشتباه catch-all را به‌جای route ثابت انتخاب کرد، اینجا هندل می‌کنیم.
  if (name === 'profile') {
    const user = await getDbUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ user })
  }

  if (name === 'my-permissions') {
    const user = await getDbUserFromRequest(request)
    if (!user) return NextResponse.json({ role: null, permissions: [] }, { status: 401 })
    const permissions = await permissionsOf(user.role)
    return NextResponse.json({ role: user.role, permissions })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ nextauth?: string[] }> }) {
  const name = await routeName(ctx)

  // fallback برای /api/auth/login در صورت تداخل catch-all
  if (name === 'login') {
    try {
      const body = await request.json()
      const { email, password, rememberMe } = body
      if (!email || !password) return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 })

      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      const ua = request.headers.get('user-agent') || 'unknown'
      const result = await login(email, password, rememberMe, ip, ua)
      if (result.error) return NextResponse.json({ error: result.error }, { status: 401 })

      const response = NextResponse.json({ user: result.user })
      response.cookies.set('access_token', result.accessToken!, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
        maxAge: rememberMe ? 30 * 24 * 3600 : 3600, path: '/',
      })
      if (rememberMe) {
        response.cookies.set('refresh_token', result.refreshToken!, {
          httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
          maxAge: 30 * 24 * 3600, path: '/',
        })
      }
      return response
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ nextauth?: string[] }> }) {
  const name = await routeName(ctx)

  if (name === 'login' || name === 'logout' || name === 'signout') {
    try {
      const token = request.cookies.get('access_token')?.value
      if (token) {
        const payload = await verifyToken(token)
        if (payload) await logout(payload.userId)
      }
    } catch { /* ignore */ }
    const response = NextResponse.json({ success: true })
    clearAuthCookies(response)
    return response
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
