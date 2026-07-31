import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getAuditLogs } from '@/lib/auth/authService'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') || undefined
  const limit = parseInt(searchParams.get('limit') || '50')
  const logs = await getAuditLogs(userId, limit)
  return NextResponse.json({ data: logs })
}
