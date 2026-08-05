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

    // فیلدهای متنی که می‌توانند null باشند
    const textFields = [
      'senderType', 'senderPhone', 'senderPostalCode',
      'receiverType', 'receiverPhone', 'receiverPostalCode',
      'vehicleSerialNumber', 'vehicleMotorNumber',
      'vehicleInsurancePage', 'vehicleSparePlate', 'vehicleType',
      'cargoCapacity', 'passengerCapacity', 'loaderType',
      'thirdPartyInsurance', 'activityLicense',
      'driverMobile', 'driverLicense', 'driverCard', 'driverIdNumber', 'driverGender',
      'cargoCategory', 'cargoPackaging', 'cargoWeight', 'cargoQuantity', 'cargoValue',
      'originAddress', 'originPostalCode', 'destAddress', 'destPostalCode',
      'advanceFare', 'fareType', 'freightCost', 'transportInsurance',
      'totalAmount', 'insuranceRate', 'insuranceAmount', 'paymentMethod',
      'captchaAnswer', 'notes',
    ]

    // فیلدهای متنی اجباری (در اسکیما nullable نیستند)
    const requiredText = [
      'name', 'senderFirstName', 'senderLastName', 'senderMobile', 'senderNationalId',
      'receiverFirstName', 'receiverLastName', 'receiverMobile', 'receiverNationalId',
      'plateNumber', 'driverName', 'driverNationalId', 'cargoName',
      'originProvince', 'originCity', 'destProvince', 'destCity', 'status',
    ]

    // فیلدهای عددی (نباید null شوند)
    const numberFields: Array<[string, number]> = [
      ['registrationsPerDay', 10], ['intervalMinutes', 60],
      ['maxRetries', 3], ['retryIntervalSec', 30], ['priority', 0],
    ]

    for (const field of textFields) {
      if (body[field] !== undefined) {
        const v = body[field]
        updateData[field] = v === '' || v === null ? null : v
      }
    }

    for (const field of requiredText) {
      if (body[field] !== undefined && String(body[field] ?? '').trim() !== '') {
        updateData[field] = body[field]
      }
    }

    for (const [field, fallback] of numberFields) {
      if (body[field] !== undefined) {
        const n = Number(body[field])
        updateData[field] = Number.isFinite(n) ? n : fallback
      }
    }

    // accountId یک کلید خارجی است؛ Prisma فقط از طریق رابطه می‌پذیرد
    if (body.accountId !== undefined) {
      updateData.barbargAccount = body.accountId
        ? { connect: { id: body.accountId } }
        : { disconnect: true }
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
