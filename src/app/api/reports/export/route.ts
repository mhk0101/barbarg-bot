import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/* pdfkit و exceljs فقط در Node کار می‌کنند (فایل سیستم لازم دارند).
   هیچ‌کدام بالای فایل ایمپورت نمی‌شوند — وگرنه اگر یکی خطا بدهد،
   کل مسیر خراب می‌شود و حتی خروجی CSV هم کار نمی‌کند. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ReportQuery {
  format: string
  dateFrom: string | null
  dateTo: string | null
  status: string
  plate: string
  driver: string
  account: string
}

interface AutomationRow {
  id: string
  plate: string | null
  driver: string | null
  vehicle: string | null
  sender: string | null
  receiver: string | null
  status: string
  resultMessage: string | null
  resultType: string | null
  duration: number | null
  retryCount: number
  accountId: string | null
  accountUsername: string | null
  workerName: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
}

function getReportSummary(rows: AutomationRow[]) {
  const total = rows.length
  const successful = rows.filter(r => r.status === 'completed').length
  const failed = rows.filter(r => r.status === 'failed').length
  const pending = rows.filter(r => r.status === 'pending' || r.status === 'paused').length
  const totalRetries = rows.reduce((s, r) => s + r.retryCount, 0)
  const durations = rows.filter(r => r.duration != null).map(r => r.duration!)
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0
  return { total, successful, failed, pending, totalRetries, avgDuration }
}

function statusLabel(s: string) {
  const map: Record<string, string> = { completed: 'موفق', failed: 'ناموفق', pending: 'در انتظار', paused: 'متوقف', running: 'در حال اجرا' }
  return map[s] || s
}

function statusLabelEn(s: string) {
  const map: Record<string, string> = { completed: 'Completed', failed: 'Failed', pending: 'Pending', paused: 'Paused', running: 'Running' }
  return map[s] || s
}

function formatDuration(ms: number | null) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function parseQuery(request: NextRequest): ReportQuery {
  const { searchParams } = new URL(request.url)
  return {
    format: searchParams.get('format') || 'xlsx',
    dateFrom: searchParams.get('dateFrom'),
    dateTo: searchParams.get('dateTo'),
    status: searchParams.get('status') || 'all',
    plate: searchParams.get('plate') || '',
    driver: searchParams.get('driver') || '',
    account: searchParams.get('account') || '',
  }
}

async function fetchData(q: ReportQuery): Promise<AutomationRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (q.dateFrom || q.dateTo) {
    where.createdAt = {}
    if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom)
    if (q.dateTo) {
      const d = new Date(q.dateTo)
      d.setHours(23, 59, 59, 999)
      where.createdAt.lte = d
    }
  }

  if (q.status !== 'all') {
    where.status = q.status
  }

  if (q.plate) {
    where.plate = { contains: q.plate, mode: 'insensitive' }
  }

  if (q.driver) {
    where.driver = { contains: q.driver, mode: 'insensitive' }
  }

  if (q.account) {
    where.accountId = q.account
  }

  const results = await prisma.automationResult.findMany({
    where,
    include: {
      account: { select: { username: true } },
      worker: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  return results.map(r => ({
    id: r.id,
    plate: r.plate,
    driver: r.driver,
    vehicle: r.vehicle,
    sender: r.sender,
    receiver: r.receiver,
    status: r.status,
    resultMessage: r.resultMessage,
    resultType: r.resultType,
    duration: r.duration,
    retryCount: r.retryCount,
    accountId: r.accountId,
    accountUsername: r.account?.username ?? null,
    workerName: r.worker?.name ?? null,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    createdAt: r.createdAt,
  }))
}

function buildFilterDescription(q: ReportQuery): string {
  const parts: string[] = []
  if (q.dateFrom) parts.push(`از تاریخ: ${q.dateFrom}`)
  if (q.dateTo) parts.push(`تا تاریخ: ${q.dateTo}`)
  if (q.status !== 'all') parts.push(`وضعیت: ${statusLabel(q.status)}`)
  if (q.plate) parts.push(`پلاک: ${q.plate}`)
  if (q.driver) parts.push(`راننده: ${q.driver}`)
  if (q.account) parts.push(`حساب: ${q.account}`)
  return parts.length > 0 ? parts.join(' | ') : 'بدون فیلتر'
}

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(v => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }).join(',')
}

async function generateExcel(rows: AutomationRow[], q: ReportQuery, summary: ReturnType<typeof getReportSummary>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BarBarg Automation System'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('گزارش عملیات')

  sheet.mergeCells('A1:L1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'سیستم اتوماسیون باربگ'
  titleCell.font = { bold: true, size: 18, color: { argb: 'FF1E3A5F' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
  sheet.getRow(1).height = 40

  sheet.mergeCells('A2:L2')
  const subtitleCell = sheet.getCell('A2')
  subtitleCell.value = 'گزارش عملیات ثبت باربرگ'
  subtitleCell.font = { bold: true, size: 14, color: { argb: 'FF374151' } }
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 30

  const nowStr = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
  sheet.mergeCells('A3:L3')
  const dateCell = sheet.getCell('A3')
  dateCell.value = `تاریخ تولید: ${nowStr}`
  dateCell.font = { size: 11, color: { argb: 'FF6B7280' } }
  dateCell.alignment = { horizontal: 'center' }

  sheet.mergeCells('A4:L4')
  const filterCell = sheet.getCell('A4')
  filterCell.value = `فیلترها: ${buildFilterDescription(q)}`
  filterCell.font = { size: 10, color: { argb: 'FF9CA3AF' } }
  filterCell.alignment = { horizontal: 'center' }
  sheet.getRow(4).height = 22

  sheet.addRow([])

  const summaryRow = sheet.addRow([])
  const summaryLabels = ['کل عملیات', 'موفق', 'ناموفق', 'در انتظار', 'تعداد تلاش', 'مدت میانگین']
  const summaryValues = [summary.total, summary.successful, summary.failed, summary.pending, summary.totalRetries, formatDuration(summary.avgDuration)]
  const summaryColors = ['FF3B82F6', 'FF22C55E', 'FFEF4444', 'FFF59E0B', 'FF8B5CF6', 'FF6B7280']

  for (let i = 0; i < summaryLabels.length; i++) {
    const col = i * 2 + 1
    sheet.mergeCells(summaryRow.number, col, summaryRow.number, col + 1)
    const cell = sheet.getCell(summaryRow.number, col)
    cell.value = `${summaryLabels[i]}: ${summaryValues[i]}`
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: summaryColors[i] } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  sheet.getRow(summaryRow.number).height = 32

  sheet.addRow([])

  const columns = [
    { header: 'ردیف', key: 'rowNum', width: 8 },
    { header: 'پلاک', key: 'plate', width: 15 },
    { header: 'راننده', key: 'driver', width: 20 },
    { header: 'وسیله نقلیه', key: 'vehicle', width: 18 },
    { header: 'فرستنده', key: 'sender', width: 22 },
    { header: 'گیرنده', key: 'receiver', width: 22 },
    { header: 'وضعیت', key: 'status', width: 14 },
    { header: 'پیام نتیجه', key: 'resultMessage', width: 30 },
    { header: 'مدت (ms)', key: 'duration', width: 14 },
    { header: 'تعداد تلاش', key: 'retryCount', width: 12 },
    { header: 'حساب', key: 'accountUsername', width: 16 },
    { header: 'تاریخ ایجاد', key: 'createdAt', width: 20 },
  ]

  const headerRow = sheet.addRow(columns.map(c => c.header))
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 28
  headerRow.eachCell((cell: import('exceljs').Cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }
  })

  rows.forEach((row, idx) => {
    const r = sheet.addRow({
      rowNum: idx + 1,
      plate: row.plate || '-',
      driver: row.driver || '-',
      vehicle: row.vehicle || '-',
      sender: row.sender || '-',
      receiver: row.receiver || '-',
      status: statusLabel(row.status),
      resultMessage: row.resultMessage || '-',
      duration: row.duration ?? '-',
      retryCount: row.retryCount,
      accountUsername: row.accountUsername || '-',
      createdAt: row.createdAt.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
    })

    const isEven = idx % 2 === 0
    r.eachCell((cell: import('exceljs').Cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF9FAFB' : 'FFFFFFFF' } }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
      cell.alignment = { vertical: 'middle' }
    })

    const statusCell = r.getCell('status')
    if (row.status === 'completed') {
      statusCell.font = { bold: true, color: { argb: 'FF16A34A' } }
    } else if (row.status === 'failed') {
      statusCell.font = { bold: true, color: { argb: 'FFDC2626' } }
    } else if (row.status === 'paused') {
      statusCell.font = { bold: true, color: { argb: 'FFD97706' } }
    }

    if (typeof row.duration === 'number') {
      const durCell = r.getCell('duration')
      durCell.numFmt = '#,##0'
    }
  })

  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: columns.length },
  }

  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

  return workbook.xlsx.writeBuffer()
}

async function generatePdf(rows: AutomationRow[], q: ReportQuery, summary: ReturnType<typeof getReportSummary>): Promise<Buffer> {
  /* بارگذاری تنبل: فقط وقتی واقعا PDF می‌خواهیم.
     اگر بالای فایل ایمپورت شود، خروجی اکسل و CSV هم بی‌خود
     پکیج سنگین pdfkit را بار می‌کنند و اگر آن خطا بدهد، همه می‌شکنند. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('pdfkit')
  const PDFDocument = mod.default ?? mod

  return new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = new (PDFDocument as any)({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: {
        Title: 'گزارش عملیات ثبت باربرگ',
        Author: 'BarBarg Automation System',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1E3A5F')
      .text('BarBarg Automation System', { align: 'center' })
    doc.moveDown(0.3)

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#374151')
      .text('Operations Report - Barbarg Registration', { align: 'center' })
    doc.moveDown(0.5)

    doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
      .text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' })}`, { align: 'center' })
    doc.moveDown(0.2)

    const filterDesc = buildFilterDescription(q)
    doc.fontSize(8).fillColor('#9CA3AF')
      .text(`Filters: ${filterDesc}`, { align: 'center' })
    doc.moveDown(0.8)

    doc.rect(doc.x - 10, doc.y, 515, 60).fillAndStroke('#F0F4F8', '#D1D5DB')
    doc.fillColor('#1E3A5F')
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Summary', doc.x, doc.y + 8, { underline: true })
    doc.moveDown(0.3)

    const boxX = doc.x
    const boxY = doc.y + 2
    const statColors = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#6B7280']
    const statLabels = ['Total', 'Successful', 'Failed', 'Pending', 'Retries', 'Avg Duration']
    const statValues = [String(summary.total), String(summary.successful), String(summary.failed), String(summary.pending), String(summary.totalRetries), formatDuration(summary.avgDuration)]

    for (let i = 0; i < statLabels.length; i++) {
      const col = i % 3
      const rowIdx = Math.floor(i / 3)
      const x = boxX + col * 170
      const y = boxY + rowIdx * 22
      doc.fontSize(7).font('Helvetica').fillColor(statColors[i])
        .text(`${statLabels[i]}: ${statValues[i]}`, x, y)
    }

    doc.y = boxY + 65

    const tableHeaders = ['#', 'Plate', 'Driver', 'Status', 'Message', 'Duration', 'Retries', 'Account', 'Date']
    const colWidths = [25, 65, 80, 55, 120, 50, 40, 65, 90]
    const tableX = 45
    const tableWidth = colWidths.reduce((s, w) => s + w, 0)

    function drawTableHeader() {
      doc.save()
      let x = tableX
      doc.rect(tableX, doc.y, tableWidth, 20).fill('#1E40AF')
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
      for (let i = 0; i < tableHeaders.length; i++) {
        doc.text(tableHeaders[i], x + 3, doc.y + 5, { width: colWidths[i] - 6, align: 'center' })
        x += colWidths[i]
      }
      doc.y += 20
      doc.restore()
    }

    drawTableHeader()

    const maxRows = Math.min(rows.length, 200)

    for (let idx = 0; idx < maxRows; idx++) {
      if (doc.y > 750) {
        doc.addPage()
        doc.y = 50
        drawTableHeader()
      }

      const row = rows[idx]
      const rowHeight = 16
      const bgColor = idx % 2 === 0 ? '#F9FAFB' : '#FFFFFF'

      doc.save()
      doc.rect(tableX, doc.y, tableWidth, rowHeight).fill(bgColor)
      doc.restore()

      const rowY = doc.y + 2
      let x = tableX

      const cells = [
        String(idx + 1),
        row.plate || '-',
        (row.driver || '-').substring(0, 18),
        statusLabelEn(row.status),
        (row.resultMessage || '-').substring(0, 30),
        formatDuration(row.duration),
        String(row.retryCount),
        (row.accountUsername || '-').substring(0, 12),
        row.createdAt.toLocaleString('en-US', { timeZone: 'Asia/Tehran', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      ]

      doc.fontSize(6).font('Helvetica')

      for (let i = 0; i < cells.length; i++) {
        if (i === 3) {
          if (row.status === 'completed') doc.fillColor('#16A34A')
          else if (row.status === 'failed') doc.fillColor('#DC2626')
          else if (row.status === 'paused') doc.fillColor('#D97706')
          else doc.fillColor('#6B7280')
          doc.font('Helvetica-Bold')
        } else {
          doc.fillColor('#374151')
          doc.font('Helvetica')
        }
        doc.text(cells[i], x + 3, rowY, { width: colWidths[i] - 6, align: 'center', lineBreak: false })
        x += colWidths[i]
      }

      doc.y += rowHeight
    }

    const pageCount = doc.bufferedPageRange().count
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i)
      doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF')
        .text(
          `Page ${i + 1} of ${pageCount} | BarBarg Automation System`,
          40, 820,
          { align: 'center', width: 515 }
        )
    }

    doc.end()
  })
}

export async function GET(request: NextRequest) {
  try {
    const q = parseQuery(request)

    if (!['xlsx', 'pdf', 'csv'].includes(q.format)) {
      return Response.json({ error: 'فرمت نامعتبر' }, { status: 400 })
    }

    const rows = await fetchData(q)
    const summary = getReportSummary(rows)

    if (q.format === 'csv') {
      const headers = ['ردیف', 'پلاک', 'راننده', 'وسیله نقلیه', 'فرستنده', 'گیرنده', 'وضعیت', 'پیام نتیجه', 'نوع نتیجه', 'مدت (ms)', 'تعداد تلاش', 'حساب', 'زمان شروع', 'زمان پایان', 'تاریخ ایجاد']
      const csvRows = rows.map((r, idx) => toCsvRow([
        idx + 1,
        r.plate || '',
        r.driver || '',
        r.vehicle || '',
        r.sender || '',
        r.receiver || '',
        statusLabelEn(r.status),
        r.resultMessage || '',
        r.resultType || '',
        r.duration ?? '',
        r.retryCount,
        r.accountUsername || '',
        r.startedAt?.toISOString() || '',
        r.finishedAt?.toISOString() || '',
        r.createdAt.toISOString(),
      ]))
      const bom = '\uFEFF'
      const csv = [toCsvRow(headers), ...csvRows].join('\n')
      return new Response(bom + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="barbarg-report-${Date.now()}.csv"`,
        },
      })
    }

    if (q.format === 'xlsx') {
      const buffer = await generateExcel(rows, q, summary)
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="barbarg-report-${Date.now()}.xlsx"`,
        },
      })
    }

    if (q.format === 'pdf') {
      const buffer = await generatePdf(rows, q, summary)
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="barbarg-report-${Date.now()}.pdf"`,
        },
      })
    }

    return Response.json({ error: 'فرمت پشتیبانی نمی‌شود' }, { status: 400 })
  } catch (error) {
    console.error('Report export error:', error)

    /* پیام واقعی را برگردان — قبلا فقط «خطا در تولید گزارش»
       دیده می‌شد و علت فقط در کنسول سرور می‌ماند. */
    const raw = error instanceof Error ? error.message : String(error)

    let hint = raw
    if (/\.afm|ENOENT|no such file/i.test(raw)) {
      hint = 'فونت‌های pdfkit پیدا نشدند. ' +
             'serverExternalPackages در next.config.ts را چک کنید و ' +
             'سرور را ری‌استارت کنید.'
    } else if (/Cannot find module|MODULE_NOT_FOUND/i.test(raw)) {
      hint = 'پکیج لازم نصب نیست: npm install pdfkit exceljs'
    } else if (/prisma|database|connect/i.test(raw)) {
      hint = 'اتصال به دیتابیس برقرار نشد'
    }

    return Response.json(
      { error: `خطا در تولید گزارش: ${hint}`, detail: raw.slice(0, 300) },
      { status: 500 },
    )
  }
}
