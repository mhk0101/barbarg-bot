import { NextRequest, NextResponse } from 'next/server'

const logs: Array<{ id: string; action: string; resource: string; details: Record<string, unknown>; timestamp: string }> = []

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  return NextResponse.json({ data: logs.slice(0, limit) })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entry = { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...body, timestamp: new Date().toISOString() }
    logs.unshift(entry)
    if (logs.length > 1000) logs.length = 1000
    return NextResponse.json(entry, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
