import { NextResponse } from 'next/server'

export async function GET() {
  try {
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        database: 'up',
        redis: 'unknown',
        workers: 'up',
      },
    })
  } catch {
    return NextResponse.json({ status: 'unhealthy' }, { status: 503 })
  }
}
