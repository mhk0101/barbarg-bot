import { prisma } from '@/lib/prisma'

export interface AutomationSettings {
  maxConcurrent: number
  timeout: number
  workers: number
  headless: boolean
  actionDelay: number
  maxRetries: number
  retryIntervals: number[]
}

const DEFAULTS: AutomationSettings = {
  maxConcurrent: 3,
  timeout: 30000,
  workers: 3,
  headless: true,
  actionDelay: 45,
  maxRetries: 5,
  retryIntervals: [10, 30, 60, 120, 300],
}

let cachedSettings: AutomationSettings | null = null
let cacheTime = 0
const CACHE_TTL = 5000

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const now = Date.now()
  if (cachedSettings && now - cacheTime < CACHE_TTL) return cachedSettings

  try {
    const settings = await prisma.setting.findMany()
    const map = new Map<string, unknown>()
    for (const s of settings) map.set(s.key, s.value)

    cachedSettings = {
      maxConcurrent: Number(map.get('automation.maxConcurrent')) || DEFAULTS.maxConcurrent,
      timeout: (Number(map.get('automation.timeout')) || 30) * 1000,
      workers: Number(map.get('automation.workers')) || DEFAULTS.workers,
      headless: map.get('automation.headless') !== false,
      actionDelay: Number(map.get('automation.actionDelay')) || DEFAULTS.actionDelay,
      maxRetries: Number(map.get('retry.maxRetries')) || DEFAULTS.maxRetries,
      retryIntervals: String(map.get('retry.intervals') || '10,30,60,120,300').split(',').map((s) => parseInt(s.trim()) || 10),
    }
    cacheTime = now
    return cachedSettings
  } catch {
    return { ...DEFAULTS }
  }
}

export function clearSettingsCache() { cachedSettings = null }
