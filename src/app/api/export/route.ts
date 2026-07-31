import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'

type ExportType = 'waybills' | 'accounts' | 'plates' | 'drivers' | 'reports' | 'errors'

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values.map(v => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }).join(',')
}

async function fetchExportData(type: ExportType) {
  switch (type) {
    case 'waybills': {
      const data = await prisma.waybill.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: {
          sender: { select: { name: true, nationalId: true, phone: true } },
          receiver: { select: { name: true, nationalId: true, phone: true } },
          driver: { select: { name: true, nationalId: true } },
          plate: { select: { plateNumber: true, province: true } },
          cargo: { select: { name: true } },
        },
      })
      return {
        columns: [
          { header: 'شماره باربرگ', key: 'waybillNumber', width: 18 },
          { header: 'وضعیت', key: 'status', width: 15 },
          { header: 'فرستنده', key: 'sender', width: 25 },
          { header: 'کد ملی فرستنده', key: 'senderNationalId', width: 18 },
          { header: 'تلفن فرستنده', key: 'senderPhone', width: 15 },
          { header: 'گیرنده', key: 'receiver', width: 25 },
          { header: 'کد ملی گیرنده', key: 'receiverNationalId', width: 18 },
          { header: 'راننده', key: 'driver', width: 20 },
          { header: 'پلاک', key: 'plate', width: 18 },
          { header: 'استان پلاک', key: 'plateProvince', width: 15 },
          { header: 'مبدأ', key: 'origin', width: 20 },
          { header: 'مقصد', key: 'dest', width: 20 },
          { header: 'کالا', key: 'cargo', width: 20 },
          { header: 'تاریخ ایجاد', key: 'createdAt', width: 22 },
        ],
        rows: data.map(w => ({
          waybillNumber: w.waybillNumber || '',
          status: w.status || '',
          sender: w.sender?.name || '',
          senderNationalId: w.sender?.nationalId || '',
          senderPhone: w.sender?.phone || '',
          receiver: w.receiver?.name || '',
          receiverNationalId: w.receiver?.nationalId || '',
          driver: w.driver?.name || '',
          plate: w.plate?.plateNumber || '',
          plateProvince: w.plate?.province || '',
          origin: `${w.originProvince || ''} ${w.originCity || ''}`.trim(),
          dest: `${w.destProvince || ''} ${w.destCity || ''}`.trim(),
          cargo: w.cargo?.name || '',
          createdAt: w.createdAt?.toISOString() || '',
        })),
      }
    }
    case 'accounts': {
      const data = await prisma.account.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        select: {
          username: true,
          nationalId: true,
          description: true,
          status: true,
          dailyLimit: true,
          dailyUsed: true,
          lastActivity: true,
          createdAt: true,
        },
      })
      return {
        columns: [
          { header: 'نام کاربری', key: 'username', width: 20 },
          { header: 'کد ملی', key: 'nationalId', width: 18 },
          { header: 'توضیحات', key: 'description', width: 25 },
          { header: 'وضعیت', key: 'status', width: 12 },
          { header: 'سقف روزانه', key: 'dailyLimit', width: 15 },
          { header: 'انجام شده', key: 'dailyUsed', width: 15 },
          { header: 'آخرین فعالیت', key: 'lastActivity', width: 22 },
          { header: 'تاریخ ایجاد', key: 'createdAt', width: 22 },
        ],
        rows: data.map(a => ({
          username: a.username,
          nationalId: a.nationalId,
          description: a.description || '',
          status: a.status,
          dailyLimit: a.dailyLimit,
          dailyUsed: a.dailyUsed,
          lastActivity: a.lastActivity?.toISOString() || '',
          createdAt: a.createdAt?.toISOString() || '',
        })),
      }
    }
    case 'plates': {
      const data = await prisma.licensePlate.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: { account: { select: { username: true } } },
      })
      return {
        columns: [
          { header: 'شماره پلاک', key: 'plateNumber', width: 20 },
          { header: 'استان', key: 'province', width: 15 },
          { header: 'حساب', key: 'account', width: 20 },
          { header: 'وضعیت', key: 'status', width: 12 },
          { header: 'هدف روزانه', key: 'dailyTarget', width: 15 },
          { header: 'انجام شده', key: 'dailyCount', width: 15 },
          { header: 'فعال', key: 'enabled', width: 10 },
          { header: 'تاریخ ایجاد', key: 'createdAt', width: 22 },
        ],
        rows: data.map(p => ({
          plateNumber: p.plateNumber,
          province: p.province,
          account: p.account?.username || '',
          status: p.status,
          dailyTarget: p.dailyTarget,
          dailyCount: p.dailyCount,
          enabled: p.enabled ? 'بله' : 'خیر',
          createdAt: p.createdAt?.toISOString() || '',
        })),
      }
    }
    case 'drivers': {
      const data = await prisma.driver.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
      })
      return {
        columns: [
          { header: 'نام', key: 'name', width: 25 },
          { header: 'کد ملی', key: 'nationalId', width: 18 },
          { header: 'تلفن', key: 'phone', width: 15 },
          { header: 'گواهینامه', key: 'license', width: 20 },
          { header: 'کارت', key: 'driverCard', width: 18 },
          { header: 'وضعیت', key: 'status', width: 12 },
          { header: 'هدف روزانه', key: 'dailyTarget', width: 15 },
          { header: 'فعال', key: 'enabled', width: 10 },
          { header: 'تاریخ ایجاد', key: 'createdAt', width: 22 },
        ],
        rows: data.map(d => ({
          name: d.name,
          nationalId: d.nationalId,
          phone: d.phone,
          license: d.license,
          driverCard: d.driverCard || '',
          status: d.status,
          dailyTarget: d.dailyTarget,
          enabled: d.enabled ? 'بله' : 'خیر',
          createdAt: d.createdAt?.toISOString() || '',
        })),
      }
    }
    case 'reports': {
      const now = new Date()
      const dailyMap: Record<string, { success: number; failed: number }> = {}
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        dailyMap[key] = { success: 0, failed: 0 }
      }
      const recentJobs = await prisma.job.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        select: { createdAt: true, status: true },
      })
      recentJobs.forEach(j => {
        const key = j.createdAt.toISOString().slice(0, 10)
        if (key in dailyMap) {
          if (j.status === 'completed') dailyMap[key].success++
          else if (j.status === 'failed') dailyMap[key].failed++
        }
      })
      return {
        columns: [
          { header: 'تاریخ', key: 'date', width: 15 },
          { header: 'موفق', key: 'success', width: 12 },
          { header: 'ناموفق', key: 'failed', width: 12 },
        ],
        rows: Object.entries(dailyMap).map(([date, counts]) => ({
          date,
          success: counts.success,
          failed: counts.failed,
        })),
      }
    }
    case 'errors': {
      const data = await prisma.errorLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: {
          job: {
            select: {
              waybill: {
                select: {
                  waybillNumber: true,
                  plate: { select: { plateNumber: true } },
                  driver: { select: { name: true } },
                },
              },
            },
          },
          account: { select: { username: true } },
        },
      })
      return {
        columns: [
          { header: 'کد خطا', key: 'errorCode', width: 18 },
          { header: 'عنوان', key: 'errorTitle', width: 25 },
          { header: 'توضیحات', key: 'errorDescription', width: 35 },
          { header: 'راه‌حل پیشنهادی', key: 'suggestedSolution', width: 25 },
          { header: 'پلاک', key: 'plate', width: 18 },
          { header: 'راننده', key: 'driver', width: 20 },
          { header: 'حساب', key: 'account', width: 18 },
          { header: 'شماره باربرگ', key: 'waybillNumber', width: 18 },
          { header: 'وضعیت تلاش', key: 'retryStatus', width: 15 },
          { header: 'تعداد تلاش', key: 'retryCount', width: 12 },
          { header: 'تاریخ', key: 'createdAt', width: 22 },
        ],
        rows: data.map(e => ({
          errorCode: e.errorCode,
          errorTitle: e.errorTitle,
          errorDescription: e.errorDescription,
          suggestedSolution: e.suggestedSolution || '',
          plate: e.job?.waybill?.plate?.plateNumber || '',
          driver: e.job?.waybill?.driver?.name || '',
          account: e.account?.username || '',
          waybillNumber: e.job?.waybill?.waybillNumber || '',
          retryStatus: e.retryStatus,
          retryCount: e.retryCount,
          createdAt: e.createdAt?.toISOString() || '',
        })),
      }
    }
    default:
      return { columns: [], rows: [] }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = (searchParams.get('type') || 'waybills') as ExportType
    const format = searchParams.get('format') || 'xlsx'

    if (!['waybills', 'accounts', 'plates', 'drivers', 'reports', 'errors'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const { columns, rows } = await fetchExportData(type)

    if (format === 'csv') {
      const header = toCsvRow(columns.map(c => c.header))
      const csvRows = rows.map(row => toCsvRow(columns.map(c => String((row as Record<string, unknown>)[c.key] ?? ''))))
      const csv = [header, ...csvRows].join('\n')
      const bom = '\uFEFF'
      return new NextResponse(bom + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${type}-export.csv"`,
        },
      })
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'BarBarg Bot'
    workbook.created = new Date()

    const sheetNameMap: Record<ExportType, string> = {
      waybills: 'باربرگ‌ها',
      accounts: 'حساب‌ها',
      plates: 'پلاک‌ها',
      drivers: 'رانندگان',
      reports: 'گزارش',
      errors: 'خطاها',
    }
    const sheet = workbook.addWorksheet(sheetNameMap[type])

    sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }))

    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).alignment = { horizontal: 'center' }

    rows.forEach(row => {
      sheet.addRow(row)
    })

    const buffer = await workbook.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${type}-export.xlsx"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'خطا در تولید خروجی' }, { status: 500 })
  }
}
