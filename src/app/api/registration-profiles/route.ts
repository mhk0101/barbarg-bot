import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, 'view_waybill')
  if (!guard.ok) return guard.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || 'all'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { driverName: { contains: search, mode: 'insensitive' } },
        { senderFirstName: { contains: search, mode: 'insensitive' } },
        { receiverFirstName: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (status && status !== 'all') where.status = status

    const [data, total] = await Promise.all([
      prisma.registrationProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          barbargAccount: {
            select: { id: true, accountName: true, username: true },
          },
        },
      }),
      prisma.registrationProfile.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch {
    return NextResponse.json(
      { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }
    )
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, 'create_waybill')
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const required = [
      'name', 'plateNumber', 'driverName', 'driverNationalId',
      'senderFirstName', 'senderLastName', 'senderMobile', 'senderNationalId',
      'receiverFirstName', 'receiverLastName', 'receiverMobile', 'receiverNationalId',
      'cargoName', 'originProvince', 'originCity', 'destProvince', 'destCity',
    ]
    const missing = required.filter((f) => !body[f])
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'فیلدهای الزامی را پر کنید' },
        { status: 400 }
      )
    }

    const profile = await prisma.registrationProfile.create({
      data: {
        name: body.name,
        senderType: body.senderType || null,
        senderFirstName: body.senderFirstName,
        senderLastName: body.senderLastName,
        senderMobile: body.senderMobile,
        senderPhone: body.senderPhone || null,
        senderNationalId: body.senderNationalId,
        senderPostalCode: body.senderPostalCode || null,
        receiverType: body.receiverType || null,
        receiverFirstName: body.receiverFirstName,
        receiverLastName: body.receiverLastName,
        receiverMobile: body.receiverMobile,
        receiverPhone: body.receiverPhone || null,
        receiverNationalId: body.receiverNationalId,
        receiverPostalCode: body.receiverPostalCode || null,
        plateNumber: body.plateNumber,
        vehicleSerialNumber: body.vehicleSerialNumber || null,
        vehicleMotorNumber: body.vehicleMotorNumber || null,
        vehicleInsurancePage: body.vehicleInsurancePage || null,
        vehicleSparePlate: body.vehicleSparePlate || null,
        vehicleType: body.vehicleType || null,
        cargoCapacity: body.cargoCapacity || null,
        passengerCapacity: body.passengerCapacity || null,
        loaderType: body.loaderType || null,
        thirdPartyInsurance: body.thirdPartyInsurance || null,
        activityLicense: body.activityLicense || null,
        driverName: body.driverName,
        driverNationalId: body.driverNationalId,
        driverMobile: body.driverMobile || null,
        driverLicense: body.driverLicense || null,
        driverCard: body.driverCard || null,
        driverIdNumber: body.driverIdNumber || null,
        driverGender: body.driverGender || null,
        accountId: body.accountId || null,
        cargoName: body.cargoName,
        cargoCategory: body.cargoCategory || null,
        cargoPackaging: body.cargoPackaging || null,
        cargoWeight: body.cargoWeight || null,
        cargoQuantity: body.cargoQuantity || null,
        cargoValue: body.cargoValue || null,
        originProvince: body.originProvince,
        originCity: body.originCity,
        originAddress: body.originAddress || null,
        originPostalCode: body.originPostalCode || null,
        destProvince: body.destProvince,
        destCity: body.destCity,
        destAddress: body.destAddress || null,
        destPostalCode: body.destPostalCode || null,
        advanceFare: body.advanceFare || null,
        fareType: body.fareType || null,
        freightCost: body.freightCost || null,
        transportInsurance: body.transportInsurance || null,
        totalAmount: body.totalAmount || null,
        insuranceRate: body.insuranceRate || null,
        insuranceAmount: body.insuranceAmount || null,
        paymentMethod: body.paymentMethod || null,
        captchaAnswer: body.captchaAnswer || null,
        // ?? فقط null/undefined را می‌گیرد؛ اگر رشته‌ی خالی یا NaN بیاید
        // Prisma خطا می‌دهد، پس عدد را صریح می‌سازیم
        registrationsPerDay: Number(body.registrationsPerDay) || 10,
        intervalMinutes: Number(body.intervalMinutes) || 60,
        maxRetries: Number(body.maxRetries) || 3,
        retryIntervalSec: Number(body.retryIntervalSec) || 30,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        notes: body.notes || null,
        status: 'active',
      },
    })
    return NextResponse.json(profile, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}
