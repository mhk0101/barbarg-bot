import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Matches SMS-forwarder apps (SMS Forwarder, Macrodroid, Tasker, etc.) posting
// either JSON or x-www-form-urlencoded bodies. Field names vary between apps,
// so we accept several common aliases.
const TEXT_FIELDS = ['message', 'text', 'body', 'sms', 'content']
const FROM_FIELDS = ['from', 'sender', 'number', 'originator']
const LINK_REGEX = /https?:\/\/[^\s"'<>]+/i

async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      return await request.json()
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const obj: Record<string, unknown> = {}
      for (const [k, v] of form.entries()) obj[k] = v
      return obj
    }
    // Fallback: try JSON, then treat raw body as the message text itself
    const raw = await request.text()
    try {
      return JSON.parse(raw)
    } catch {
      return { message: raw }
    }
  } catch {
    return {}
  }
}

function pickField(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = body[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'توکن الزامی است' }, { status: 400 })

  const account = await prisma.barBargAccount.findUnique({ where: { smsWebhookToken: token } })
  if (!account) return NextResponse.json({ error: 'توکن نامعتبر است' }, { status: 404 })

  const body = await parseBody(request)
  const rawText = pickField(body, TEXT_FIELDS)
  if (!rawText) return NextResponse.json({ error: 'متن پیامک یافت نشد' }, { status: 400 })

  const fromNumber = pickField(body, FROM_FIELDS)
  const linkMatch = rawText.match(LINK_REGEX)
  const extractedLink = linkMatch ? linkMatch[0] : null

  const sms = await prisma.smsMessage.create({
    data: {
      accountId: account.id,
      fromNumber,
      rawText,
      extractedLink,
      status: 'pending',
    },
  })

  return NextResponse.json({
    success: true,
    id: sms.id,
    accountId: account.id,
    extractedLink,
  })
}

// Some SMS-forwarder apps only support GET requests with query params.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'توکن الزامی است' }, { status: 400 })

  const account = await prisma.barBargAccount.findUnique({ where: { smsWebhookToken: token } })
  if (!account) return NextResponse.json({ error: 'توکن نامعتبر است' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const body: Record<string, unknown> = {}
  for (const [k, v] of searchParams.entries()) body[k] = v

  const rawText = pickField(body, TEXT_FIELDS)
  if (!rawText) return NextResponse.json({ error: 'متن پیامک یافت نشد' }, { status: 400 })

  const fromNumber = pickField(body, FROM_FIELDS)
  const linkMatch = rawText.match(LINK_REGEX)
  const extractedLink = linkMatch ? linkMatch[0] : null

  const sms = await prisma.smsMessage.create({
    data: { accountId: account.id, fromNumber, rawText, extractedLink, status: 'pending' },
  })

  return NextResponse.json({ success: true, id: sms.id, accountId: account.id, extractedLink })
}
