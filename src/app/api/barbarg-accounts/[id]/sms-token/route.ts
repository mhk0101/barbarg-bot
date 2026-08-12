import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// Generates (or regenerates) the secret token used in the account's unique
// SMS-forwarder webhook URL: /api/sms/webhook/{token}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(request, 'manage_settings')
  if (!guard.ok) return guard.response

  try {
    const { id } = await params
    const token = crypto.randomBytes(24).toString('hex')
    const account = await prisma.barBargAccount.update({
      where: { id },
      data: { smsWebhookToken: token },
      select: { id: true, smsWebhookToken: true },
    })
    return NextResponse.json(account)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}
