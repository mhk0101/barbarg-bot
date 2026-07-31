import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const DEFAULT_ROLES = [
  { name: 'owner', label: 'مالک', permissions: ['*'] },
  { name: 'admin', label: 'مدیر', permissions: ['view_waybill', 'create_waybill', 'edit_waybill', 'delete_waybill', 'view_drivers', 'create_drivers', 'view_vehicles', 'create_vehicles', 'view_plates', 'create_plates', 'control_bot', 'view_queue', 'manage_workers', 'view_reports', 'export_excel', 'export_pdf'] },
  { name: 'operator', label: 'اپراتور', permissions: ['view_waybill', 'create_waybill', 'view_drivers'] },
  { name: 'viewer', label: 'مشاهده‌گر', permissions: ['view_waybill', 'view_reports'] },
]

export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'roles.list' } })
    if (setting && Array.isArray(setting.value)) {
      return NextResponse.json({ data: setting.value })
    }
    await prisma.setting.upsert({
      where: { key: 'roles.list' },
      update: { value: DEFAULT_ROLES },
      create: { key: 'roles.list', value: DEFAULT_ROLES },
    })
    return NextResponse.json({ data: DEFAULT_ROLES })
  } catch {
    return NextResponse.json({ data: DEFAULT_ROLES })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, label, permissions } = body
    if (!name || !label) {
      return NextResponse.json({ error: 'نام و برچسب الزامی است' }, { status: 400 })
    }

    const setting = await prisma.setting.findUnique({ where: { key: 'roles.list' } })
    let roles: Array<{ name: string; label: string; permissions: string[] }> =
      setting && Array.isArray(setting.value) ? (setting.value as Array<{ name: string; label: string; permissions: string[] }>) : [...DEFAULT_ROLES]

    if (roles.some((r) => r.name === name)) {
      return NextResponse.json({ error: 'نقش با این نام قبلاً وجود دارد' }, { status: 400 })
    }

    const newRole = { name, label, permissions: permissions || [] }
    roles.push(newRole)

    await prisma.setting.upsert({
      where: { key: 'roles.list' },
      update: { value: roles },
      create: { key: 'roles.list', value: roles },
    })

    return NextResponse.json(newRole, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, label, permissions } = body
    if (!name) {
      return NextResponse.json({ error: 'نام نقش الزامی است' }, { status: 400 })
    }

    const setting = await prisma.setting.findUnique({ where: { key: 'roles.list' } })
    let roles: Array<{ name: string; label: string; permissions: string[] }> =
      setting && Array.isArray(setting.value) ? (setting.value as Array<{ name: string; label: string; permissions: string[] }>) : [...DEFAULT_ROLES]

    const idx = roles.findIndex((r) => r.name === name)
    if (idx === -1) {
      return NextResponse.json({ error: 'نقش یافت نشد' }, { status: 404 })
    }

    if (label !== undefined) roles[idx].label = label
    if (permissions !== undefined) roles[idx].permissions = permissions

    await prisma.setting.upsert({
      where: { key: 'roles.list' },
      update: { value: roles },
      create: { key: 'roles.list', value: roles },
    })

    return NextResponse.json(roles[idx])
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')
    if (!name) {
      return NextResponse.json({ error: 'نام نقش الزامی است' }, { status: 400 })
    }

    const setting = await prisma.setting.findUnique({ where: { key: 'roles.list' } })
    let roles: Array<{ name: string; label: string; permissions: string[] }> =
      setting && Array.isArray(setting.value) ? (setting.value as Array<{ name: string; label: string; permissions: string[] }>) : [...DEFAULT_ROLES]

    const idx = roles.findIndex((r) => r.name === name)
    if (idx === -1) {
      return NextResponse.json({ error: 'نقش یافت نشد' }, { status: 404 })
    }

    if (name === 'owner') {
      return NextResponse.json({ error: 'نقش مالک قابل حذف نیست' }, { status: 400 })
    }

    roles.splice(idx, 1)

    await prisma.setting.upsert({
      where: { key: 'roles.list' },
      update: { value: roles },
      create: { key: 'roles.list', value: roles },
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}
