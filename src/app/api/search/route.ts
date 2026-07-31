import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!q.trim()) {
      return NextResponse.json({
        profiles: [], accounts: [], plates: [], drivers: [],
        vehicles: [], senders: [], receivers: [], cargo: [],
        companies: [], jobs: [], automationResults: [],
      })
    }

    const search = q.trim()

    const [
      profiles, accounts, plates, drivers, vehicles,
      senders, receivers, cargo, companies, jobs, automationResults,
    ] = await Promise.all([
      prisma.registrationProfile.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { plateNumber: { contains: search, mode: 'insensitive' } },
            { driverName: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, plateNumber: true, driverName: true, status: true },
      }),

      prisma.barBargAccount.findMany({
        where: {
          OR: [
            { accountName: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, accountName: true, username: true, status: true },
      }),

      prisma.licensePlate.findMany({
        where: {
          OR: [
            { plateNumber: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, plateNumber: true, province: true, status: true },
      }),

      prisma.driver.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { nationalId: { contains: search } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, nationalId: true, phone: true, status: true },
      }),

      prisma.vehicle.findMany({
        where: {
          OR: [
            { vehicleType: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, vehicleType: true, status: true },
      }),

      prisma.sender.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { nationalId: { contains: search } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, nationalId: true, phone: true },
      }),

      prisma.receiver.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { nationalId: { contains: search } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, nationalId: true, phone: true },
      }),

      prisma.cargo.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, code: true, type: true },
      }),

      prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, nationalId: true, phone: true },
      }),

      prisma.job.findMany({
        where: {
          OR: [
            { status: { contains: search, mode: 'insensitive' } },
            { type: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, status: true, createdAt: true },
      }),

      prisma.automationResult.findMany({
        where: {
          OR: [
            { plate: { contains: search, mode: 'insensitive' } },
            { driver: { contains: search, mode: 'insensitive' } },
            { resultMessage: { contains: search, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, plate: true, driver: true, status: true, resultMessage: true },
      }),
    ])

    return NextResponse.json({
      profiles, accounts, plates, drivers, vehicles,
      senders, receivers, cargo, companies, jobs, automationResults,
    })
  } catch {
    return NextResponse.json({
      profiles: [], accounts: [], plates: [], drivers: [],
      vehicles: [], senders: [], receivers: [], cargo: [],
      companies: [], jobs: [], automationResults: [],
    })
  }
}
