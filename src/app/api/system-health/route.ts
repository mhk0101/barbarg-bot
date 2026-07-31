import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import { browserManager } from '@/automation/browser/BrowserManager'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const SESSION_DIR = path.join(process.cwd(), 'automation-data', 'sessions')
const AUTOMATION_DIR = path.join(process.cwd(), 'automation-data')

interface HealthCheck {
  status: 'ok' | 'error' | 'degraded'
  message?: string
  lastCheck: string
  [key: string]: unknown
}

async function checkPostgres(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', message: 'متصل', lastCheck }
  } catch (e) {
    return { status: 'error', message: `قطع: ${(e as Error).message}`, lastCheck }
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    const redis = getRedis()
    const result = await redis.ping()
    return { status: result === 'PONG' ? 'ok' : 'error', message: result === 'PONG' ? 'متصل' : 'پاسخ نامعتبر', lastCheck }
  } catch (e) {
    return { status: 'error', message: `قطع: ${(e as Error).message}`, lastCheck }
  }
}

async function checkBullMQ(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    const pending = await prisma.job.count({ where: { status: 'pending' } })
    const active = await prisma.job.count({ where: { status: 'processing' } })
    const failed = await prisma.job.count({ where: { status: 'failed' } })
    return {
      status: 'ok',
      message: `${pending} در انتظار، ${active} فعال، ${failed} ناموفق`,
      lastCheck,
      pending,
      active,
      failed,
    }
  } catch (e) {
    return { status: 'error', message: `خطا: ${(e as Error).message}`, lastCheck }
  }
}

async function checkWorker(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    const worker = await prisma.workerStatus.findFirst({
      orderBy: { lastHeartbeat: 'desc' },
    })
    if (!worker) return { status: 'degraded', message: 'ورکری یافت نشد', lastCheck }
    const heartbeatAge = worker.lastHeartbeat
      ? Date.now() - new Date(worker.lastHeartbeat).getTime()
      : Infinity
    const isAlive = heartbeatAge < 60_000
    return {
      status: isAlive ? 'ok' : 'degraded',
      message: worker.name,
      lastCheck,
      workerName: worker.name,
      statusLabel: worker.status,
      lastHeartbeat: worker.lastHeartbeat?.toISOString() ?? null,
      heartbeatAge,
      tasksCompleted: worker.tasksCompleted,
      tasksFailed: worker.tasksFailed,
    }
  } catch (e) {
    return { status: 'error', message: `خطا: ${(e as Error).message}`, lastCheck }
  }
}

async function checkPlaywright(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    const connected = browserManager.isConnected()
    return {
      status: connected ? 'ok' : 'error',
      message: connected ? 'متصل' : 'قطع',
      lastCheck,
    }
  } catch (e) {
    return { status: 'error', message: `خطا: ${(e as Error).message}`, lastCheck }
  }
}

async function checkBrowserSessions(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      return { status: 'ok', message: '۰ جلسه', lastCheck, count: 0 }
    }
    const files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.json'))
    return { status: 'ok', message: `${files.length} جلسه`, lastCheck, count: files.length }
  } catch (e) {
    return { status: 'error', message: `خطا: ${(e as Error).message}`, lastCheck }
  }
}

async function checkWebsite(): Promise<HealthCheck> {
  const lastCheck = new Date().toISOString()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch('https://barname.utcms.ir', {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    return {
      status: res.ok ? 'ok' : 'degraded',
      message: `HTTP ${res.status}`,
      lastCheck,
      statusCode: res.status,
    }
  } catch (e) {
    return { status: 'error', message: `غیرقابل دسترس: ${(e as Error).message}`, lastCheck }
  }
}

function checkStorage(): HealthCheck {
  const lastCheck = new Date().toISOString()
  try {
    if (!fs.existsSync(AUTOMATION_DIR)) {
      return { status: 'ok', message: 'پوشه وجود ندارد', lastCheck, bytes: 0 }
    }
    let totalSize = 0
    function calcSize(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) calcSize(fullPath)
        else totalSize += fs.statSync(fullPath).size
      }
    }
    calcSize(AUTOMATION_DIR)
    const mb = (totalSize / (1024 * 1024)).toFixed(2)
    return { status: 'ok', message: `${mb} MB`, lastCheck, bytes: totalSize }
  } catch (e) {
    return { status: 'error', message: `خطا: ${(e as Error).message}`, lastCheck }
  }
}

