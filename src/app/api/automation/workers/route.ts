import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const workers = await prisma.workerStatus.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json({ workers })
  } catch {
    return NextResponse.json({ workers: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (body.action === 'update' && body.workerId) {
      const worker = await prisma.workerStatus.update({
        where: { id: body.workerId },
        data: { status: body.status, lastHeartbeat: new Date(), ...(body.tasksCompleted !== undefined ? { tasksCompleted: body.tasksCompleted } : {}), ...(body.tasksFailed !== undefined ? { tasksFailed: body.tasksFailed } : {}) },
      })
      return NextResponse.json(worker)
    }
    if (body.name) {
      const worker = await prisma.workerStatus.create({ data: { name: body.name, status: body.status || 'idle' } })
      return NextResponse.json(worker, { status: 201 })
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
