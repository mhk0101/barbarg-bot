/**
 * محافظت صفحه‌های پنل بر اساس نقش
 * ═══════════════════════════════════════════════════════════
 *
 * بدون این، کاربر می‌توانست آدرس را مستقیم در نوار مرورگر تایپ
 * کند و وارد صفحه‌ای شود که منویش برایش پنهان شده است.
 *
 * دسترسی‌ها همان کلیدهای صفحه‌ی «نقش‌ها» هستند.
 *
 * ⚠ اینجا Edge runtime است — prisma در دسترس نیست، پس نقش‌های
 *   پیش‌فرض اینجا نوشته شده‌اند. اگر از صفحه‌ی «نقش‌ها» دسترسی‌ای
 *   را عوض کنی، APIها و سایدبار فورا اثر می‌گیرند ولی این فهرست
 *   باید دستی به‌روز شود. (محافظت اصلی سمت API است.)
 */
import { NextRequest, NextResponse } from 'next/server'

const GUARDED: Array<{ prefix: string; perm: string }> = [
  { prefix: '/panel/barbarg-accounts',    perm: 'manage_settings' },
  { prefix: '/panel/users',               perm: 'manage_users' },
  { prefix: '/panel/roles',               perm: 'manage_settings' },
  { prefix: '/panel/settings',            perm: 'manage_settings' },
  { prefix: '/panel/system-health',       perm: 'manage_settings' },
  { prefix: '/panel/logs',                perm: 'view_logs' },
  { prefix: '/panel/automation/workers',  perm: 'manage_workers' },
  { prefix: '/panel/automation/browsers', perm: 'manage_workers' },
]

const ROLE_PERMS: Record<string, string[]> = {
  owner: ['*'],
  admin: [
    'view_waybill', 'create_waybill', 'edit_waybill', 'delete_waybill',
    'view_drivers', 'create_drivers', 'view_vehicles', 'create_vehicles',
    'view_plates', 'create_plates', 'control_bot', 'view_queue',
    'manage_workers', 'view_reports', 'export_excel', 'export_pdf',
  ],
  operator: ['view_waybill', 'create_waybill', 'view_drivers'],
  viewer: ['view_waybill', 'view_reports'],
}

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function readPayload(token: string): { role?: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(b64urlDecode(parts[1]))
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const hit = GUARDED.find((g) => pathname.startsWith(g.prefix))
  if (!hit) return NextResponse.next()

  const token = request.cookies.get('access_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  const payload = readPayload(token)
  if (!payload) return NextResponse.redirect(new URL('/login', request.url))

  const perms = ROLE_PERMS[payload.role ?? ''] ?? []
  const allowed = perms.includes('*') || perms.includes(hit.perm)

  if (!allowed) {
    const url = new URL('/panel', request.url)
    url.searchParams.set('denied', hit.prefix.replace('/panel/', ''))
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/panel/barbarg-accounts/:path*',
    '/panel/users/:path*',
    '/panel/roles/:path*',
    '/panel/settings/:path*',
    '/panel/system-health/:path*',
    '/panel/logs/:path*',
    '/panel/automation/workers/:path*',
    '/panel/automation/browsers/:path*',
  ],
}
