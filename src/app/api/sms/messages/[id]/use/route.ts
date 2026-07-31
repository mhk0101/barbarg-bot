import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { smsLinkFlow } from '@/automation/auth/SmsLinkFlow'

export async function POST(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sms = await prisma.smsMessage.findUnique({ where: { id } })
    if (!sms) return NextResponse.json({ error: 'پیام یافت نشد' }, { status: 404 })
    if (!sms.extractedLink) return NextResponse.json({ error: 'لینکی در این پیام یافت نشد' }, { status: 400 })
    if (!sms.accountId) return NextResponse.json({ error: 'این پیام به هیچ حسابی متصل نیست' }, { status: 400 })

    const result = await smsLinkFlow.openVerificationLink(sms.accountId, sms.extractedLink)

    await prisma.smsMessage.update({
      where: { id },
      data: {
        status: result.success ? 'used' : 'failed',
        usedAt: result.success ? new Date() : null,
        resultMessage: result.success ? `باز شد: ${result.finalUrl}` : result.error,
      },
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا' }, { status: 500 })
  }
}
