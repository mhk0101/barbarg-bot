import { NextResponse } from 'next/server'
import { checkInternetOnline, networkCheckUrls } from '@/lib/network'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await checkInternetOnline(5000)
  return NextResponse.json({
    online: result.online,
    status: result.status ?? 0,
    target: result.target ?? networkCheckUrls()[0],
    targets: result.targets,
    latencyMs: result.latencyMs,
    error: result.error,
    checkedAt: new Date().toISOString(),
  })
}
