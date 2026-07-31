import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ plateNumber: string }> }
) {
  try {
    const { plateNumber: rawPlateNumber } = await params
    const plateNumber = decodeURIComponent(rawPlateNumber)

    const [plateInfo, stats, daily, hourly, trend, messages, recentExecutions] = await Promise.all([
      prisma.$queryRaw`
        SELECT 
          rp."plateNumber" as "plateNumber",
          rp."driverName" as "driver",
          rp."driverNationalId" as "nationalId",
          bba."accountName" as "account",
          rp.status
        FROM "RegistrationProfile" rp
        LEFT JOIN "BarBargAccount" bba ON bba.id = rp."accountId"
        WHERE rp."plateNumber" = ${plateNumber}
        LIMIT 1
      `,
      prisma.$queryRaw`
        SELECT 
          COUNT(ar.id)::int as "total",
          COUNT(ar.id) FILTER (WHERE ar.status = 'completed')::int as "successful",
          COUNT(ar.id) FILTER (WHERE ar.status = 'failed')::int as "failed",
          CASE 
            WHEN COUNT(ar.id) > 0 
            THEN ROUND(100.0 * COUNT(ar.id) FILTER (WHERE ar.status = 'completed') / COUNT(ar.id), 1)
            ELSE 0 
          END as "successRate",
          COALESCE(ROUND(AVG(ar.duration)::numeric, 0), 0)::int as "averageDuration",
          COALESCE(SUM(ar."retryCount"), 0)::int as "retryCount"
        FROM "AutomationResult" ar
        WHERE ar.plate = ${plateNumber}
      `,
      prisma.$queryRaw`
        SELECT 
          TO_CHAR(ar."createdAt", 'YYYY-MM-DD') as "date",
          COUNT(ar.id)::int as "total",
          COUNT(ar.id) FILTER (WHERE ar.status = 'completed')::int as "successful",
          COUNT(ar.id) FILTER (WHERE ar.status = 'failed')::int as "failed"
        FROM "AutomationResult" ar
        WHERE ar.plate = ${plateNumber}
          AND ar."createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(ar."createdAt", 'YYYY-MM-DD')
        ORDER BY "date"
      `,
      prisma.$queryRaw`
        SELECT 
          EXTRACT(HOUR FROM ar."createdAt")::int as "hour",
          COUNT(ar.id)::int as "total",
          COUNT(ar.id) FILTER (WHERE ar.status = 'completed')::int as "successful",
          COUNT(ar.id) FILTER (WHERE ar.status = 'failed')::int as "failed"
        FROM "AutomationResult" ar
        WHERE ar.plate = ${plateNumber}
        GROUP BY EXTRACT(HOUR FROM ar."createdAt")
        ORDER BY "hour"
      `,
      prisma.$queryRaw`
        SELECT 
          TO_CHAR(ar."createdAt", 'YYYY-MM-DD') as "date",
          COUNT(ar.id)::int as "total",
          COUNT(ar.id) FILTER (WHERE ar.status = 'completed')::int as "successful",
          COUNT(ar.id) FILTER (WHERE ar.status = 'failed')::int as "failed"
        FROM "AutomationResult" ar
        WHERE ar.plate = ${plateNumber}
          AND ar."createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(ar."createdAt", 'YYYY-MM-DD')
        ORDER BY "date"
      `,
      prisma.$queryRaw`
        SELECT 
          ar."resultMessage" as "message",
          COUNT(ar.id)::int as "count",
          MAX(ar."createdAt") as "lastSeen",
          CASE 
            WHEN COUNT(ar.id) FILTER (WHERE ar.status = 'completed') > COUNT(ar.id) FILTER (WHERE ar.status = 'failed')
            THEN 'completed'
            ELSE 'failed'
          END as "status"
        FROM "AutomationResult" ar
        WHERE ar.plate = ${plateNumber} AND ar."resultMessage" IS NOT NULL
        GROUP BY ar."resultMessage"
        ORDER BY "count" DESC
      `,
      prisma.$queryRaw`
        SELECT 
          ar.id,
          ar.status,
          ar."resultMessage" as "message",
          ar.duration,
          ar."createdAt" as "date",
          ws.name as "worker",
          bba."accountName" as "account"
        FROM "AutomationResult" ar
        LEFT JOIN "WorkerStatus" ws ON ws.id = ar."workerId"
        LEFT JOIN "RegistrationProfile" rp ON rp."plateNumber" = ar.plate
        LEFT JOIN "BarBargAccount" bba ON bba.id = rp."accountId"
        WHERE ar.plate = ${plateNumber}
        ORDER BY ar."createdAt" DESC
        LIMIT 20
      `,
    ]) as [
      Array<{ plateNumber: string; driver: string | null; nationalId: string | null; account: string | null; status: string | null }>,
      Array<{ total: number; successful: number; failed: number; successRate: number; averageDuration: number; retryCount: number }>,
      Array<{ date: string; total: number; successful: number; failed: number }>,
      Array<{ hour: number; total: number; successful: number; failed: number }>,
      Array<{ date: string; total: number; successful: number; failed: number }>,
      Array<{ message: string; count: number; lastSeen: Date; status: string }>,
      Array<{ id: string; status: string; message: string | null; duration: number | null; date: Date; worker: string | null; account: string | null }>,
    ]

    return NextResponse.json({
      plate: plateInfo[0] || { plateNumber, driver: null, nationalId: null, account: null, status: null },
      stats: stats[0] || { total: 0, successful: 0, failed: 0, successRate: 0, averageDuration: 0, retryCount: 0 },
      daily,
      hourly,
      trend,
      messages: messages.map(m => ({
        message: m.message,
        count: m.count,
        lastSeen: new Date(m.lastSeen).toISOString(),
        status: m.status,
      })),
      recentExecutions: recentExecutions.map(e => ({
        id: e.id,
        status: e.status,
        message: e.message,
        duration: e.duration,
        date: new Date(e.date).toISOString(),
        worker: e.worker,
        account: e.account,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'خطا در دریافت اطلاعات' }, { status: 500 })
  }
}
