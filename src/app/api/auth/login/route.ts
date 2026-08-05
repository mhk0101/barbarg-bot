import { NextRequest, NextResponse } from 'next/server'
import { login, logout } from '@/lib/auth/authService'

/**
 * پاک کردن کوکی‌های احراز هویت.
 *
 * مهم: کوکی با path:'/' ست شده، پس پاک کردنش هم باید همان path
 * را داشته باشد، وگرنه مرورگر کوکی را نگه می‌دارد.
 * علاوه بر delete، مقدار خالی با maxAge:0 هم می‌گذاریم (کمربند و ساسپاند).
 */
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
    clearAuthCookies(response)
    return response
  } catch {
    const response = NextResponse.json({ success: true })
    clearAuthCookies(response)
    return response
  }
}
