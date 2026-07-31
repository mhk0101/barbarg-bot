import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')

export async function GET() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return NextResponse.json({ sessions: [] })
    const files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.json'))
    const sessions = files.map((f) => {
      const stat = fs.statSync(path.join(SESSION_DIR, f))
      return {
        accountId: f.replace('.json', ''),
        lastModified: stat.mtime.toISOString(),
        size: stat.size,
      }
    })
    return NextResponse.json({ sessions })
  } catch {
    return NextResponse.json({ sessions: [] })
  }
}
