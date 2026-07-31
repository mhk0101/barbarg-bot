import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/logout') || pathname.startsWith('/api/health')) {
    return NextResponse.next()
  }

  if (pathname === '/login' || pathname === '/') {
    const token = request.cookies.get('access_token')?.value
    if (token && pathname === '/login') return NextResponse.redirect(new URL('/panel', request.url))
    return NextResponse.next()
  }

  if (pathname.startsWith('/panel') || pathname.startsWith('/api')) {
    const token = request.cookies.get('access_token')?.value
    if (!token) {
      if (pathname.startsWith('/api')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json).*)'] }
