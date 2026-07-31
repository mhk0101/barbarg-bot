import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await prisma.registrationProfile.findUnique({
      where: { id },
      include: {
        barbargAccount: {
          select: { id: true, accountName: true, username: true },
        },
      },
    })
    return item
      ? NextResponse.json(item)
      : NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    const fields = [
      'name', 'senderType', 'senderFirstName', 'senderLastName', 'senderMobile',
      'senderPhone', 'senderNationalId', 'senderPostalCode',
      'receiverType', 'receiverFirstName', 'receiverLastName', 'receiverMobile',
      'receiverPhone', 'receiverNationalId', 'receiverPostalCode',
      'plateNumber', 'vehicleSerialNumber', 'vehicleMotorNumber',
      'vehicleInsurancePage', 'vehicleSparePlate', 'vehicleType',
      'cargoCapacity', 'passengerCapacity', 'loaderType',
      'thirdPartyInsurance', 'activityLicense',
      'driverName', 'driverNationalId', 'driverMobile',
      'driverLicense', 'driverCard', 'driverIdNumber', 'driverGender',
      'accountId', 'cargoName', 'cargoCategory', 'cargoPackaging',
      'cargoWeight', 'cargoQuantity', 'cargoValue',
      'originProvince', 'originCity', 'originAddress', 'originPostalCode',
      'destProvince', 'destCity', 'destAddress', 'destPostalCode',
      'advanceFare', 'fareType', 'freightCost', 'transportInsurance',
      'totalAmount', 'insuranceRate', 'insuranceAmount', 'paymentMethod',
      'captchaAnswer',
      'registrationsPerDay', 'intervalMinutes', 'maxRetries', 'retryIntervalSec',
      'priority', 'status', 'notes',
    ]

    for (const field of fields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] || null
      }
    }

    const item = await prisma.registrationProfile.update({
      where: { id },
      data: updateData,
      include: {
        barbargAccount: {
          select: { id: true, accountName: true, username: true },
        },
      },
    })
    return NextResponse.json(item)
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.registrationProfile.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 }
    )
  }
}
