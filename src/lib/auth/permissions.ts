/**
 * اعمال دسترسی‌های تعریف‌شده در صفحه‌ی «نقش‌ها»
 * ═══════════════════════════════════════════════════════════
 *
 * منبع حقیقت، همان چیزی است که در /panel/roles می‌بینی و
 * در دیتابیس (Setting با کلید roles.list) ذخیره شده است:
 *
 *   مالک      *  (همه)
 *   مدیر      ۱۶ دسترسی
 *   اپراتور   ۳  دسترسی — view_waybill, create_waybill, view_drivers
 *   مشاهده‌گر  ۲  دسترسی — view_waybill, view_reports
 *
 * اگر از صفحه‌ی نقش‌ها دسترسی‌ای را عوض کنی، همین‌جا هم اثر می‌کند.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/authService'
import { prisma } from '@/lib/prisma'

/** همان کلیدهایی که در صفحه‌ی نقش‌ها استفاده می‌شوند */
export type PermKey =
  | 'view_waybill' | 'create_waybill' | 'edit_waybill' | 'delete_waybill'
  | 'view_drivers' | 'create_drivers'
  | 'view_vehicles' | 'create_vehicles'
  | 'view_plates' | 'create_plates'
  | 'control_bot' | 'view_queue' | 'manage_workers'
  | 'view_reports' | 'export_excel' | 'export_pdf'
  | 'manage_settings' | 'manage_users' | 'view_logs' | 'view_notifications'

/** نسخه‌ی پشتیبان — اگر دیتابیس در دسترس نبود */
const DEFAULT_ROLES: Array<{ name: string; permissions: string[] }> = [
  { name: 'owner', permissions: ['*'] },
  {
    name: 'admin',
    permissions: [
      'view_waybill', 'create_waybill', 'edit_waybill', 'delete_waybill',
      'view_drivers', 'create_drivers', 'view_vehicles', 'create_vehicles',
      'view_plates', 'create_plates', 'control_bot', 'view_queue',
      'manage_workers', 'view_reports', 'export_excel', 'export_pdf',
    ],
  },
  { name: 'operator', permissions: ['view_waybill', 'create_waybill', 'view_drivers'] },
  { name: 'viewer', permissions: ['view_waybill', 'view_reports'] },
]

export interface AuthUser {
  userId: string
  email: string
  role: string
}

/* کش کوتاه‌مدت تا هر درخواست به دیتابیس نزند */
let cache: { at: number; roles: Array<{ name: string; permissions: string[] }> } | null = null
const CACHE_MS = 30_000

async function loadRoles(): Promise<Array<{ name: string; permissions: string[] }>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.roles
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'roles.list' } })
    const roles =
      setting && Array.isArray(setting.value)
        ? (setting.value as Array<{ name: string; permissions: string[] }>)
        : DEFAULT_ROLES
    cache = { at: Date.now(), roles }
    return roles
  } catch {
    return DEFAULT_ROLES
  }
}

/** آیا این نقش، این دسترسی را دارد؟ */
export async function roleCan(role: string | undefined, perm: PermKey): Promise<boolean> {
  if (!role) return false
  const roles = await loadRoles()
  const r = roles.find((x) => x.name === role)
  if (!r) return false
  return r.permissions.includes('*') || r.permissions.includes(perm)
}

/** فهرست دسترسی‌های یک نقش — برای فیلتر منوی سایدبار */
export async function permissionsOf(role: string | undefined): Promise<string[]> {
  if (!role) return []
  const roles = await loadRoles()
  const r = roles.find((x) => x.name === role)
  if (!r) return []
  return r.permissions
}

/** کاربر فعلی از روی کوکی */
export async function currentUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return { userId: payload.userId, email: payload.email, role: payload.role }
}

/**
 * نگهبان مسیرهای API.
 *
 *   const g = await requirePermission(request, 'create_waybill')
 *   if (!g.ok) return g.response
 */
export async function requirePermission(
  request: NextRequest,
  perm: PermKey,
): Promise<{ ok: true; user: AuthUser } | { ok: false; response: NextResponse }> {
  const user = await currentUser(request)

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 }),
    }
  }

  if (!(await roleCan(user.role, perm))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'شما دسترسی لازم برای این کار را ندارید — با مدیر سیستم تماس بگیرید' },
        { status: 403 },
      ),
    }
  }

  return { ok: true, user }
}

/** فقط بررسی ورود، بدون دسترسی خاص */
export async function requireLogin(
  request: NextRequest,
): Promise<{ ok: true; user: AuthUser } | { ok: false; response: NextResponse }> {
  const user = await currentUser(request)
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 }),
    }
  }
  return { ok: true, user }
}