function checkMemory(): HealthCheck {
  const lastCheck = new Date().toISOString()
  const mem = process.memoryUsage()
  const usedMB = (mem.heapUsed / (1024 * 1024)).toFixed(1)
  const totalMB = (mem.heapTotal / (1024 * 1024)).toFixed(1)
  return {
    status: 'ok',
    message: `${usedMB} / ${totalMB} MB`,
    lastCheck,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  }
}

function checkCPU(): HealthCheck {
  const lastCheck = new Date().toISOString()
  const load = os.loadavg()
  const cores = os.cpus().length
  const avg = (load[0] / cores * 100).toFixed(1)
  return {
    status: load[0] > cores ? 'degraded' : 'ok',
    message: `${avg}% (${cores} هسته)`,
    lastCheck,
    load1: load[0],
    load5: load[1],
    load15: load[2],
    cores,
  }
}

async function checkQueueStats(): Promise<{ pending: number; active: number; failed: number }> {
  const [pending, active, failed] = await Promise.all([
    prisma.job.count({ where: { status: 'pending' } }),
    prisma.job.count({ where: { status: 'processing' } }),
    prisma.job.count({ where: { status: 'failed' } }),
  ])
  return { pending, active, failed }
}

async function checkLastExecution(type: 'success' | 'failed') {
  try {
    const result = await prisma.automationResult.findFirst({
      where: { status: type },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, waybillNumber: true, plate: true },
    })
    return result?.finishedAt?.toISOString() ?? null
  } catch {
    return null
  }
}

async function checkLastWorkerHeartbeat() {
  try {
    const result = await prisma.workerStatus.aggregate({ _max: { lastHeartbeat: true } })
    return result._max.lastHeartbeat?.toISOString() ?? null
  } catch {
    return null
  }
}

async function getVersion(): Promise<string> {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return pkg.version ?? 'ناشناخته'
  } catch {
    return 'ناشناخته'
  }
}

export async function GET() {
  try {
    const [postgres, redis, bullmq, worker, playwright, sessions, website, memory, cpu, queueStats, version, lastSuccess, lastFailed, lastHeartbeat] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkBullMQ(),
      checkWorker(),
      checkPlaywright(),
      checkBrowserSessions(),
      checkWebsite(),
      checkMemory(),
      checkCPU(),
      checkQueueStats(),
      getVersion(),
      checkLastExecution('success'),
      checkLastExecution('failed'),
      checkLastWorkerHeartbeat(),
    ])

    const storage = checkStorage()

    const statuses = [postgres.status, redis.status, bullmq.status, worker.status, playwright.status, sessions.status, website.status]
    const overallStatus = statuses.includes('error')
      ? 'critical'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy'

    return NextResponse.json({
      overallStatus,
      timestamp: new Date().toISOString(),
      components: {
        postgresql: { ...postgres, label: 'پستگرس‌کیو‌ال' },
        redis: { ...redis, label: 'ردیس' },
        bullmq: { ...bullmq, label: 'بول‌ام‌کیو' },
        worker: { ...worker, label: 'ورکر' },
        playwright: { ...playwright, label: 'پلی‌ورایت' },
        browserSessions: { ...sessions, label: 'جلسات مرورگر' },
        website: { ...website, label: 'اتصال وب‌سایت' },
        storage: { ...storage, label: 'فضای ذخیره‌سازی' },
        memory: { ...memory, label: 'حافظه' },
        cpu: { ...cpu, label: 'پردازنده' },
        queueStats: {
          status: 'ok',
          lastCheck: new Date().toISOString(),
          label: 'صف وظایف',
          ...queueStats,
        },
        runningJobs: {
          status: 'ok',
          lastCheck: new Date().toISOString(),
          label: ' jobs در حال اجرا',
          count: queueStats.active,
        },
        failedJobs: {
          status: queueStats.failed > 0 ? 'degraded' : 'ok',
          lastCheck: new Date().toISOString(),
          label: ' jobs ناموفق',
          count: queueStats.failed,
        },
      },
      info: {
        version,
        lastSuccessfulExecution: lastSuccess,
        lastFailedExecution: lastFailed,
        lastDatabaseConnection: postgres.status === 'ok' ? new Date().toISOString() : null,
        lastRedisPing: redis.status === 'ok' ? new Date().toISOString() : null,
        lastWorkerHeartbeat: lastHeartbeat,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { overallStatus: 'critical', error: (e as Error).message },
      { status: 500 }
    )
  }
}
