import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface PlateRow {
  plateNumber: string
  driver: string | null
  nationalId: string | null
  account: string | null
  totalRegistrations: number
  successfulRegistrations: number
  failedRegistrations: number
  successRate: number
  failureRate: number
  lastExecution: Date | null
  lastSuccessfulExecution: Date | null
  lastFailedExecution: Date | null
  averageDuration: number
  retryCount: number
}

interface MessageRow {
  plate: string
  message: string | null
  status: string
  date: Date
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const driver = searchParams.get('driver')
    const account = searchParams.get('account')
    const status = searchParams.get('status')

    const whereConditions: string[] = ['ar.plate IS NOT NULL']
    const queryValues: unknown[] = []
    let paramIndex = 1

    if (dateFrom) {
      whereConditions.push(`ar."createdAt" >= $${paramIndex++}`)
      queryValues.push(new Date(dateFrom))
    }
    if (dateTo) {
      whereConditions.push(`ar."createdAt" <= $${paramIndex++}`)
      queryValues.push(new Date(dateTo))
    }
    if (driver) {
      whereConditions.push(`rp."driverName" ILIKE $${paramIndex++}`)
      queryValues.push(`%${driver}%`)
    }
    if (account) {
      whereConditions.push(`bba."accountName" ILIKE $${paramIndex++}`)
      queryValues.push(`%${account}%`)
    }
    if (status) {
      whereConditions.push(`ar.status = $${paramIndex++}`)
      queryValues.push(status)
    }

    const whereClause = whereConditions.join(' AND ')

    const plates = await prisma.$queryRawUnsafe<PlateRow[]>(
      `SELECT 
        ar.plate as "plateNumber",
        MAX(rp."driverName") as "driver",
        MAX(rp."driverNationalId") as "nationalId",
        MAX(bba."accountName") as "account",
        COUNT(ar.id)::int as "totalRegistrations",
        COUNT(ar.id) FILTER (WHERE ar.status = 'completed')::int as "successfulRegistrations",
        COUNT(ar.id) FILTER (WHERE ar.status = 'failed')::int as "failedRegistrations",
        CASE 
          WHEN COUNT(ar.id) > 0 
          THEN ROUND(100.0 * COUNT(ar.id) FILTER (WHERE ar.status = 'completed') / COUNT(ar.id), 1)
          ELSE 0 
        END as "successRate",
        CASE 
          WHEN COUNT(ar.id) > 0 
          THEN ROUND(100.0 * COUNT(ar.id) FILTER (WHERE ar.status = 'failed') / COUNT(ar.id), 1)
          ELSE 0 
        END as "failureRate",
        MAX(ar."createdAt") as "lastExecution",
        MAX(CASE WHEN ar.status = 'completed' THEN ar."createdAt" END) as "lastSuccessfulExecution",
        MAX(CASE WHEN ar.status = 'failed' THEN ar."createdAt" END) as "lastFailedExecution",
        COALESCE(ROUND(AVG(ar.duration)::numeric, 0), 0)::int as "averageDuration",
        COALESCE(SUM(ar."retryCount"), 0)::int as "retryCount"
      FROM "AutomationResult" ar
      LEFT JOIN "RegistrationProfile" rp ON rp."plateNumber" = ar.plate
      LEFT JOIN "BarBargAccount" bba ON bba.id = rp."accountId"
      WHERE ${whereClause}
      GROUP BY ar.plate
      ORDER BY MAX(ar."createdAt") DESC`,
      ...queryValues
    )

    const recentMessages = await prisma.$queryRawUnsafe<MessageRow[]>(
      `WITH ranked AS (
        SELECT 
          ar.plate,
          ar."resultMessage" as message,
          ar.status,
          ar."createdAt" as date,
          ROW_NUMBER() OVER (PARTITION BY ar.plate ORDER BY ar."createdAt" DESC) as rn
        FROM "AutomationResult" ar
        WHERE ar.plate IS NOT NULL AND ar."resultMessage" IS NOT NULL
      )
      SELECT plate, message, status, date
      FROM ranked
      WHERE rn <= 3`
    )

    const messagesByPlate: Record<string, Array<{ message: string; status: string; date: string }>> = {}
    for (const msg of recentMessages) {
      if (!messagesByPlate[msg.plate]) messagesByPlate[msg.plate] = []
      messagesByPlate[msg.plate].push({
        message: msg.message || '',
        status: msg.status,
        date: msg.date.toISOString(),
      })
    }

    const totalPlates = plates.length
    const totalRegistrations = plates.reduce((sum, p) => sum + Number(p.totalRegistrations), 0)
    const totalSuccessful = plates.reduce((sum, p) => sum + Number(p.successfulRegistrations), 0)
    const overallSuccessRate = totalRegistrations > 0
      ? Math.round((totalSuccessful / totalRegistrations) * 1000) / 10
      : 0

    const formattedPlates = plates.map((p) => ({
      plateNumber: p.plateNumber,
      driver: p.driver,
      nationalId: p.nationalId,
      account: p.account,
      totalRegistrations: Number(p.totalRegistrations),
      successfulRegistrations: Number(p.successfulRegistrations),
      failedRegistrations: Number(p.failedRegistrations),
      successRate: Number(p.successRate),
      failureRate: Number(p.failureRate),
      lastExecution: p.lastExecution ? new Date(p.lastExecution).toISOString() : null,
      lastSuccessfulExecution: p.lastSuccessfulExecution ? new Date(p.lastSuccessfulExecution).toISOString() : null,
      lastFailedExecution: p.lastFailedExecution ? new Date(p.lastFailedExecution).toISOString() : null,
      averageDuration: Number(p.averageDuration),
      retryCount: Number(p.retryCount),
      recentMessages: messagesByPlate[p.plateNumber] || [],
    }))

    return NextResponse.json({
      plates: formattedPlates,
      summary: { totalPlates, totalRegistrations, overallSuccessRate },
    })
  } catch {
    return NextResponse.json({
      plates: [],
      summary: { totalPlates: 0, totalRegistrations: 0, overallSuccessRate: 0 },
    })
  }
}
