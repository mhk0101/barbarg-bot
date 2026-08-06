/**
 * دسترسی‌های کاربر فعلی — برای فیلتر کردن منوی سایدبار
 *
 * خروجی: { role, permissions: [...] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { currentUser, permissionsOf } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) {
    return NextResponse.json({ role: null, permissions: [] }, { status: 401 })
  }
  const permissions = await permissionsOf(user.role)
  return NextResponse.json({ role: user.role, permissions })
}
