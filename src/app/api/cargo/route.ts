import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const where: Record<string, unknown> = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search } }] } : {}
    const data = await prisma.cargo.findMany({ where, orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const item = await prisma.cargo.create({ data: body })
    return NextResponse.json(item, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
