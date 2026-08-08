import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAP_JSON_START = '[map-location-json]'
const MAP_JSON_END = '[/map-location-json]'
const MANUAL_LOCATION_TAG = '[manual-location]'

function decryptPassword(encrypted: string): string {
  const ALGORITHM = 'aes-256-cbc'
  const SECRET = process.env.BARBARG_PASSWORD_KEY || 'barbarg-bot-default-key-change-in-production-32ch!'
  const key = crypto.createHash('sha256').update(SECRET).digest()
  const [ivHex, data] = encrypted.split(':')
  if (!ivHex || !data) return encrypted
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function stripMapBlock(notes: string): string {
  let out = String(notes || '')
  const i = out.indexOf(MAP_JSON_START)
  const j = out.indexOf(MAP_JSON_END)
  if (i >= 0 && j > i) {
    out = (out.slice(0, i) + out.slice(j + MAP_JSON_END.length)).trim()
  }
  return out
}

function buildNotesWithMap(oldNotes: string | null | undefined, mapLocations: unknown): string {
  let notes = stripMapBlock(String(oldNotes || ''))
    .replace(MANUAL_LOCATION_TAG, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const json = JSON.stringify({ ...(mapLocations as object), updatedAt: new Date().toISOString() })
  notes = `${notes ? notes + '\n' : ''}${MAP_JSON_START}${json}${MAP_JSON_END}`.trim()
  return notes
}

function cleanText(v: unknown): string {
  return String(v || '').replace(/[\u200c\s]+/g, ' ').trim()
}

function locationToProfileFields(loc: any, oldProvince: string, oldCity: string, oldAddress: string | null) {
  const province = cleanText(loc?.province) || oldProvince || ''
  const city = cleanText(loc?.county || loc?.city || loc?.neighbourhood || loc?.region) || oldCity || province || ''
  const address = cleanText(loc?.address) || oldAddress || ''
  return { province, city, address }
}

async function loadEngine() {
  // Turbopack مسیر کاملاً داینامیک یا require با مسیر absolute را bundle نمی‌کند.
  // بنابراین موتور اصلی را با import نسبیِ ثابت بارگذاری می‌کنیم.
  // مسیر از این فایل:
  // src/app/api/registration-profiles/[id]/capture-map/route.ts
  // به:
  // src/automation/engine/step1-engine.js
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('../../../../../automation/engine/step1-engine.js')
  const engine = mod?.runProfileMapCapture ? mod : (mod?.default ?? mod)
  if (!engine?.runProfileMapCapture) throw new Error('موتور انتخاب نقشه بارگذاری نشد')
  return engine
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response

  const logs: string[] = []
  const log = (line: string) => {
    const clean = String(line || '').trim()
    if (clean) logs.push(clean.slice(0, 800))
  }

  try {
    const { id } = await params
    const profile = await prisma.registrationProfile.findUnique({
      where: { id },
      include: { barbargAccount: true },
    })
    if (!profile) return NextResponse.json({ error: 'پروفایل یافت نشد' }, { status: 404 })

    let account = profile.barbargAccount
    if (!account) account = await prisma.barBargAccount.findFirst({ where: { status: 'active' } })
    if (!account) {
      return NextResponse.json({ error: 'هیچ حساب باربرگ فعالی برای ورود به سامانه پیدا نشد' }, { status: 400 })
    }

    const engine = await loadEngine()
    const data = engine.profileToData(profile)
    const missing: string[] = engine.validateMapCaptureData(data)
    if (missing.length) {
      return NextResponse.json({
        error: `برای رسیدن به نقشه، این فیلدهای پروفایل باید تکمیل باشند: ${missing.join('، ')}`,
        missing,
      }, { status: 400 })
    }

    log(`شروع انتخاب نقشه برای پروفایل «${profile.name}» با حساب ${account.username}`)

    const result = await engine.runProfileMapCapture({
      credentials: { username: account.username, password: decryptPassword(account.passwordEncrypted) },
      data,
      headless: false,
      mapSettleMs: Number(process.env.BARBARG_MAP_CAPTURE_SETTLE_MS || 6000),
      mapSelectionTimeoutMs: Number(process.env.BARBARG_MAP_CAPTURE_TIMEOUT_MS || 10 * 60 * 1000),
      maxRestarts: Number(process.env.BARBARG_MAX_RESTARTS || 20),
      onLog: log,
    })

    if (!result?.success || !result.mapLocations?.origin || !result.mapLocations?.destination) {
      return NextResponse.json({
        error: result?.error || 'انتخاب مبدا و مقصد از نقشه کامل نشد',
        kind: result?.kind || 'error',
        logs,
      }, { status: 500 })
    }

    const origin = result.mapLocations.origin
    const destination = result.mapLocations.destination
    const o = locationToProfileFields(origin, profile.originProvince, profile.originCity, profile.originAddress)
    const d = locationToProfileFields(destination, profile.destProvince, profile.destCity, profile.destAddress)
    const notes = buildNotesWithMap(profile.notes, { origin, destination })

    const updated = await prisma.registrationProfile.update({
      where: { id: profile.id },
      data: {
        originProvince: o.province,
        originCity: o.city,
        originAddress: o.address || null,
        destProvince: d.province,
        destCity: d.city,
        destAddress: d.address || null,
        notes,
        lastError: null,
      },
      include: {
        barbargAccount: { select: { id: true, accountName: true, username: true } },
      },
    })

    await prisma.activityLog.create({
      data: {
        action: 'profile_map_captured',
        resource: 'registrationProfile',
        resourceId: profile.id,
        details: { origin, destination },
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      profile: updated,
      mapLocations: { origin, destination },
      logs,
    })
  } catch (e: unknown) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'خطای غیرمنتظره در انتخاب نقشه',
      logs,
    }, { status: 500 })
  }
}
