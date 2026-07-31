import { NextRequest, NextResponse } from 'next/server'
import { login, logout } from '@/lib/auth/authService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, rememberMe } = body
    if (!email || !password) return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 })

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ua = request.headers.get('user-agent') || 'unknown'

    const result = await login(email, password, rememberMe, ip, ua)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 })

    const response = NextResponse.json({ user: result.user })
    response.cookies.set('access_token', result.accessToken!, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: rememberMe ? 30 * 24 * 3600 : 3600, path: '/' })
    if (rememberMe) response.cookies.set('refresh_token', result.refreshToken!, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 3600, path: '/' })
    return response
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value
    if (token) {
      const { verifyToken } = await import('@/lib/auth/authService')
      const payload = await verifyToken(token)
      if (payload) await logout(payload.userId)
    }
    const response = NextResponse.json({ success: true })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  } catch {
    const response = NextResponse.json({ success: true })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  }
}
