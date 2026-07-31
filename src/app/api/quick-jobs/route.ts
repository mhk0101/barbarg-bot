import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const data = await prisma.quickRegistrationJob.findMany({ orderBy: { createdAt: 'desc' }, include: { template: true } })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const job = await prisma.quickRegistrationJob.create({ data: { templateId: body.templateId, plateNumber: body.plateNumber, targetCount: body.targetCount, status: 'pending' } })
    return NextResponse.json(job, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const job = await prisma.quickRegistrationJob.update({ where: { id: body.id }, data: { completedCount: body.completedCount, status: body.status, startedAt: body.startedAt, completedAt: body.completedAt } })
    return NextResponse.json(job)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
