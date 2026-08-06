import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

const DEFAULTS: Record<string, unknown> = {
  'automation.maxConcurrent': 3,
  'automation.timeout': 30,
  'automation.workers': 3,
  'automation.headless': true,
  'automation.actionDelay': 45,
  'retry.maxRetries': 5,
  'retry.intervals': '10,30,60,120,300',
  'company.name': 'شرکت حمل و نقل باربگ',
  'company.nationalId': '',
  'company.phone': '',
  'company.address': '',
  'hours.start': '08:00',
  'hours.end': '18:00',
  'limits.dailyPlateLimit': 100,
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const settings = await prisma.setting.findMany()
    const merged: Record<string, unknown> = { ...DEFAULTS }
    for (const s of settings) merged[s.key] = s.value
    return NextResponse.json({ settings: merged })
  } catch {
    return NextResponse.json({ settings: DEFAULTS })
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const { settings } = body
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
    }
    await prisma.$transaction(
      Object.entries(settings).map(([key, value]) =>
        prisma.setting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } })
      )
    )
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function GET_settings() {
  try {
    const settings = await prisma.setting.findMany()
    const merged: Record<string, unknown> = { ...DEFAULTS }
    for (const s of settings) merged[s.key] = s.value
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}
