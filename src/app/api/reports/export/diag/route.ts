/**
 * تشخیص مشکل خروجی گزارش
 *
 *   http://localhost:3000/api/reports/export/diag
 *
 * هر مرحله را جدا تست می‌کند تا معلوم شود دقیقا کجا می‌شکند.
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'export_pdf')
  if (!guard.ok) return guard.response
  const steps: Array<{ step: string; ok: boolean; detail: string }> = []

  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn()
      steps.push({ step: name, ok: true, detail })
    } catch (e) {
      steps.push({
        step: name,
        ok: false,
        detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : String(e).slice(0, 400),
      })
    }
  }

  await run('۱) اتصال به دیتابیس', async () => {
    await prisma.$queryRaw`SELECT 1`
    return 'اتصال برقرار است'
  })

  await run('۲) خواندن جدول AutomationResult', async () => {
    const n = await prisma.automationResult.count()
    return `${n} رکورد`
  })

  await run('۳) خواندن با روابط (account + worker)', async () => {
    const rows = await prisma.automationResult.findMany({
      include: {
        account: { select: { username: true } },
        worker: { select: { name: true } },
      },
      take: 3,
    })
    return `${rows.length} رکورد با روابط خوانده شد`
  })

  await run('۴) بارگذاری exceljs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('exceljs')
    const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('test')
    return `نسخه بارگذاری شد، نوع: ${typeof ExcelJS.Workbook}`
  })

  await run('۵) ساخت فایل اکسل واقعی', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('exceljs')
    const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('test')
    ws.addRow(['a', 'b'])
    const buf = await wb.xlsx.writeBuffer()
    return `${(buf as ArrayBuffer).byteLength} بایت`
  })

  await run('۶) بارگذاری pdfkit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('pdfkit')
    const PDFDocument = mod.default ?? mod
    return `بارگذاری شد، نوع: ${typeof PDFDocument}`
  })

  await run('۷) ساخت PDF واقعی (تست فونت)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('pdfkit')
    const PDFDocument = mod.default ?? mod
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    const done = new Promise<Buffer>((res, rej) => {
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => res(Buffer.concat(chunks)))
      doc.on('error', rej)
    })
    doc.fontSize(14).font('Helvetica').text('test')
    doc.end()
    const buf = await done
    return `${buf.length} بایت، امضا: ${buf.subarray(0, 5).toString()}`
  })

  const firstFail = steps.find((s) => !s.ok)

  return Response.json(
    {
      نتیجه: firstFail ? `مشکل در «${firstFail.step}»` : 'همه مراحل سالم‌اند',
      علت: firstFail?.detail ?? null,
      مراحل: steps,
    },
    { status: 200 },
  )
}
